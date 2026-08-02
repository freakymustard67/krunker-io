/**
 * Headless smoke test: boots the game server, exercises the lobby protocol
 * (room list, create, join-by-code, bad codes, ping) and asserts the full
 * gameplay loop (snapshots, movement, weapons, grenades, combat).
 */
import { spawn } from 'node:child_process'

const PORT = 3101
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const proc = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
proc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))

function connect(name, cls, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    const client = { ws, name, welcome: null, snaps: [], events: [], seq: 0, lastPos: null }
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5000)
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, cls, room: room || null }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.t === 'welcome') { client.welcome = msg; clearTimeout(timer); resolve(client) }
      else if (msg.t === 'snap') {
        client.snaps.push(msg)
        const me = msg.players.find((p) => p.i === client.welcome.id)
        if (me) client.lastPos = me
      } else client.events.push(msg)
    }
    ws.onerror = (err) => reject(err)
  })
}

function sendInput(c, { k = 0, y = 0, p = 0, f = 0, a = 0 } = {}) {
  c.seq++
  c.ws.send(JSON.stringify({ t: 'i', s: c.seq, k, y, p, f, a }))
}

function waitFor(client, pred, ms = 4000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms
    const poll = () => {
      if (client.welcome && pred(client)) return resolve(true)
      if (Date.now() > deadline) return resolve(false)
      setTimeout(poll, 50)
    }
    poll()
  })
}

