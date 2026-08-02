/**
 * Server-authoritative bot brain + movement. No meshes, no DOM — renderers
 * (client) read state and draw. Used by the game server for online play and
 * by the local session in offline mode.
 */
import * as THREE from 'three'
import {
  CLASSES, BOT_RESPAWN, BOT_NAMES, BOT_DETECT_RANGE, BOT_ATTACK_RANGE,
  GROUND_Y, SCORE_KILL, BOT_DAMAGE_MULT, BOT_FIRE_MULT, JUMP_VEL,
} from './constants.js'
import { hitscan, rayAABB, hitPoint } from './combat.js'
import { distXZ, resolveXZ, resolveY, rand, randInt, clamp } from './utils.js'

export default class BotSim {
  constructor(index, spawnPoint, classIndex = null) {
    this.index = index
    this.name = BOT_NAMES[index % BOT_NAMES.length]

    const ci = classIndex ?? (index % CLASSES.length)
    this.cls = CLASSES[ci]
    this.weapon = { ...this.cls.weapon }
    this.maxHealth = this.cls.health
    this.speed = 8.5 * this.cls.speed

    this.pos = new THREE.Vector3(spawnPoint.x, 0, spawnPoint.z)
    this.vel = new THREE.Vector3(0, 0, 0)
    this.health = this.maxHealth
    this.alive = true
    this.score = 0
    this.kills = 0
    this.deaths = 0

    this.state = 'patrol'
    this.stateTimer = 0
    this.waypoint = null
    this.lookYaw = 0
    this.sliding = false
    this.slideTimer = 0
    this.grounded = true
    this.lastFireTime = 0
    this.respawnTimer = 0
    this.lastKill = null

    this._pickWaypoint()
  }

  _pickWaypoint() {
    const angle = rand(0, Math.PI * 2)
    const dist = rand(8, 28)
    this.waypoint = new THREE.Vector3(
      this.pos.x + Math.cos(angle) * dist,
      0,
      this.pos.z + Math.sin(angle) * dist,
    )
    this.waypoint.x = clamp(this.waypoint.x, -40, 40)
    this.waypoint.z = clamp(this.waypoint.z, -40, 40)
  }

  takeDamage(amount) {
    if (!this.alive) return false
    this.health -= amount
    this.state = 'chase'
    this.stateTimer = 3
    if (this.health <= 0) {
      this.die()
      return true
    }
    return false
  }

  die() {
    this.alive = false
    this.deaths++
    this.respawnTimer = BOT_RESPAWN
  }

  respawn(spawnPoint) {
    this.pos.set(spawnPoint.x, 0, spawnPoint.z)
    this.vel.set(0, 0, 0)
    this.health = this.maxHealth
    this.alive = true
    this.state = 'patrol'
    this._pickWaypoint()
  }

  resetMatch(spawnPoint) {
    this.score = 0
    this.kills = 0
    this.deaths = 0
    this.lastKill = null
    this.respawn(spawnPoint)
  }

  /**
   * ctx: { players: [PlayerSim...], boxes, jumpPads, spawnPoints, bound, onShot }
   */
  update(dt, ctx = {}) {
    const boxes = ctx.boxes || []
    const pads = ctx.jumpPads || []
    const spawnPoints = ctx.spawnPoints || []
    const bound = ctx.bound ?? 43
    const players = ctx.players || []

    if (!this.alive) {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0 && spawnPoints.length) {
        this.respawn(spawnPoints[randInt(0, spawnPoints.length - 1)])
      }
      this.lastKill = null
      return
    }
    this.lastKill = null

