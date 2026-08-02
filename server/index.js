/**
 * Krunker.io multiplayer server.
 *
 * Authoritative simulation: multiple concurrent rooms, each running its own
 * players + bots + grenades at 60Hz. Clients connect to the server, browse
 * the public room list (or create/join by code), then join a room. They
 * receive 20Hz snapshots + event messages.
 *
 * Run with:  npm run server   (PORT env to override, default 3001)
 */
import { WebSocketServer } from 'ws'
import {
  CLASSES, BOT_COUNT, MATCH_TIME,
  SCORE_KILL, SCORE_HEADSHOT, SCORE_MELEE,
} from '../shared/constants.js'
import { BURG } from '../shared/mapBurg.js'
import PlayerSim from '../shared/PlayerSim.js'
import WeaponSim from '../shared/WeaponSim.js'
import BotSim from '../shared/BotSim.js'
import EquipmentSim from '../shared/EquipmentSim.js'
import { randInt, clamp } from '../shared/utils.js'

const PORT = Number(process.env.PORT || 3001)
const TICK_MS = 1000 / 60
const DT = 1 / 60
const SNAP_EVERY = 3 // 20Hz snapshots
const MAX_PLAYERS = 12
const MAX_ROOMS = 8
const PING_EVERY = 60 * 3 // ticks (3s) between protocol-level pings
const RESTART_DELAY = 8
const PITCH_LIMIT = 1.45
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1

const ctx = {
  boxes: BURG.collisionBoxes,
  jumpPads: BURG.jumpPads,
  spawnPoints: BURG.spawnPoints,
  bound: BURG.bound,
}

const rooms = new Map() // code → room
const entByWs = new Map() // ws → ent
const entBySim = new Map() // sim → ent

// ─── Rooms ───────────────────────────────────────────────────────────────────

function makeCode() {
  for (let i = 0; i < 50; i++) {
    let code = ''
    for (let j = 0; j < 4; j++) {
      code += CODE_ALPHABET[randInt(0, CODE_ALPHABET.length - 1)]
    }
    if (!rooms.has(code)) return code
  }
  return String(rooms.size + 1)
}

function makeRoom(name, priv) {
  const code = makeCode()
  const room = {
    code,
    name,
    priv,
    players: new Map(), // id → ent
    bots: [],
    nades: new EquipmentSim({ boxes: BURG.collisionBoxes, bound: BURG.bound }),
    time: 0,
    matchTime: MATCH_TIME,
    phase: 'live', // 'live' | 'ending'
    endTimer: 0,
    nextId: 1,
    tickCount: 0,
  }
  setupBots(room)
  room.nades.onEvent = (ev) => handleNadeEvent(room, ev)
  rooms.set(code, room)
  return room
}

/** Matchmaking: join the fullest public room with space, else create one. */
function findOrCreateRoom() {
  let best = null
  for (const room of rooms.values()) {
    if (room.priv) continue
    if (room.players.size >= MAX_PLAYERS) continue
    if (!best || room.players.size > best.players.size) best = room
  }
  return best || makeRoom(`FFA #${Math.floor(Math.random() * 900 + 100)}`, false)
}