let a, b
try {
  check('server process started', proc.exitCode === null)
  await sleep(500)
  a = await connect('Alice', 0, null)
  check('client A welcome (auto-match room)', !!a.welcome, `room=${a.welcome.room.c}`)
  const roomCode = a.welcome.room.c

  // Room list includes the auto-created room
  a.ws.send(JSON.stringify({ t: 'list' }))
  await waitFor(a, () => a.events.some((e) => e.t === 'rooms'), 3000)
  const roomsMsg = a.events.find((e) => e.t === 'rooms')
  const listed = roomsMsg?.rooms?.some((r) => r.c === roomCode)
  check('room list shows the room', !!listed, `n=${roomsMsg?.rooms?.length}`)

  // Private room + create + join by code
  const c = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    const client = { ws, events: [] }
    const timer = setTimeout(() => reject(new Error('C connect timeout')), 5000)
    ws.onopen = () => ws.send(JSON.stringify({ t: 'create', name: 'Secret Room', priv: true }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      client.events.push(msg)
      if (msg.t === 'created') {
        clearTimeout(timer)
        ws.send(JSON.stringify({ t: 'join', name: 'Carol', cls: 1, room: msg.c }))
      }
      if (msg.t === 'welcome') { client.welcome = msg; client.code = msg.room.c; resolve(client) }
    }
    ws.onerror = reject
  })
  check('create + join private room by code', c.welcome?.room?.n === 'Secret Room', `code=${c.code}`)
  check('private room not listed', !roomsMsg?.rooms?.some((r) => r.c === c.code))

  // Bad room code rejected
  const d = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`)
    const timer = setTimeout(() => reject(new Error('D connect timeout')), 5000)
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: 'Dave', cls: 0, room: 'ZZZZ' }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.t === 'noroom') { clearTimeout(timer); resolve(msg) }
    }
    ws.onerror = reject
  })
  check('bad room code → noroom', d.c === 'ZZZZ')
  d?.ws?.close()

  // Bob joins Alice's room by code
  b = await connect('Bob', 4, roomCode)
  check('client B joins by code', b.welcome?.room?.c === roomCode, `id=${b.welcome.id}`)

  await sleep(400)
  check('snapshots arrive', a.snaps.length > 2, `${a.snaps.length} received`)
  const first = a.snaps[a.snaps.length - 1]
  check('snapshot has both players', first.players.length === 2, `n=${first.players.length}`)
  check('snapshot has bots', first.bots.length === 8, `n=${first.bots.length}`)
  check('snapshot has match timer', typeof first.match === 'number' && first.match > 0)

  // Walk toward map center holding fire — converges with patrolling bots.
  // Alice may get spawn-killed (dead players ignore inputs server-side), so
  // keep checking for displacement over a longer window.
  const start = { ...a.lastPos }
  const yawToCenter = Math.atan2(start.x, start.z) // forward = (-sin yaw, -cos yaw) → toward center
  const interval = setInterval(() => sendInput(a, { k: 1, y: yawToCenter, f: 1 }), 33)
  const intervalB = setInterval(() => sendInput(b, { k: 1, y: yawToCenter + 2.0, f: 0 }), 33)
  let moved = 0
  for (let i = 0; i < 12; i++) {
    await sleep(400)
    const p = a.lastPos
    moved = Math.hypot(p.x - start.x, p.z - start.z)
    if (moved > 5) break
  }
  clearInterval(interval); clearInterval(intervalB)
  check('client A moved', moved > 5, `moved ${moved.toFixed(1)} units`)

  // Discrete actions
  b.ws.send(JSON.stringify({ t: 'act', sw: 2 }))
  await sleep(400)
  const bEntry = a.snaps[a.snaps.length - 1].players.find((p) => p.i === b.welcome.id)
  check('weapon switch applied', bEntry.slot === 2, `slot=${bEntry.slot}`)
  b.ws.send(JSON.stringify({ t: 'act', g: 1 }))
  await sleep(600)
  check('grenade visible in snapshots', a.snaps.some((s) => s.nades.length > 0))

  // Class change via act cls
  b.ws.send(JSON.stringify({ t: 'act', cls: 0 }))
  await sleep(300)
  const bAfterCls = a.snaps[a.snaps.length - 1].players.find((p) => p.i === b.welcome.id)
  check('class change applied', bAfterCls.hp === 100 && bAfterCls.sc >= 0, `hp=${bAfterCls.hp}`)

  // Combat: Alice hunts the nearest bot while firing — bots also shoot her.
  // Combat proven by: her hp dropping, a kill event, or a die event.
  let combat = false
  const combatDeadline = Date.now() + 9000
  while (Date.now() < combatDeadline) {
    const latest = a.snaps[a.snaps.length - 1]
    const me = latest?.players.find((p) => p.i === a.welcome.id)
    if (me && me.hp < 100) { combat = true; break }
    if (a.events.some((e) => e.t === 'kill' || e.t === 'die')) { combat = true; break }
    if (latest?.bots?.length) {
      const aliveBots = latest.bots.filter((b2) => b2.a)
      if (aliveBots.length) {
        const bot = aliveBots.reduce((n, b2) =>
          Math.hypot(b2.x - me.x, b2.z - me.z) < Math.hypot(n.x - me.x, n.z - me.z) ? b2 : n)
        const yawToBot = Math.atan2(me.x - bot.x, me.z - bot.z)
        sendInput(a, { k: 1, y: yawToBot, f: 1 })
      }
    }
    await sleep(250)
  }
  check('bots deal damage to players', combat, a.snaps[a.snaps.length - 1]?.players.find((p) => p.i === a.welcome.id)?.hp + ' hp')

  // Ping: protocol ping fires every 3s; pong is instant. Wait for pg > 0.
  let pingSeen = false
  const pingDeadline = Date.now() + 6000
  while (Date.now() < pingDeadline) {
    if (a.snaps.some((s) => s.players.some((p) => (p.pg || 0) > 0))) { pingSeen = true; break }
    await sleep(200)
  }
  check('ping measured via protocol ping', pingSeen, a.snaps[a.snaps.length - 1]?.players[0]?.pg + 'ms')

  // Event types seen so far
  const eventTypes = [...new Set(a.events.map((e) => e.t))]
  check('event stream active', eventTypes.includes('shot'), eventTypes.join(',') || 'none')

  check('no server crash', proc.exitCode === null)
  c?.ws?.close()
} catch (err) {
  check('test execution', false, err.message)
} finally {
  try { a?.ws.close() } catch {}
  try { b?.ws.close() } catch {}
  proc.kill()
  await sleep(300)
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}