    // Nearest alive player = our target
    let target = null
    let targetDist = Infinity
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (!p.alive) continue
      const d = distXZ(this.pos, p.pos)
      if (d < targetDist) { targetDist = d; target = p }
    }

    this.stateTimer -= dt

    if (target) {
      const canSee = this._hasLineOfSight(target.pos, boxes)
      if (canSee && targetDist < BOT_ATTACK_RANGE) {
        this.state = 'attack'
      } else if (canSee && targetDist < BOT_DETECT_RANGE) {
        this.state = 'chase'
      } else if (this.stateTimer <= 0) {
        this.state = 'patrol'
      }
    } else if (this.stateTimer <= 0) {
      this.state = 'patrol'
    }

    // Slide if moving fast enough and close to enemy
    const spd = Math.sqrt(this.vel.x ** 2 + this.vel.z ** 2)
    if (this.grounded && this.state === 'attack' && spd > 14 && !this.sliding && Math.random() < 0.005) {
      this.sliding = true
      this.slideTimer = 0
    }
    if (this.sliding) {
      this.slideTimer += dt
      if (this.slideTimer > 0.5 || !this.grounded) this.sliding = false
    }

    if (this.state === 'patrol') {
      if (!this.waypoint || distXZ(this.pos, this.waypoint) < 2.5) {
        this._pickWaypoint()
        this.stateTimer = rand(2, 5)
      }
      this._moveToward(this.waypoint, this.speed * 0.55, dt, boxes)
    } else if (this.state === 'chase' && target) {
      this._moveToward(target.pos, this.speed * 0.95, dt, boxes)
      // Jump over obstacles
      if (this.grounded && (Math.random() < 0.015 || (targetDist < 6 && Math.random() < 0.05))) {
        this.vel.y = 13
        this.grounded = false
      }
    } else if (this.state === 'attack' && target) {
      // Smart strafe pattern
      const toPlayer = new THREE.Vector3().copy(target.pos).sub(this.pos)
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize()
      const strafe = Math.sin(performance.now() / 400 + this.index * 1.5) * (0.3 + 0.5 * (1 - Math.min(targetDist / BOT_ATTACK_RANGE, 1)))
      const ideal = targetDist > 20 ? 0.6 : (targetDist < 6 ? -0.3 : 0.1)
      const moveTarget = new THREE.Vector3(
        this.pos.x + toPlayer.x * ideal * 0.03 + side.x * strafe * 5,
        0,
        this.pos.z + toPlayer.z * ideal * 0.03 + side.z * strafe * 5,
      )
      this._moveToward(moveTarget, this.speed * (this.sliding ? 0.15 : 0.5), dt, boxes)

      // Bunny hop toward player when far
      if (this.grounded && targetDist > 15 && Math.random() < 0.04) {
        this.vel.y = JUMP_VEL
        this.grounded = false
      }

      this._shoot(target, boxes, players, ctx.onShot)
    }

    // Gravity + platforms
    this.vel.y += -55 * dt
    if (this.sliding) this.vel.y += 20 * dt // reduced gravity during slide
    this.pos.y += this.vel.y * dt
    const yRes = resolveY(this.pos, this.vel.y, 0.35, 1.6, boxes, GROUND_Y)
    this.grounded = yRes.grounded
    this.vel.y = yRes.velY

    // Jump pads
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i]
      const dx = this.pos.x - pad.x
      const dz = this.pos.z - pad.z
      if (dx * dx + dz * dz < pad.r * pad.r && this.pos.y < 1.2) {
        this.vel.y = pad.force * 0.85
        this.grounded = false
        break
      }
    }

    // Intentional jump pad pathing — head toward jump pads when far from player
    if (this.state === 'chase' && target && targetDist > 30 && this.grounded && pads.length && Math.random() < 0.01) {
      let bestPad = null
      let bestDist = Infinity
      for (const pad of pads) {
        const d = distXZ(this.pos, pad)
        if (d < bestDist) { bestDist = d; bestPad = pad }
      }
      if (bestPad && bestDist > 5) {
        this._moveToward(new THREE.Vector3(bestPad.x, 0, bestPad.z), this.speed, dt, boxes)
      }
    }

    this.pos.x = clamp(this.pos.x, -bound, bound)
    this.pos.z = clamp(this.pos.z, -bound, bound)

    // Facing
    const lookTarget = (this.state === 'attack' || this.state === 'chase') && target
      ? target.pos
      : this.waypoint
    if (lookTarget) {
      this.lookYaw = Math.atan2(lookTarget.x - this.pos.x, lookTarget.z - this.pos.z)
    }
  }

  get horizontalSpeed() {
    return Math.sqrt(this.vel.x ** 2 + this.vel.z ** 2)
  }

  _moveToward(target, speed, dt, boxes) {
    const dx = target.x - this.pos.x
    const dz = target.z - this.pos.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.4) {
      this.vel.x *= 0.85
      this.vel.z *= 0.85
      return
    }

    const mx = dx / dist
    const mz = dz / dist
    this.vel.x += (mx * speed - this.vel.x) * dt * 7
    this.vel.z += (mz * speed - this.vel.z) * dt * 7

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    resolveXZ(this.pos, 0.35, boxes, this.pos.y, 1.6)
  }

  _hasLineOfSight(targetPos, boxes) {
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z)
    const aim = new THREE.Vector3(targetPos.x, targetPos.y + 1.3, targetPos.z)
    const dir = aim.clone().sub(origin)
    const dist = dir.length()
    if (dist < 1) return true
    dir.normalize()
    // First AABB wall hit closer than the target blocks sight
    let wallT = dist - 0.5
    for (let i = 0; i < boxes.length; i++) {
      const t = rayAABB(origin, dir, boxes[i], wallT)
      if (t < wallT) return false
    }
    return true
  }

  _shoot(target, boxes, players, onShot) {
    const now = performance.now() / 1000
    const fireRate = this.weapon.fireRate * BOT_FIRE_MULT
    if (now - this.lastFireTime < fireRate) return
    this.lastFireTime = now

    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.25, this.pos.z)
    const aimY = target.pos.y + 1.35 + (Math.random() - 0.5) * 0.25
    const dir = new THREE.Vector3(target.pos.x, aimY, target.pos.z).sub(origin).normalize()

    // Bots are inaccurate but threatening (tightened from the original 2.4x)
    let spread = (this.weapon.spread || 0.05) * 1.6
    if (this.weapon.id === 'sniper') spread = 0.06
    dir.x += (Math.random() - 0.5) * spread * 2
    dir.y += (Math.random() - 0.5) * spread * 2
    dir.z += (Math.random() - 0.5) * spread * 2
    dir.normalize()

    // Shotgun: only a few pellets so it doesn't delete you
    const pellets = this.weapon.pellets ? 3 : 1

    let shotInfo = { origin, hits: [] }
    for (let p = 0; p < pellets; p++) {
      const d = dir.clone()
      if (p > 0) {
        d.x += (Math.random() - 0.5) * 0.18
        d.y += (Math.random() - 0.5) * 0.18
        d.z += (Math.random() - 0.5) * 0.18
        d.normalize()
      }

      const hit = hitscan(origin, d, boxes, players, BOT_ATTACK_RANGE)
      if (hit) {
        // Soft hits — ~4–12 dmg per bullet instead of full class damage
        const raw = this.weapon.damage * BOT_DAMAGE_MULT
        const dmg = Math.max(3, Math.round(raw))
        hit.target.lastHitBy = this
        const killed = hit.target.takeDamage(dmg)
        shotInfo.hits.push({ point: hitPoint(origin, d, hit.dist), hit, dmg })
        if (killed) {
          this.kills++
          this.score += SCORE_KILL
          this.lastKill = { target: hit.target, headshot: hit.headshot, melee: false }
        }
      } else if (p === 0) {
        shotInfo.hits.push({ point: origin.clone().addScaledVector(d, BOT_ATTACK_RANGE), hit: null })
      }
    }
    onShot?.(shotInfo)
  }
}
