/**
 * Browser smoke test with Puppeteer:
 *  - loads the game, exercises the menu + class select + offline mode
 *  - then online mode against a real server instance
 *  - collects all console/page errors
 */
import puppeteer from 'puppeteer'
import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const errors = []
const log = (...a) => console.log('[browser]', ...a)

// Start the game server (offline mode doesn't need it, online does)
const gameServer = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: '3001' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
gameServer.stderr.on('data', (d) => process.stderr.write(`[game-server] ${d}`))

const vite = await createServer({ server: { port: 5174, strictPort: true } })
await vite.listen()
log('vite on :5174')

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

page.on('console', (m) => {
  if (m.type() === 'error') { errors.push(m.text()); log('CONSOLE ERROR:', m.text()) }
})
page.on('pageerror', (e) => { errors.push(String(e)); log('PAGE ERROR:', e.message) })
page.on('requestfailed', (r) => log('REQUEST FAILED:', r.url(), r.failure()?.errorText))
page.on('response', (r) => { if (r.status() >= 400) log('HTTP', r.status(), r.url()) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (msg) => { log('FAIL:', msg); process.exitCode = 1 }

try {
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' })
  await sleep(800)
  const menuVisible = await page.$eval('#menu', (el) => getComputedStyle(el).display)
  log('menu visible:', menuVisible)

  // ── OFFLINE FLOW ──
  await page.click('#btn-offline')
  await sleep(600)
  const classSelectVisible = await page.$eval('#class-select', (el) => getComputedStyle(el).display)
  log('class select visible:', classSelectVisible)
  await page.click('.class-card:nth-child(1)')
  await sleep(400)
  const blockerText = await page.$eval('#blocker', (el) => el.textContent).catch(() => 'missing')
  log('blocker shows play prompt:', /Click to Play/.test(blockerText))
  // click to lock pointer
  await page.click('#blocker')
  await sleep(2500)
  const locked = await page.evaluate(() => !!document.pointerLockElement)
  log('pointer locked:', locked)
  const hudVisible = await page.$eval('#hud', (el) => getComputedStyle(el).display)
  log('hud visible:', hudVisible)
  // walk forward + fire for a bit
  await page.keyboard.down('KeyW')
  await page.mouse.down({ button: 'left' })
  await sleep(2000)
  await page.keyboard.up('KeyW')
  await page.mouse.up({ button: 'left' })
  const hudText = await page.$eval('#hud', (el) => el.textContent).catch(() => '')
  log('hud has ammo display:', /ASSAULT RIFLE/.test(hudText))
  await sleep(500)

  // Spectate cycle: kill the player → death screen + spectate info → auto-respawn clears it
  await page.evaluate(() => window.__krunkerDebug.kill())
  await sleep(600)
  const specInfo = await page.$eval('#spectate-info', (el) => el.textContent).catch(() => '')
  log('spectate active:', /SPECTATING/.test(specInfo) ? specInfo.slice(0, 40) : 'none')
  await page.mouse.click(640, 400) // cycle spectator target
  await sleep(300)
  const specInfo2 = await page.$eval('#spectate-info', (el) => el.textContent).catch(() => '')
  log('spectate cycled:', specInfo2.slice(0, 40))
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    const d = await page.$eval('#death-screen', (el) => getComputedStyle(el).display).catch(() => '?')
    const s = await page.$eval('#spectate-info', (el) => el.textContent).catch(() => '')
    if (d === 'none') { log('respawned at ~' + (i + 1) * 0.5 + 's'); break }
    if (i === 9) log('STILL DEAD at 5s — spectate:', s.slice(0, 30))
  }

  // ── ONLINE FLOW ──
  // back to menu: reload page (simplest)
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' })
  await sleep(500)
  // Have a dummy client occupy a room so the lobby browser has a row to show
  const dummy = new WebSocket('ws://localhost:3001')
  await new Promise((res) => (dummy.onopen = res))
  dummy.send(JSON.stringify({ t: 'join', name: 'Dummy', cls: 0, room: null }))
  let dummyCode = ''
  dummy.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.t === 'welcome') dummyCode = m.room.c
  }
  await sleep(400)
  await page.click('#btn-online')
  await sleep(1200)
  const lobbyVisible = await page.$eval('#lobby', (el) => getComputedStyle(el).display).catch(() => '?')
  log('lobby visible:', lobbyVisible)
  const roomRows = await page.$$eval('.room-row', (els) => els.length).catch(() => 0)
  log('lobby room rows:', roomRows)

  // Deep-link: ?room=CODE auto-joins without the lobby (dummy still inside)
  log('deep-link code:', JSON.stringify(dummyCode))
  await page.goto(`http://localhost:5174/?room=${dummyCode}`, { waitUntil: 'networkidle2' })
  await sleep(1500)
  const dlLobby = await page.$eval('#lobby', (el) => getComputedStyle(el).display).catch(() => '?')
  const dlClass = await page.$eval('#class-select', (el) => getComputedStyle(el).display).catch(() => '?')
  const dlMenu = await page.$eval('#menu', (el) => getComputedStyle(el).display).catch(() => '?')
  const dlErr = await page.$eval('#menu-error', (el) => el.textContent).catch(() => '')
  const dlBlocker = await page.$eval('#blocker', (el) => el.textContent).catch(() => '')
  log('deep-link: lobby', dlLobby, '| class', dlClass, '| menu', dlMenu, '| err:', JSON.stringify(dlErr), '| blocker:', JSON.stringify(dlBlocker.slice(0, 60)))
  await page.waitForSelector('.class-card', { visible: true, timeout: 5000 })
  await page.click('.class-card:nth-child(2)')
  await sleep(2500)
  const connecting = await page.$eval('#blocker', (el) => el.textContent).catch(() => '')
  log('online blocker:', /Click to Play/.test(connecting) ? 'play prompt (connected)' : 'still connecting…')
  await page.click('#blocker')
  await sleep(3000)
  const onlineHud = await page.$eval('#hud', (el) => getComputedStyle(el).display).catch(() => '?')
  log('online hud visible:', onlineHud)
  // run + fire, expect some damage/killfeed activity in snapshots via HUD scoreboard
  await page.keyboard.down('KeyW')
  await page.mouse.down({ button: 'left' })
  await sleep(3000)
  await page.keyboard.up('KeyW')
  await page.mouse.up({ button: 'left' })
  // poll health — bots should damage the player in a few seconds
  let lowest = 100
  for (let i = 0; i < 15; i++) {
    const h = parseInt(await page.$eval('#health-num', (el) => el.textContent).catch(() => '100'), 10) || 100
    lowest = Math.min(lowest, h)
    if (lowest < 100) break
    await sleep(400)
  }
  log('online lowest health:', lowest, lowest < 100 ? '✓ bots dealing damage' : '⚠ no damage yet')
  const sbText = await page.$eval('#kill-feed', (el) => el.textContent).catch(() => '')
  log('killfeed sample:', JSON.stringify(sbText.slice(0, 80)))
  dummy.close()
  const netInfo = await page.$eval('#net-info', (el) => el.textContent).catch(() => '')
  log('net-info:', JSON.stringify(netInfo), /PING/.test(netInfo) ? '✓ ping readout' : '⚠ no ping yet')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
  await vite.close()
  gameServer.kill()
  await sleep(300)
  if (errors.length) { console.log('\nERRORS DURING TEST:', errors.length); process.exit(1) }
  console.log('\nNo client-side errors. Done.')
}
