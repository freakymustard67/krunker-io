/**
 * Throwable grenade simulation: physics, bounces, delayed explosions and
 * radius damage. Runs on the server online and locally in offline mode.
 */
import * as THREE from 'three'
import { aimDir } from './combat.js'

export default class EquipmentSim {
  constructor({ boxes = [], bound = 44, onEvent = null } = {}) {
    this.boxes = boxes
    this.bound = bound
    this.nades = []
    this.onEvent = onEvent
  }

  getState() {
    return this.nades.map((n) => ({
      x: n.pos.x, y: n.pos.y, z: n.pos.z, t: n.timer,
    }))
  }

  throwFrom(player) {
    if (!player.alive) return
    const fwd = aimDir(player.yaw, player.pitch)
    const origin = new THREE.Vector3(
      player.pos.x, player.pos.y + player.eyeY, player.pos.z,
    ).addScaledVector(fwd, 0.8)
    const vel = fwd.clone().multiplyScalar(16)
    vel.y += 4 // slight upward arc
    this.nades.push({ pos: origin, vel, timer: 2.0, thrower: player })
  }

  update(dt, targets) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const g = this.nades[i]
      g.timer -= dt

      // Physics
      g.vel.y += -35 * dt
      g.pos.x += g.vel.x * dt
      g.pos.y += g.vel.y * dt
      g.pos.z += g.vel.z * dt

      // Bounce off ground
      if (g.pos.y < 0) {
        g.pos.y = 0
        g.vel.y *= -0.35
        g.vel.x *= 0.8
        g.vel.z *= 0.8
      }

      // Bounce off outer walls
      const b = this.bound
      if (g.pos.x < -b) { g.pos.x = -b; g.vel.x *= -0.3 }
      if (g.pos.x > b) { g.pos.x = b; g.vel.x *= -0.3 }
      if (g.pos.z < -b) { g.pos.z = -b; g.vel.z *= -0.3 }
      if (g.pos.z > b) { g.pos.z = b; g.vel.z *= -0.3 }

      if (g.timer <= 0) {
        this._explode(g, targets)
        this.nades.splice(i, 1)
      }
    }
  }

  _explode(g, targets) {
    const pos = g.pos
    const radius = 5.5
    const maxDmg = 60
    const damages = []
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      if (!t.alive) continue
      const dx = t.pos.x - pos.x
      const dy = t.pos.y - pos.y
      const dz = t.pos.z - pos.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < radius) {
        const dmg = Math.round(maxDmg * (1 - d / radius))
        const killed = t.takeDamage(dmg)
        damages.push({ target: t, dmg, killed })
      }
    }
    this.onEvent?.({ type: 'boom', pos, damages, thrower: g.thrower })
  }
}
