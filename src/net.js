/**
 * Multiplayer client: WebSocket connection, input streaming, client-side
 * prediction with server reconciliation, and snapshot interpolation for
 * remote entities (players + bots).
 *
 * Connection flow:
 *   connect(url)            → resolves once the WS is open (lobby state)
 *   listRooms()             → refresh this.roomList (public rooms)
 *   createRoom(name, priv)  → resolves with { code, name }
 *   join({ name, cls, room }) → resolves on 'welcome', rejects on full/noroom
 */
const INTERP_MS = 100
const MAX_SNAPSHOTS = 120
const CORRECTION_DIST = 0.45

export default class NetClient {
  constructor() {
    this.ws = null
    this.connected = false
    this.myId = -1
    this.myName = ''
    this.roomCode = ''
    this.roomName = ''
    this.roomList = [] // public rooms from the lobby browser
    this.seq = 0
    this.pending = [] // { seq, x, z } predicted positions at send time
    this.snapshots = []
    this.latest = null
    this.roster = { players: new Map(), bots: new Map() }
    this.localSim = null
    this.onCorrection = null
    this._offset = 0
    this.listeners = new Map()
    this._joinResolve = null
    this._joinReject = null
    this._createResolve = null
    this._createReject = null
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }

  _emit(type, msg) {
    const list = this.listeners.get(type)
    if (list) for (const fn of list) fn(msg)
  }

  /** Open the connection. Resolves on open, rejects on error/timeout. */
  connect(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)
      const timeout = setTimeout(() => {
        try { this.ws.close() } catch { /* noop */ }
        reject(new Error('Connection timed out'))
      }, 8000)

