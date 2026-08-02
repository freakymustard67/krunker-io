import * as THREE from 'three'
import { PLAYER_EYE } from '../shared/constants.js'
import { clamp } from '../shared/utils.js'
import PlayerSim from '../shared/PlayerSim.js'

const PITCH_LIMIT = Math.PI / 2.15

/**
 * Client-side player: owns the camera, collects input, and drives a shared
 * PlayerSim (predicted locally in online mode, authoritative in offline mode).
 */
export default class PlayerController {
  constructor(camera, scene, map = null) {
    this.camera = camera
    this.scene = scene
    this.sim = new PlayerSim()
    this.map = map
      ? { boxes: map.collisionBoxes, jumpPads: map.jumpPads, bound: map.bound }
      : null

    this.yawObj = new THREE.Object3D()
    this.scene.add(this.yawObj)
    this.yawObj.add(camera)
    camera.position.set(0, PLAYER_EYE, 0)

    this.sensitivity = 0.0022
    this.kickPitch = 0
    this.hitFlash = 0
    this._prevHealth = this.sim.maxHealth
    this._mouseDown = false

    this._setupInput()
  }

  // ── Delegated sim state (keeps HUD/game code working unchanged) ──────────
  get position() { return this.sim.pos }
  get vel() { return this.sim.vel }
  get health() { return this.sim.health }
  get maxHealth() { return this.sim.maxHealth }
  get alive() { return this.sim.alive }
  get score() { return this.sim.score }
  get kills() { return this.sim.kills }
  get deaths() { return this.sim.deaths }
  get classId() { return this.sim.classId }
  get respawnTimer() { return this.sim.respawnTimer }
  get speedMult() { return this.sim.speedMult }
  get lastHitBy() { return this.sim.lastHitBy }
  get keys() { return this.sim.keys }
  get ads() { return this.sim.ads }
  get mouseDown() { return this._mouseDown }
  get yaw() { return this.sim.yaw }
  get pitch() { return this.sim.pitch }

  applyClass(cls) {
    this.sim.applyClass(cls)
    this._prevHealth = this.sim.health
  }

  teleport(x, z, y = 0) {
    this.sim.teleport(x, z, y)
  }

  takeDamage(amount) {
    return this.sim.takeDamage(amount)
  }

  addScore(pts) {
    this.sim.addScore(pts)
  }

  flash() {
    this.hitFlash = 0.18
  }

  applyKick(amount) {
    this.kickPitch += amount
    this.sim.pitch = clamp(this.sim.pitch + amount, -PITCH_LIMIT, PITCH_LIMIT)
  }

  _setupInput() {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.sim.keys.forward = true; break
        case 'KeyS': this.sim.keys.backward = true; break
        case 'KeyA': this.sim.keys.left = true; break
        case 'KeyD': this.sim.keys.right = true; break
        case 'Space': this.sim.keys.jump = true; e.preventDefault(); break
        case 'ShiftLeft': case 'ShiftRight': this.sim.keys.shift = true; break
        case 'KeyC': case 'ControlLeft': this.sim.keys.crouch = true; break
      }
    })
    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.sim.keys.forward = false; break
        case 'KeyS': this.sim.keys.backward = false; break
        case 'KeyA': this.sim.keys.left = false; break
        case 'KeyD': this.sim.keys.right = false; break
        case 'Space': this.sim.keys.jump = false; break
        case 'ShiftLeft': case 'ShiftRight': this.sim.keys.shift = false; break
        case 'KeyC': case 'ControlLeft': this.sim.keys.crouch = false; break
      }
    })
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._mouseDown = true
      if (e.button === 2) this.sim.ads = true
    })
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mouseDown = false
      if (e.button === 2) this.sim.ads = false
    })
    document.addEventListener('contextmenu', (e) => e.preventDefault())
    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return
      this.sim.yaw -= e.movementX * this.sensitivity
      this.sim.pitch = clamp(this.sim.pitch - e.movementY * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT)
    })
  }

  update(dt) {
    this.sim.update(dt, this.map)

    // Mirror sim state into the camera rig
    this.yawObj.position.copy(this.sim.pos)
    this.yawObj.rotation.y = this.sim.yaw
    this.camera.rotation.x = this.sim.pitch
    this.camera.position.y = this.sim.eyeY

    // Recoil recovery
    if (this.kickPitch > 0) {
      const recover = Math.min(this.kickPitch, dt * 0.25)
      this.kickPitch -= recover
      this.sim.pitch = clamp(this.sim.pitch - recover * 0.6, -PITCH_LIMIT, PITCH_LIMIT)
    }

    // Damage flash (works in both offline + online: health drops arrive
    // from the local sim or from server snapshots)
    if (this.sim.health < this._prevHealth) this.hitFlash = 0.18
    this._prevHealth = this.sim.health
    if (this.hitFlash > 0) {
      this.hitFlash -= dt
      document.getElementById('damage-overlay')?.classList.toggle('hit', this.hitFlash > 0)
    }

    // Sniper scope overlay
    const scopeEl = document.getElementById('scope-overlay')
    if (scopeEl) {
      const isSniper = this.classId === 'hunter'
      const show = isSniper && this.sim.ads && this.sim.alive
      scopeEl.classList.toggle('scope-hidden', !show)
    }
  }
}
