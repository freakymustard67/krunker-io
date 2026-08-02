import * as THREE from 'three'
import PlayerController from './PlayerController.js'
import Weapon from './Weapon.js'
import World from './World.js'
import BotRender from './Bot.js'
import BulletFX from './BulletFX.js'
import SoundFX from './SoundFX.js'
import Equipment, { EquipmentSim } from './Equipment.js'
import HUD, { showClassSelect } from './HUD.js'
import NetClient from './net.js'
import {
  CLASSES, BOT_COUNT, BOT_NAMES, SCORE_KILL, SCORE_HEADSHOT, SCORE_MELEE,
  PLAYER_EYE,
} from '../shared/constants.js'
import { BURG } from '../shared/mapBurg.js'
import WeaponSim from '../shared/WeaponSim.js'
import BotSim from '../shared/BotSim.js'
import { randInt, rand } from '../shared/utils.js'
import { aimDir } from '../shared/combat.js'

// ─── Menu ────────────────────────────────────────────────────────────────────

const menu = document.getElementById('menu')
const nameInput = document.getElementById('name-input')
const menuError = document.getElementById('menu-error')
const lobbyEl = document.getElementById('lobby')
const lobbyError = document.getElementById('lobby-error')
const lobbyStatus = document.getElementById('lobby-status')
const roomListEl = document.getElementById('room-list')

let lobbyVisible = false

function randomName() {
  const base = BOT_NAMES[randInt(0, BOT_NAMES.length - 1)]
  return `${base}${randInt(10, 99)}`
}

nameInput.value = localStorage.getItem('krunker_name') || randomName()

function showMenuError(text) {
  if (menuError) {
    menuError.textContent = text
    menuError.style.display = 'block'
  }
}

document.getElementById('btn-offline').addEventListener('click', () => {
  localStorage.setItem('krunker_name', nameInput.value.trim() || 'Player')
  menu.style.display = 'none'
  startOffline()
})
let onlineStarted = false
document.getElementById('btn-online').addEventListener('click', () => {
  localStorage.setItem('krunker_name', nameInput.value.trim() || 'Player')
  menu.style.display = 'none'
  startOnline()
})

// Deep-link: ?room=CODE auto-joins that room on page load (no lobby)
if (new URLSearchParams(location.search).get('room')) {
  menu.style.display = 'none'
  startOnline()
}

// ─── Shared base (renderer / scene / world / audio) ─────────────────────────

function createBase() {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.prepend(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 220)
  const scene = new THREE.Scene()
  const world = new World(scene)
  const sfx = new SoundFX()
  const fx = new BulletFX(scene)
  return { renderer, camera, scene, world, sfx, fx }
}