      this.ws.onopen = () => {
        this.connected = true
        clearTimeout(timeout)
        resolve(this)
      }
      this.ws.onmessage = (e) => {
        let msg
        try { msg = JSON.parse(e.data) } catch { return }
        this._handle(msg)
      }
      this.ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Connection failed'))
      }
      this.ws.onclose = () => {
        this.connected = false
        this._emit('close', {})
      }
    })
  }

  /**
   * Join a room. Pass room: undefined/null to auto-match (server picks the
   * fullest public room or creates one). Resolves with the welcome message.
   */
  join(joinInfo) {
    return new Promise((resolve, reject) => {
      this._joinResolve = resolve
      this._joinReject = reject
      setTimeout(() => {
        if (this._joinReject) {
          this._joinReject(new Error('Join timed out'))
          this._joinResolve = this._joinReject = null
        }
      }, 8000)
      this.send({ t: 'join', name: joinInfo.name, cls: joinInfo.cls, room: joinInfo.room || null })
    })
  }

  /** Create a room. Resolves with { code, name }. */
  createRoom(roomName, priv = false) {
    return new Promise((resolve, reject) => {
      this._createResolve = resolve
      this._createReject = reject
      setTimeout(() => {
        if (this._createReject) {
          this._createReject(new Error('Create timed out'))
          this._createResolve = this._createReject = null
        }
      }, 8000)
      this.send({ t: 'create', name: roomName, priv })
    })
  }

  /** Ask the server for the public room list (lands in this.roomList). */
  listRooms() {
    this.send({ t: 'list' })
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  respawn() { this.send({ t: 'respawn' }) }

  /** Stream one frame of continuous inputs (movement, aim, fire, ADS). */
  sendInput(keys, yaw, pitch, fire, ads) {
    const seq = ++this.seq
    if (this.localSim) {
      this.pending.push({ seq, x: this.localSim.pos.x, z: this.localSim.pos.z })
    }
    this.send({ t: 'i', s: seq, k: keys, y: yaw, p: pitch, f: fire ? 1 : 0, a: ads ? 1 : 0 })
  }

  bindLocal(sim, onCorrection) {
    this.localSim = sim
    this.onCorrection = onCorrection
  }

  get my() {
    return this.latest ? this.latest.players.get(this.myId) : null
  }

  _handle(msg) {
    if (msg.t === 'snap') this._pushSnap(msg)
    if (msg.t === 'roster') {
      this.roster.players = new Map(msg.players.map((p) => [p.i, p]))
      this.roster.bots = new Map(msg.bots.map((b) => [b.i, b]))
    }
    if (msg.t === 'welcome') {
      this.myId = msg.id
      this.myName = msg.name
      this.roomCode = msg.room?.c || ''
      this.roomName = msg.room?.n || ''
      this._offset = (performance.now() / 1000) - msg.time
      if (this._joinResolve) {
        this._joinResolve(msg)
        this._joinResolve = this._joinReject = null
      }
    }
    if (msg.t === 'full' || msg.t === 'noroom') {
      if (this._joinReject) {
        this._joinReject(new Error(msg.t === 'full' ? 'Room is full' : `Room ${msg.c || ''} not found`))
        this._joinResolve = this._joinReject = null
      }
    }
    if (msg.t === 'created') {
      if (this._createResolve) {
        this._createResolve({ code: msg.c, name: msg.n })
        this._createResolve = this._createReject = null
      }
    }
    if (msg.t === 'norooms') {
      if (this._createReject) {
        this._createReject(new Error('Server is full (no room slots)'))
        this._createResolve = this._createReject = null
      }
    }
    if (msg.t === 'rooms') this.roomList = msg.rooms || []
    this._emit(msg.t, msg)
  }

  _pushSnap(s) {
    const players = new Map()
    const bots = new Map()
    for (const p of s.players) players.set(p.i, p)
    for (const b of s.bots) bots.set(b.i, b)
    const snap = { time: s.time, match: s.match, players, bots, nades: s.nades || [] }
    this.snapshots.push(snap)
    while (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift()
    this.latest = snap
    this._offset = (performance.now() / 1000) - s.time

    // Client-side prediction reconciliation for our own player
    if (this.localSim) {
      const me = snap.players.get(this.myId)
      if (me) {
        while (this.pending.length && this.pending[0].seq <= me.ack) this.pending.shift()
        const dx = this.localSim.pos.x - me.x
        const dz = this.localSim.pos.z - me.z
        const dy = this.localSim.pos.y - me.y
        if (dx * dx + dz * dz > CORRECTION_DIST * CORRECTION_DIST || Math.abs(dy) > 1.2) {
          this.localSim.pos.set(me.x, me.y, me.z)
          if (this.onCorrection) this.onCorrection(me)
          this.pending.length = 0
        }
      }
    }
  }

  /**
   * Interpolated state for a remote entity at render time.
   * kind: 'players' | 'bots', id: entity id. Returns {x,y,z,yaw,pitch} or null.
   */
  getInterp(kind, id) {
    const t = (performance.now() / 1000) - this._offset - INTERP_MS / 1000
    const snaps = this.snapshots
    let i = snaps.length - 1
    while (i >= 0 && snaps[i].time > t) i--
    const s0 = snaps[i]
    if (!s0) return null
    const e0 = s0[kind].get(id)
    if (!e0) return null
    const s1 = snaps[i + 1]
    if (!s1) {
      return { x: e0.x, y: e0.y, z: e0.z, yaw: e0.yaw, pitch: e0.pitch }
    }
    const e1 = s1[kind].get(id)
    if (!e1) return { x: e0.x, y: e0.y, z: e0.z, yaw: e0.yaw, pitch: e0.pitch }
    const f = Math.max(0, Math.min(1, (t - s0.time) / Math.max(1e-6, s1.time - s0.time)))
    let dyaw = e1.yaw - e0.yaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    return {
      x: e0.x + (e1.x - e0.x) * f,
      y: e0.y + (e1.y - e0.y) * f,
      z: e0.z + (e1.z - e0.z) * f,
      yaw: e0.yaw + dyaw * f,
      pitch: e0.pitch + (e1.pitch - e0.pitch) * f,
    }
  }
}