function roomListMessage() {
  const list = []
  for (const room of rooms.values()) {
    if (room.priv) continue
    list.push({
      c: room.code,
      n: room.name,
      p: room.players.size,
      mx: MAX_PLAYERS,
      ph: room.phase,
      mt: Math.max(0, room.matchTime),
    })
  }
  return { t: 'rooms', rooms: list }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function setupBots(room) {
  room.bots = []
  for (let i = 0; i < BOT_COUNT; i++) {
    const sp = BURG.spawnPoints[(i + 1) % BURG.spawnPoints.length]
    const bot = new BotSim(i, sp, i % CLASSES.length)
    room.bots.push(bot)
  }
}

function spawnFor() {
  return BURG.spawnPoints[randInt(0, BURG.spawnPoints.length - 1)]
}

// ─── Messaging ───────────────────────────────────────────────────────────────

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function broadcast(room, msg, exceptWs = null) {
  const str = JSON.stringify(msg)
  for (const ent of room.players.values()) {
    if (ent.ws !== exceptWs && ent.ws.readyState === 1) ent.ws.send(str)
  }
}

function roster(room) {
  return {
    players: [...room.players.values()].map((p) => ({
      i: p.id, name: p.name, cls: CLASSES[p.clsIdx].id,
    })),
    bots: room.bots.map((b) => ({ i: b.index, name: b.name, cls: b.cls.id })),
  }
}

// ─── Players ─────────────────────────────────────────────────────────────────

function sanitizeName(name) {
  return String(name || '').replace(/[<>]/g, '').trim().slice(0, 20) || 'Player'
}

function addPlayer(ws, msg) {
  let room = null
  if (msg.room) {
    const code = String(msg.room).toUpperCase().slice(0, 8)
    room = rooms.get(code)
    if (!room) {
      send(ws, { t: 'noroom', c: code })
      return null
    }
  } else {
    room = findOrCreateRoom()
  }
  if (room.players.size >= MAX_PLAYERS) {
    send(ws, { t: 'full' })
    return null
  }

  const id = room.nextId++
  const name = sanitizeName(msg.name)
  const clsIdx = clamp(Number(msg.cls ?? 0) | 0, 0, CLASSES.length - 1)

  const sim = new PlayerSim()
  sim.applyClass(CLASSES[clsIdx])
  sim.name = name
  const sp = spawnFor()
  sim.teleport(sp.x, sp.z)

  const weapon = new WeaponSim(CLASSES[clsIdx])
  const ent = {
    ws, room, sim, weapon, name, clsIdx, id,
    input: null, ack: 0, prevFire: false, lastInputTime: 0, ping: 0,
  }
  room.players.set(id, ent)
  entByWs.set(ws, ent)
  entBySim.set(sim, ent)

  send(ws, {
    t: 'welcome', id, name, cls: clsIdx, map: 'burg',
    time: room.time, matchTime: Math.max(0, room.matchTime), phase: room.phase,
    room: { c: room.code, n: room.name },
  })
  send(ws, { t: 'roster', ...roster(room) })
  broadcast(room, { t: 'roster', ...roster(room) }, ws)
  console.log(`+ ${name} joined room ${room.code} (${room.players.size}/${MAX_PLAYERS})`)
  return ent
}

function removePlayer(ws) {
  const ent = entByWs.get(ws)
  if (!ent) return
  const room = ent.room
  entByWs.delete(ws)
  entBySim.delete(ent.sim)
  room.players.delete(ent.id)
  console.log(`- ${ent.name} left room ${room.code} (${room.players.size} players)`)
  broadcast(room, { t: 'roster', ...roster(room) })
  if (room.players.size === 0) rooms.delete(room.code)
}

function respawnPlayer(room, ent) {
  const sp = spawnFor()
  ent.sim.teleport(sp.x, sp.z)
  ent.weapon.resetAmmo()
  broadcast(room, { t: 'respawn', i: ent.id })
}

function applyInput(ent, inp) {
  const s = ent.sim
  s.keys.forward = !!(inp.k & 1)
  s.keys.backward = !!(inp.k & 2)
  s.keys.left = !!(inp.k & 4)
  s.keys.right = !!(inp.k & 8)
  s.keys.jump = !!(inp.k & 16)
  s.keys.shift = !!(inp.k & 32)
  s.keys.crouch = !!(inp.k & 64)
  s.ads = !!inp.a
  s.yaw = Number(inp.y) || 0
  s.pitch = clamp(Number(inp.p) || 0, -PITCH_LIMIT, PITCH_LIMIT)
  if (typeof inp.sw === 'number' && inp.sw >= 0) ent.weapon.switchSlot(inp.sw | 0)
  if (inp.r) ent.weapon.reload()
  if (inp.g) throwGrenade(ent)
  ent.ack = inp.s | 0
}

function throwGrenade(ent) {
  ent.room.nades.throwFrom(ent.sim)
}

// ─── Combat / scoring ────────────────────────────────────────────────────────

function handleFire(room, ent) {
  const targets = []
  for (const other of room.players.values()) {
    if (other.sim !== ent.sim && other.sim.alive) targets.push(other.sim)
  }
  const res = ent.weapon.tryFire(ent.sim, ctx.boxes, targets)
  if (!res.fired) return
  send(ent.ws, { t: 'shot', m: res.melee ? 1 : 0 })

  for (const h of res.hits) {
    send(ent.ws, { t: 'hit', d: h.dmg, h: h.headshot ? 1 : 0, x: h.point.x, y: h.point.y, z: h.point.z })
    const vEnt = entBySim.get(h.target)
    if (vEnt) send(vEnt.ws, { t: 'hitz', d: h.dmg })
  }
  for (const k of res.killed) {
    const vEnt = entBySim.get(k.target)
    scoreKill(room, ent, vEnt, k.headshot, k.melee)
    broadcast(room, {
      t: 'kill',
      k: ent.name, v: vEnt ? vEnt.name : k.target.name,
      k2: ent.id, v2: vEnt ? vEnt.id : -1,
      h: k.headshot ? 1 : 0, m: k.melee ? 1 : 0,
    })
    if (vEnt) send(vEnt.ws, { t: 'die', k2: ent.id, kn: ent.name })
  }
}

function scoreKill(room, killerEnt, victimEnt, headshot, melee) {
  killerEnt.sim.kills++
  killerEnt.sim.score += SCORE_KILL + (headshot ? SCORE_HEADSHOT : 0) + (melee ? SCORE_MELEE : 0)
  if (victimEnt) victimEnt.sim.deaths++
}

function handleBotKill(room, bot) {
  if (!bot.lastKill) return
  const vEnt = entBySim.get(bot.lastKill.target)
  broadcast(room, {
    t: 'kill',
    k: bot.name, v: vEnt ? vEnt.name : bot.lastKill.target.name,
    k2: -1, v2: vEnt ? vEnt.id : -1,
    h: bot.lastKill.headshot ? 1 : 0, m: 0,
  })
  if (vEnt) send(vEnt.ws, { t: 'die', k2: -1, kn: bot.name })
  bot.lastKill = null
}

// ─── Match lifecycle ─────────────────────────────────────────────────────────

function topScorerName(room) {
  let bestName = 'No one'
  let bestScore = -Infinity
  for (const ent of room.players.values()) {
    if (ent.sim.score > bestScore) { bestScore = ent.sim.score; bestName = ent.name }
  }
  for (const bot of room.bots) {
    if (bot.score > bestScore) { bestScore = bot.score; bestName = bot.name }
  }
  return bestName
}

function endMatch(room) {
  room.phase = 'ending'
  room.endTimer = RESTART_DELAY
  broadcast(room, { t: 'end', w: topScorerName(room) })
}

function startNewMatch(room) {
  room.phase = 'live'
  room.matchTime = MATCH_TIME
  for (const ent of room.players.values()) {
    ent.sim.score = 0
    ent.sim.kills = 0
    ent.sim.deaths = 0
    const sp = spawnFor()
    ent.sim.teleport(sp.x, sp.z)
    ent.weapon.resetAmmo()
  }
  for (let i = 0; i < room.bots.length; i++) {
    const sp = BURG.spawnPoints[(i + 1) % BURG.spawnPoints.length]
    room.bots[i].resetMatch(sp)
  }
  broadcast(room, { t: 'newmatch', matchTime: room.matchTime })
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

const r2 = (v) => Math.round(v * 100) / 100

function snapshot(room) {
  const players = []
  for (const ent of room.players.values()) {
    const s = ent.sim
    players.push({
      i: ent.id,
      x: r2(s.pos.x), y: r2(s.pos.y), z: r2(s.pos.z),
      yaw: r2(s.yaw), pitch: r2(s.pitch),
      hp: Math.max(0, Math.ceil(s.health)),
      a: s.alive ? 1 : 0, rt: r2(s.respawnTimer),
      slot: ent.weapon.slot, ammo: ent.weapon.ammo, rel: ent.weapon.reloading ? 1 : 0,
      ks: s.kills, sc: s.score, ds: s.deaths,
      vx: r2(s.vel.x), vy: r2(s.vel.y), vz: r2(s.vel.z),
      ack: ent.ack, pg: Math.round(ent.ping || 0),
    })
  }
  const bots = []
  for (const b of room.bots) {
    bots.push({
      i: b.index,
      x: r2(b.pos.x), y: r2(b.pos.y), z: r2(b.pos.z),
      yaw: r2(b.lookYaw),
      a: b.alive ? 1 : 0,
      ks: b.kills, sc: b.score, ds: b.deaths,
      vx: r2(b.vel.x), vz: r2(b.vel.z),
      sl: b.sliding ? 1 : 0,
    })
  }
  return {
    t: 'snap',
    time: room.time,
    match: Math.max(0, room.matchTime),
    players,
    bots,
    nades: room.nades.getState(),
  }
}

// ─── Grenade events ──────────────────────────────────────────────────────────

function handleNadeEvent(room, ev) {
  if (ev.type !== 'boom') return
  const killerEnt = ev.thrower ? entBySim.get(ev.thrower) : null
  broadcast(room, { t: 'boom', x: ev.pos.x, y: ev.pos.y, z: ev.pos.z })
  for (const d of ev.damages) {
    const vEnt = entBySim.get(d.target)
    if (d.killed) {
      if (killerEnt) {
        scoreKill(room, killerEnt, vEnt, false, false)
        broadcast(room, {
          t: 'kill',
          k: killerEnt.name, v: vEnt ? vEnt.name : d.target.name,
          k2: killerEnt.id, v2: vEnt ? vEnt.id : -1, h: 0, m: 0,
        })
      }
      if (vEnt) {
        send(vEnt.ws, { t: 'die', k2: killerEnt ? killerEnt.id : -1, kn: killerEnt ? killerEnt.name : 'EXPLOSION' })
      }
    } else if (vEnt) {
      send(vEnt.ws, { t: 'hitz', d: d.dmg })
    }
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

function tick() {
  for (const room of rooms.values()) {
    room.time += DT
    room.tickCount++

    if (room.phase === 'live') {
      // 1. Player inputs + movement
      for (const ent of room.players.values()) {
        const s = ent.sim
        if (!s.alive) {
          s.respawnTimer -= DT
          if (s.respawnTimer <= 0) respawnPlayer(room, ent)
          continue
        }
        const inp = ent.input
        ent.input = null
        if (inp) {
          ent.lastInputTime = room.time
          applyInput(ent, inp)
          const w = ent.weapon.current
          const wantFire = !!inp.f
          if (wantFire && (w.auto || !ent.prevFire) && ent.weapon.canFire()) {
            handleFire(room, ent)
          }
          ent.prevFire = wantFire
        } else if (room.time - ent.lastInputTime > 2) {
          // Connection hiccup → stop ghost movement
          s.keys.forward = s.keys.backward = s.keys.left = s.keys.right = false
          s.keys.jump = s.keys.shift = s.keys.crouch = false
          s.ads = false
        }
        s.update(DT, ctx)
        ent.weapon.update(DT) // advance weapon timers (fire rate / reloads)
      }

      // 2. Bots (targets = all player sims)
      const playerSims = []
      for (const ent of room.players.values()) playerSims.push(ent.sim)
      for (const bot of room.bots) {
        bot.update(DT, { ...ctx, players: playerSims })
        handleBotKill(room, bot)
      }

      // 3. Grenades
      room.nades.update(DT, playerSims)

      // 4. Match timer
      room.matchTime -= DT
      if (room.matchTime <= 0) endMatch(room)
    } else if (room.phase === 'ending') {
      room.endTimer -= DT
      if (room.endTimer <= 0) startNewMatch(room)
    }

    // Protocol-level ping every few seconds (auto pong at the WS layer)
    if (room.tickCount % PING_EVERY === 0) {
      for (const ent of room.players.values()) {
        ent.pingAt = Date.now()
        try { ent.ws.ping() } catch { /* noop */ }
      }
    }

    if (room.tickCount % SNAP_EVERY === 0) {
      broadcast(room, snapshot(room))
    }
  }

  // Reap empty rooms after ticking (safety net; removePlayer also reaps)
  for (const [code, room] of rooms) {
    if (room.players.size === 0) rooms.delete(code)
  }
}

// ─── Socket handling ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT })
wss.on('connection', (ws) => {
  ws.on('pong', () => {
    const ent = entByWs.get(ws)
    if (!ent || !ent.pingAt) return
    const rtt = Date.now() - ent.pingAt
    ent.ping = ent.ping ? Math.round(ent.ping * 0.7 + rtt * 0.3) : rtt
  })
  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (msg.t === 'join') {
      addPlayer(ws, msg)
      return
    }
    if (msg.t === 'list') {
      send(ws, roomListMessage())
      return
    }
    if (msg.t === 'create') {
      const name = sanitizeName(msg.name) || `FFA #${Math.floor(Math.random() * 900 + 100)}`
      if (rooms.size >= MAX_ROOMS) {
        send(ws, { t: 'norooms' })
        return
      }
      const room = makeRoom(name, !!msg.priv)
      send(ws, { t: 'created', c: room.code, n: room.name })
      return
    }
    const ent = entByWs.get(ws)
    if (!ent) return
    if (msg.t === 'i') {
      ent.input = msg
    } else if (msg.t === 'act') {
      if (typeof msg.sw === 'number') ent.weapon.switchSlot(msg.sw | 0)
      if (msg.r) ent.weapon.reload()
      if (msg.g) throwGrenade(ent)
      if (typeof msg.cls === 'number') {
        ent.clsIdx = clamp(msg.cls | 0, 0, CLASSES.length - 1)
        ent.sim.applyClass(CLASSES[ent.clsIdx])
        ent.weapon.setClass(CLASSES[ent.clsIdx])
        broadcast(ent.room, { t: 'roster', ...roster(ent.room) })
      }
    } else if (msg.t === 'respawn') {
      if (!ent.sim.alive) respawnPlayer(ent.room, ent)
    }
  })
  ws.on('close', () => removePlayer(ws))
  ws.on('error', () => {})
})

setInterval(tick, TICK_MS)
console.log(`Krunker server listening on ws://localhost:${PORT} (${MAX_ROOMS} rooms max)`)