function serverUrl() {
  const q = new URLSearchParams(location.search).get('server')
  if (q) return q
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.hostname}:3001`
}

function classColor(clsId) {
  return CLASSES.find((c) => c.id === clsId)?.color ?? 0x888888
}

const keyBits = (s) =>
  (s.forward ? 1 : 0) | (s.backward ? 2 : 0) | (s.left ? 4 : 0) | (s.right ? 8 : 0) |
  (s.jump ? 16 : 0) | (s.shift ? 32 : 0) | (s.crouch ? 64 : 0)

// ─── Lobby (room browser / create / join) ───────────────────────────────────

function setLobbyStatus(text) {
  if (lobbyStatus) lobbyStatus.textContent = text
}

function showLobbyError(text) {
  if (lobbyError) {
    lobbyError.textContent = text
    lobbyError.style.display = 'block'
  }
}

function hideLobbyError() {
  if (lobbyError) lobbyError.style.display = 'none'
}

function renderRoomList(net) {
  if (!roomListEl) return
  if (!net.roomList.length) {
    roomListEl.innerHTML = `<div id="room-empty">No public rooms yet — create one!</div>`
    return
  }
  roomListEl.innerHTML = net.roomList.map((r) => `
    <div class="room-row">
      <span class="r-name">${r.n}</span>
      <span class="r-code">${r.c}</span>
      <span class="r-count">${r.p}/${r.mx}</span>
      <button class="room-join" data-code="${r.c}">JOIN</button>
    </div>
  `).join('')
}

/**
 * Show the lobby and wait for the player to pick a path.
 * Resolves with a room code to join, or null if they went back to the menu.
 */
function lobbyAction(net) {
  return new Promise((resolve) => {
    const roomListTimer = setInterval(() => {
      if (lobbyVisible) net.listRooms()
    }, 2500)

    const done = (code) => {
      clearInterval(roomListTimer)
      cleanup()
      resolve(code)
    }
    const fail = (err) => {
      showLobbyError(err.message || 'Could not join room')
      net.listRooms()
    }

    function cleanup() {
      document.getElementById('btn-quick').removeEventListener('click', onQuick)
      document.getElementById('btn-create').removeEventListener('click', onCreate)
      document.getElementById('btn-join-code').removeEventListener('click', onJoinCode)
      document.getElementById('btn-lobby-back').removeEventListener('click', onBack)
      roomListEl.removeEventListener('click', onRoomClick)
    }

    async function onQuick() {
      hideLobbyError()
      setLobbyStatus('joining…')
      try {
        const welcome = await net.join({
          name: localStorage.getItem('krunker_name') || 'Player',
          cls: 0, room: null,
        })
        done(welcome.room?.c)
      } catch (err) { setLobbyStatus('connected'); fail(err) }
    }
    async function onCreate() {
      hideLobbyError()
      setLobbyStatus('creating room…')
      const name = document.getElementById('create-name').value.trim() || 'FFA Room'
      const priv = document.getElementById('create-priv').checked
      try {
        const created = await net.createRoom(name, priv)
        const welcome = await net.join({
          name: localStorage.getItem('krunker_name') || 'Player',
          cls: 0, room: created.code,
        })
        done(welcome.room?.c)
      } catch (err) { setLobbyStatus('connected'); fail(err) }
    }
    async function onJoinCode() {
      hideLobbyError()
      const code = document.getElementById('join-code').value.trim().toUpperCase()
      if (!code) return
      setLobbyStatus(`joining ${code}…`)
      try {
        const welcome = await net.join({
          name: localStorage.getItem('krunker_name') || 'Player',
          cls: 0, room: code,
        })
        done(welcome.room?.c)
      } catch (err) { setLobbyStatus('connected'); fail(err) }
    }
    function onBack() {
      hideLobbyError()
      done(null)
    }
    function onRoomClick(e) {
      const btn = e.target.closest('.room-join')
      if (!btn) return
      hideLobbyError()
      setLobbyStatus(`joining ${btn.dataset.code}…`)
      net.join({
        name: localStorage.getItem('krunker_name') || 'Player',
        cls: 0, room: btn.dataset.code,
      }).then((w) => done(w.room?.c)).catch(fail)
    }

    document.getElementById('btn-quick').addEventListener('click', onQuick)
    document.getElementById('btn-create').addEventListener('click', onCreate)
    document.getElementById('btn-join-code').addEventListener('click', onJoinCode)
    document.getElementById('btn-lobby-back').addEventListener('click', onBack)
    roomListEl.addEventListener('click', onRoomClick)
    net.on('rooms', () => {
      if (lobbyVisible) renderRoomList(net)
    })
    net.listRooms()
  })
}

// ─── Spectator (after death, first-person view of an alive player/bot) ──────

function makeSpectate(rebuild, rig = null) {
  return {
    active: false,
    targets: [],
    idx: 0,
    rig,
    rebuild,
    update(camera, dead) {
      if (dead !== this.active) {
        this.active = dead
        this.idx = 0
      }
      const info = document.getElementById('spectate-info')
      if (!this.active) {
        if (info) info.textContent = ''
        return
      }
      this.rebuild()
      const t = this.targets[this.idx % Math.max(1, this.targets.length)]
      if (!t) return
      // Detach from the dead player's camera rig, then take over the camera
      if (this.rig) {
        this.rig.position.set(0, 0, 0)
        this.rig.rotation.set(0, 0, 0)
      }
      camera.rotation.order = 'YXZ'
      camera.position.set(t.x, t.y, t.z)
      camera.rotation.set(t.pitch || 0, t.yaw, 0)
      if (info) info.textContent = `SPECTATING ${t.name.toUpperCase()} — CLICK TO SWITCH`
    },
    next() {
      if (this.targets.length) this.idx = (this.idx + 1) % this.targets.length
    },
  }
}

// ─── Shared render loop ──────────────────────────────────────────────────────

function startLoop(ctx) {
  const { base, player, weapon, gameState, hud, net, spectate } = ctx
  const { renderer, camera, scene, fx } = base
  const clock = new THREE.Clock()
  let lastFireHeld = false

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement && spectate?.active) {
      spectate.next()
    }
  })

  function animate() {
    requestAnimationFrame(animate)
    const dt = Math.min(clock.getDelta(), 0.05)
    gameState.fps = gameState.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1

    player.update(dt)

    // Spectate overrides the camera while dead
    if (spectate) spectate.update(camera, !player.alive && !gameState.matchEnded)

    // ADS FOV
    let targetFov = 80
    if (player.ads && player.alive) {
      targetFov = 80 / (weapon.current?.adsZoom || 1)
    }
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12)
    camera.updateProjectionMatrix()

    weapon.update(dt, player)

    // Fire input
    const fireHeld = player.mouseDown && player.alive && document.pointerLockElement && !gameState.matchEnded
    if (net?.connected) {
      if (ctx.onFrame) ctx.onFrame(net)
    } else if (fireHeld && ctx.fireLocal) {
      const w = weapon.current
      if (w?.auto || !lastFireHeld) ctx.fireLocal()
    }
    lastFireHeld = fireHeld

    if (ctx.onBots) ctx.onBots(dt)
    if (ctx.onEquipment) ctx.onEquipment(dt)

    hud.update(dt)
    fx.update(dt)
    renderer.render(scene, camera)
  }

  animate()
}

// ─── OFFLINE MODE (vs local bots) ────────────────────────────────────────────

async function startOffline() {
  const cls = await showClassSelect()
  const base = createBase()
  const { renderer, camera, scene, world, sfx, fx } = base
  const blocker = document.getElementById('blocker')

  const player = new PlayerController(camera, scene, BURG)
  player.applyClass(cls)
  const sp = BURG.spawnPoints[0]
  player.teleport(sp.x, sp.z)
  player.sim.name = 'You'

  const weapon = new Weapon(camera, scene, cls)
  weapon.sfx = sfx

  const wsim = new WeaponSim(cls)

  // Bots: shared sim + client renderer
  const bots = []
  const botRenders = []
  for (let i = 0; i < BOT_COUNT; i++) {
    const sp2 = BURG.spawnPoints[(i + 1) % BURG.spawnPoints.length]
    const bot = new BotSim(i, sp2, i % CLASSES.length)
    bots.push(bot)
    botRenders.push(new BotRender(scene, {
      name: bot.name, cls: bot.cls.id, color: bot.cls.color,
    }))
  }

  const nadesSim = new EquipmentSim({ boxes: BURG.collisionBoxes, bound: BURG.bound })
  const equipment = new Equipment(scene, { fx })

  const gameState = {
    world, bots, net: null, matchEnded: false, fps: 0,
    respawn: () => {
      if (gameState.matchEnded) return
      const s = BURG.spawnPoints[randInt(0, BURG.spawnPoints.length - 1)]
      player.teleport(s.x, s.z)
      wsim.resetAmmo()
      hud.hideDeath()
    },
    endMatch: () => {
      gameState.matchEnded = true
      const board = [
        { name: player.sim.name, score: player.score },
        ...bots.map((b) => ({ name: b.name, score: b.score })),
      ]
      board.sort((a, b) => b.score - a.score)
      hud.showMatchEnd(board[0]?.name || '???')
      document.exitPointerLock?.()
    },
    changeClass: async () => {
      document.exitPointerLock?.()
      const cls = await showClassSelect()
      player.applyClass(cls)
      weapon.setLoadout(cls)
      wsim.setClass(cls)
      gameState.respawn()
    },
  }
  const hud = new HUD(player, weapon, gameState)
  weapon.onReload = () => wsim.reload()
  weapon.onSwitch = (i) => {
    wsim.switchSlot(i)
    weapon.sync({ slot: wsim.slot, ammo: wsim.ammo, reloading: wsim.reloading })
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !gameState.matchEnded) gameState.changeClass()
  })

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyG' && document.pointerLockElement && player.alive) {
      nadesSim.throwFrom(player.sim)
    }
  })

  nadesSim.onEvent = (ev) => {
    if (ev.type !== 'boom') return
    equipment.onBoom(ev.pos)
    for (const d of ev.damages) {
      const isPlayer = d.target === player.sim
      const throwerIsPlayer = ev.thrower === player.sim
      if (!d.killed) continue
      if (isPlayer) {
        hud.addKill('[EXPLOSION]', 'You', false, false)
      } else if (throwerIsPlayer) {
        player.sim.kills++
        player.sim.score += SCORE_KILL
        hud.addKill('You', d.target.name, false, false)
      } else {
        hud.addKill(ev.thrower?.name || '[EXPLOSION]', d.target.name, false, false)
      }
    }
  }

  function tracerFromCamera(to, color) {
    const origin = new THREE.Vector3()
    camera.getWorldPosition(origin)
    fx.addTracer(origin, to, color)
  }

  function fireLocal() {
    const res = wsim.tryFire(player.sim, BURG.collisionBoxes, bots)
    if (!res.fired) return
    weapon.notifyShot(res.melee)
    if (res.melee && !res.hits.length) return

    const tracerColor = weapon.current?.id === 'sniper' ? 0xffffff : 0xffee44
    for (const h of res.hits) {
      weapon.notifyHit(h.headshot)
      fx.showScreenHitmarker(h.headshot)
      fx.addHitMarker(h.point)
      fx.addImpact(h.point, h.headshot ? 0xff0000 : 0xff3333, h.headshot ? 6 : 3)
      hud.showDamageNumber(h.point, h.dmg, h.headshot)
      tracerFromCamera(h.point, tracerColor)
    }
    for (const k of res.killed) {
      player.sim.kills++
      player.sim.score += SCORE_KILL + (k.headshot ? SCORE_HEADSHOT : 0) + (k.melee ? SCORE_MELEE : 0)
      hud.addKill('You', k.target.name, k.headshot, k.melee)
      sfx.kill()
    }
    if (!res.hits.length) {
      // Miss tracer: cosmetic raycast to world
      const origin = new THREE.Vector3()
      camera.getWorldPosition(origin)
      const dir = aimDir(player.yaw, player.pitch)
      const raycaster = new THREE.Raycaster(origin, dir, 0, 200)
      const hits = raycaster.intersectObjects(world.meshes, true)
      const end = hits.length ? hits[0].point : origin.clone().addScaledVector(dir, 150)
      fx.addTracer(origin, end, tracerColor)
    }
  }

  function botShotFX(info) {
    for (const s of info.hits) {
      fx.addHitMarker(s.point)
      fx.addTracer(info.origin, s.point, 0xff6644)
    }
  }

  const spectate = makeSpectate(() => {
    spectate.targets = bots
      .filter((b) => b.alive)
      .map((b) => ({
        name: b.name,
        x: b.pos.x, y: b.pos.y + PLAYER_EYE, z: b.pos.z,
        yaw: b.lookYaw, pitch: 0,
      }))
  }, player.yawObj)

  setupCommonUI(base, player, weapon, gameState, hud)
  // Test hook: simulate a death to exercise the spectate cycle
  window.__krunkerDebug = {
    kill() { player.sim.takeDamage(9999) },
  }

  startLoop({
    base, player, weapon, gameState, hud, net: null, spectate,
    fireLocal,
    onFrame: null,
    onBots: (dt) => {
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[i]
        bot.update(dt, {
          players: [player.sim],
          boxes: BURG.collisionBoxes,
          jumpPads: BURG.jumpPads,
          spawnPoints: BURG.spawnPoints,
          bound: BURG.bound,
          onShot: botShotFX,
        })
        botRenders[i].apply({
          x: bot.pos.x, y: bot.pos.y, z: bot.pos.z,
          alive: bot.alive, lookYaw: bot.lookYaw,
          speed: bot.horizontalSpeed, sliding: bot.sliding,
        })
      }
      // Soft separation vs bots
      if (player.alive) {
        for (const bot of bots) {
          if (!bot.alive) continue
          const dist = bot.pos.distanceTo(player.position)
          if (dist < 0.4 + 0.4 && dist > 0.01) {
            const push = new THREE.Vector3()
              .copy(player.position)
              .sub(bot.pos)
              .normalize()
              .multiplyScalar(dt * 4)
            player.position.x += push.x
            player.position.z += push.z
          }
        }
      }
      weapon.sync({ slot: wsim.slot, ammo: wsim.ammo, reloading: wsim.reloading })
    },
    onEquipment: (dt) => {
      nadesSim.update(dt, [player.sim, ...bots])
      equipment.sync(nadesSim.getState())
    },
  })

  showPlayPrompt(base, weapon)
  weapon.sync({ slot: wsim.slot, ammo: wsim.ammo, reloading: wsim.reloading })
}

// ─── ONLINE MODE (authoritative server + lobby) ─────────────────────────────

async function startOnline() {
  const url = serverUrl()
  const net = new NetClient()

  lobbyVisible = true
  lobbyEl.style.display = 'flex'
  setLobbyStatus(`connecting to ${url}…`)
  try {
    await net.connect(url)
  } catch (err) {
    lobbyVisible = false
    lobbyEl.style.display = 'none'
    menu.style.display = 'flex'
    showMenuError(`Could not connect to ${url}. Start the server with: npm run server`)
    return
  }
  setLobbyStatus('connected')

  const dlCode = new URLSearchParams(location.search).get('room')
  if (dlCode) {
    try {
      await net.join({
        name: localStorage.getItem('krunker_name') || 'Player',
        cls: 0, room: dlCode,
      })
    } catch (err) {
      lobbyVisible = false
      lobbyEl.style.display = 'none'
      menu.style.display = 'flex'
      showMenuError(err.message || 'Could not join room')
      return
    }
  } else {
    const code = await lobbyAction(net)
    if (code === null) {
      lobbyVisible = false
      lobbyEl.style.display = 'none'
      menu.style.display = 'flex'
      return
    }
  }

  lobbyVisible = false
  lobbyEl.style.display = 'none'
  await enterOnlineGame(net)
}

function setupCommonUI(base, player, weapon, gameState, hud) {
  const { renderer, camera } = base

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement && player.alive && !gameState.matchEnded) {
      // Offline semi-auto handled in the loop via edge detection; online via input stream.
    }
  })

  const blocker = document.getElementById('blocker')
  blocker.addEventListener('click', () => {
    if (gameState.matchEnded || base.connecting) return
    if (document.getElementById('class-select')?.style.display === 'flex') return
    renderer.domElement.requestPointerLock()
  })

  document.addEventListener('pointerlockchange', () => {
    const hudEl = document.getElementById('hud')
    if (document.pointerLockElement) {
      blocker.style.display = 'none'
      if (hudEl) hudEl.style.display = 'block'
    } else if (player.alive && !gameState.matchEnded) {
      const cs = document.getElementById('class-select')
      if (cs?.style.display === 'flex') return
      blocker.style.display = 'flex'
      blocker.innerHTML = `
        <h1>PAUSED</h1>
        <p>Click to resume</p>
        <p class="hint">WASD move · Space jump · Shift slide · C crouch · R reload<br>
        1/2/3 weapons · RMB aim · G grenade · M class · J inspect · Tab scoreboard</p>
      `
    }
  })

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

function showPlayPrompt(base, weapon) {
  const blocker = document.getElementById('blocker')
  blocker.style.display = 'flex'
  blocker.innerHTML = `
    <h1>KRUNKER.IO</h1>
    <p class="class-picked">${weapon.classDef.name}</p>
    <p>Click to Play</p>
    <p class="hint">WASD · Jump · Slide (Shift) · Crouch (C) · ADS (RMB)<br>
    1 Primary · 2 Pistol · 3 Knife · G Grenade · J Inspect · Tab Scores</p>
  `
  const hudEl = document.getElementById('hud')
  if (hudEl) hudEl.style.display = 'none'
}

async function enterOnlineGame(net) {
  const base = createBase()
  const { renderer, camera, scene, world, sfx, fx } = base
  const blocker = document.getElementById('blocker')

  const chosenClass = await showClassSelect()
  const clsIdx = CLASSES.indexOf(chosenClass)

  // Apply the picked class on the server (welcome used cls 0 as a placeholder)
  net.send({ t: 'act', cls: clsIdx })
  const welcome = { id: net.myId, name: net.myName, room: { c: net.roomCode, n: net.roomName } }

  const player = new PlayerController(camera, scene, BURG)
  player.applyClass(chosenClass)
  player.sim.name = welcome.name

  const weapon = new Weapon(camera, scene, chosenClass)
  weapon.sfx = sfx

  const equipment = new Equipment(scene, { fx })
  const playerRenders = new Map()
  const botRenders = new Map()

  const gameState = {
    world, bots: [], net, matchEnded: false, fps: 0,
    roomInfo: { code: welcome.room.c, name: welcome.room.n },
    respawn: () => { net.respawn() },
    endMatch: () => { gameState.matchEnded = true },
    changeClass: null,
  }
  const hud = new HUD(player, weapon, gameState)

  net.bindLocal(player.sim, (me) => {
    player.sim.vel.set(me.vx ?? 0, me.vy ?? 0, me.vz ?? 0)
  })

  weapon.onReload = () => net.send({ t: 'act', r: 1 })
  weapon.onSwitch = (i) => {
    net.send({ t: 'act', sw: i })
    weapon.sync({ slot: i, ammo: weapon.ammo, reloading: false })
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyG' && document.pointerLockElement && player.alive && !gameState.matchEnded) {
      net.send({ t: 'act', g: 1 })
    }
  })

  // Renders for remote players + bots as the roster arrives
  net.on('roster', (msg) => {
    for (const p of msg.players) {
      if (p.i === net.myId || playerRenders.has(p.i)) continue
      playerRenders.set(p.i, new BotRender(scene, {
        name: p.name, cls: p.cls, color: classColor(p.cls),
      }))
    }
    for (const b of msg.bots) {
      if (botRenders.has(b.i)) continue
      botRenders.set(b.i, new BotRender(scene, {
        name: b.name, cls: b.cls, color: classColor(b.cls),
      }))
    }
    gameState.bots = [...botRenders.values()]
  })

  net.on('snap', () => {
    const me = net.my
    if (!me) return
    // Health / alive / score sync (position is predicted locally)
    player.sim.health = me.hp
    if (me.a && !player.sim.alive) player.sim.alive = true
    if (!me.a && player.sim.alive) { player.sim.alive = false; player.sim.health = 0 }
    player.sim.respawnTimer = me.rt
    player.sim.kills = me.ks
    player.sim.score = me.sc
    player.sim.deaths = me.ds
    weapon.sync({ slot: me.slot, ammo: me.ammo, reloading: !!me.rel })
  })

  net.on('shot', (m) => {
    weapon.notifyShot(m.m === 1)
    if (!m.m) cosmeticTracer()
  })

  net.on('hit', (m) => {
    weapon.notifyHit(!!m.h)
    fx.showScreenHitmarker(!!m.h)
    const p = new THREE.Vector3(m.x, m.y, m.z)
    fx.addHitMarker(p)
    hud.showDamageNumber(p, m.d, !!m.h)
  })

  net.on('hitz', (m) => { player.flash() })
  net.on('kill', (m) => {
    hud.addKill(m.k, m.v, !!m.h, !!m.m)
    if (m.k2 === net.myId) sfx.kill()
  })
  net.on('die', (m) => {
    hud.setKiller(m.kn)
    hud.showDeath()
  })
  net.on('respawn', (m) => { if (m.i === net.myId) hud.hideDeath() })
  net.on('boom', (m) => { equipment.onBoom(new THREE.Vector3(m.x, m.y, m.z)) })
  net.on('end', (m) => {
    gameState.matchEnded = true
    hud.showMatchEnd(m.w)
    document.exitPointerLock?.()
  })
  net.on('newmatch', () => {
    hud.hideMatchEnd()
    gameState.matchEnded = false
  })
  net.on('close', () => {
    gameState.matchEnded = true
    hud.showMatchEnd('DISCONNECTED')
    document.exitPointerLock?.()
  })

  function cosmeticTracer() {
    const origin = new THREE.Vector3()
    camera.getWorldPosition(origin)
    const dir = aimDir(player.yaw, player.pitch)
    const raycaster = new THREE.Raycaster(origin, dir, 0, 200)
    const hits = raycaster.intersectObjects(world.meshes, true)
    const end = hits.length ? hits[0].point : origin.clone().addScaledVector(dir, 150)
    fx.addTracer(origin, end, 0xffee44)
  }

  const spectate = makeSpectate(() => {
    spectate.targets = []
    if (!net.latest) return
    for (const [id, render] of playerRenders) {
      const st = net.getInterp('players', id)
      const latest = net.latest.players.get(id)
      if (!st || !latest || !latest.a) continue
      spectate.targets.push({
        name: net.roster.players.get(id)?.name || 'Player',
        x: st.x, y: st.y + PLAYER_EYE, z: st.z,
        yaw: st.yaw, pitch: st.pitch || 0,
      })
    }
    for (const [id] of botRenders) {
      const st = net.getInterp('bots', id)
      const latest = net.latest.bots.get(id)
      if (!st || !latest || !latest.a) continue
      spectate.targets.push({
        name: net.roster.bots.get(id)?.name || 'Bot',
        x: st.x, y: st.y + PLAYER_EYE, z: st.z,
        yaw: st.yaw, pitch: 0,
      })
    }
  }, player.yawObj)

  setupCommonUI(base, player, weapon, gameState, hud)

  startLoop({
    base, player, weapon, gameState, hud, net, spectate,
    fireLocal: null,
    onFrame: () => {
      net.sendInput(
        keyBits(player.keys), player.yaw, player.pitch,
        player.mouseDown && player.alive && document.pointerLockElement && !gameState.matchEnded,
        player.ads,
      )
    },
    onBots: () => {
      // Remote players
      for (const [id, render] of playerRenders) {
        const st = net.getInterp('players', id)
        const latest = net.latest?.players.get(id)
        if (!st || !latest) continue
        render.apply({
          x: st.x, y: st.y, z: st.z, alive: !!latest.a, lookYaw: st.yaw,
          speed: Math.hypot(latest.vx || 0, latest.vz || 0), sliding: false,
        })
      }
      // Bots
      for (const [id, render] of botRenders) {
        const st = net.getInterp('bots', id)
        const latest = net.latest?.bots.get(id)
        if (!st || !latest) continue
        render.apply({
          x: st.x, y: st.y, z: st.z, alive: !!latest.a, lookYaw: st.yaw,
          speed: Math.hypot(latest.vx || 0, latest.vz || 0), sliding: !!latest.sl,
        })
      }
      // Own weapon state comes from net.on('snap')
      weapon.sync({ slot: net.my?.slot ?? 0, ammo: net.my?.ammo ?? weapon.ammo, reloading: !!net.my?.rel })
    },
    onEquipment: () => {
      equipment.sync(net.latest?.nades || [])
    },
  })

  showPlayPrompt(base, weapon)
}
