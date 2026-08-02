/**
 * Authoritative player movement/physics, shared between the client (for
 * prediction) and the server (for simulation). Pure math — no DOM, no camera.
 */
import * as THREE from 'three'
import {
  GRAVITY, PLAYER_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_RADIUS,
  PLAYER_EYE, PLAYER_CROUCH_EYE, ACCELERATION, AIR_ACCELERATION,
  MAX_SPEED, JUMP_VEL, FRICTION, SLIDE_FRICTION, SLIDE_SPEED_CAP,
  SLIDE_DURATION, SLIDE_BOOST, BHOP_WINDOW, CROUCH_SPEED_MULT,
  ADS_SPEED_MULT, GROUND_Y,
} from './constants.js'
import { clamp, resolveXZ, resolveY } from './utils.js'

export default class PlayerSim {
  constructor() {
    this.pos = new THREE.Vector3(0, 0, 0)
    this.vel = new THREE.Vector3(0, 0, 0)
    this.yaw = 0
    this.pitch = 0

    this.grounded = false
    this.sliding = false
    this.slideTimer = 0
    this.crouching = false
    this.ads = false
    this.height = PLAYER_HEIGHT
    this.speedMult = 1
    this.health = 100
    this.maxHealth = 100
    this.alive = true
    this.landTimer = 0 // bhop window after landing
    this.wasGrounded = false
    this.score = 0
    this.kills = 0
    this.deaths = 0
    this.name = 'Player'
    this.classId = 'triggerman'
    this.respawnTimer = 0
    this.lastHitBy = null

    this.keys = {
      forward: false, backward: false, left: false, right: false,
      jump: false, shift: false, crouch: false,
    }
  }

  get position() { return this.pos }
  get eyeY() {
    return (this.crouching || this.sliding || this.height < PLAYER_HEIGHT * 0.9)
      ? PLAYER_CROUCH_EYE
      : PLAYER_EYE
  }

  applyClass(cls) {
    this.classId = cls.id
    this.maxHealth = cls.health
    this.health = cls.health
    this.speedMult = cls.speed
  }

  teleport(x, z, y = 0) {
    this.pos.set(x, y, z)
    this.vel.set(0, 0, 0)
    this.grounded = false
    this.sliding = false
    this.slideTimer = 0
    this.crouching = false
    this.ads = false
    this.health = this.maxHealth
    this.alive = true
    this.landTimer = 0
    this.height = PLAYER_HEIGHT
    this.respawnTimer = 0
  }

  takeDamage(amount) {
    if (!this.alive) return false
    this.health -= amount
    if (this.health <= 0) {
      this.health = 0
      this.alive = false
      this.deaths++
      this.respawnTimer = 2.5
      return true
    }
    return false
  }

  addScore(pts) {
    this.score += pts
  }

  /**
   * Advance one simulation step.
   * ctx: { boxes, jumpPads, bound }
   */
  update(dt, ctx = {}) {
    const boxes = ctx.boxes || []
    const pads = ctx.jumpPads || []
    const bound = ctx.bound ?? 43

    if (!this.alive) {
      this.respawnTimer -= dt
      return
    }

    const yaw = this.yaw
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))

    let mx = 0, mz = 0
    if (this.keys.forward) { mx += forward.x; mz += forward.z }
    if (this.keys.backward) { mx -= forward.x; mz -= forward.z }
    if (this.keys.left) { mx -= right.x; mz -= right.z }
    if (this.keys.right) { mx += right.x; mz += right.z }

    const len = Math.sqrt(mx * mx + mz * mz)
    if (len > 0) { mx /= len; mz /= len }

    // Crouch / slide
    this.crouching = this.keys.crouch && !this.sliding

    if (this.keys.shift && this.grounded && !this.sliding && !this.crouching) {
      this.sliding = true
      this.slideTimer = 0
      // Slide boost in look direction
      const sp = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z)
      if (sp < MAX_SPEED * this.speedMult * 1.2) {
        this.vel.x += forward.x * SLIDE_BOOST
        this.vel.z += forward.z * SLIDE_BOOST
      }
    }

    if (this.sliding) {
      this.slideTimer += dt
      this.height = Math.max(PLAYER_CROUCH_HEIGHT, this.height - dt * 8)
      if (!this.keys.shift || this.slideTimer > SLIDE_DURATION || !this.grounded) {
        // keep sliding briefly in air for slide-hop
        if (this.slideTimer > SLIDE_DURATION || !this.keys.shift) {
          this.sliding = false
        }
      }
    } else if (this.crouching) {
      this.height = Math.max(PLAYER_CROUCH_HEIGHT, this.height - dt * 8)
    } else if (this.grounded) {
      this.height = Math.min(PLAYER_HEIGHT, this.height + dt * 8)
    }

    // Bhop land timer
    if (this.grounded && !this.wasGrounded) {
      this.landTimer = BHOP_WINDOW
    }
    if (this.landTimer > 0) this.landTimer -= dt
    this.wasGrounded = this.grounded

    // Friction — skip full friction during bhop window so speed carries
    let currentSpeed = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z)
    if (this.grounded && this.landTimer <= 0) {
      const friction = this.sliding ? SLIDE_FRICTION : FRICTION
      const drop = currentSpeed * friction * dt
      const newSpeed = Math.max(0, currentSpeed - drop)
      if (currentSpeed > 0) {
        this.vel.x *= newSpeed / currentSpeed
        this.vel.z *= newSpeed / currentSpeed
      }
    }

    // Wish speed
    let targetSpeed = MAX_SPEED * this.speedMult
    if (this.ads && this.grounded && !this.sliding) targetSpeed *= ADS_SPEED_MULT
    if (this.crouching && this.grounded) targetSpeed *= CROUCH_SPEED_MULT

    let accel = this.grounded ? ACCELERATION : AIR_ACCELERATION
    if (this.sliding && this.grounded) accel = 0

    // Quake-style accelerate (enables air-strafe speed gain)
    if (len > 0) {
      const projVel = this.vel.x * mx + this.vel.z * mz
      const addSpeed = targetSpeed - projVel
      if (addSpeed > 0) {
        const accelSpeed = Math.min(accel * dt * targetSpeed, addSpeed)
        this.vel.x += accelSpeed * mx
        this.vel.z += accelSpeed * mz
      }
    }

    if (this.sliding) {
      currentSpeed = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z)
      if (currentSpeed > SLIDE_SPEED_CAP) {
        this.vel.x *= SLIDE_SPEED_CAP / currentSpeed
        this.vel.z *= SLIDE_SPEED_CAP / currentSpeed
      }
    }

    // Jump / bhop
    if (this.keys.jump && this.grounded) {
      this.vel.y = JUMP_VEL
      this.grounded = false
      this.landTimer = 0
      if (this.sliding) {
        // Slide-hop boost
        this.vel.x += forward.x * 2.2
        this.vel.z += forward.z * 2.2
        this.sliding = false
      }
    }

    // Jump pads
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i]
      const dx = this.pos.x - pad.x
      const dz = this.pos.z - pad.z
      if (dx * dx + dz * dz < pad.r * pad.r && this.pos.y < 1.5) {
        this.vel.y = pad.force
        this.grounded = false
        break
      }
    }

    // ── Wall-jump ────────────────────────────────────────────────
    // Krunker-style: if pressing jump against a wall, launch off it
    let wallNormal = null
    if (this.keys.jump && !this.grounded && this.vel.y < 2) {
      const checkDirs = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
      ]
      const checkDist = PLAYER_RADIUS + 0.35
      for (const dir of checkDirs) {
        const testPos = new THREE.Vector3(
          this.pos.x + dir.x * checkDist,
          this.pos.y + 0.6,
          this.pos.z + dir.z * checkDist,
        )
        let blocked = false
        for (const b of boxes) {
          const headY = this.pos.y + this.height
          if (headY <= b.minY || this.pos.y >= b.maxY) continue
          const cx = clamp(testPos.x, b.minX, b.maxX)
          const cz = clamp(testPos.z, b.minZ, b.maxZ)
          const dx = testPos.x - cx
          const dz = testPos.z - cz
          if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) {
            blocked = true
            wallNormal = dir.clone()
            break
          }
        }
        if (blocked) break
      }
      if (wallNormal) {
        // Launch off wall
        this.vel.y = JUMP_VEL * 0.85
        this.vel.x += wallNormal.x * 9
        this.vel.z += wallNormal.z * 9
        this.grounded = false
        this.keys.jump = false // consume jump
      }
    }

    this.vel.y += GRAVITY * dt

    // Horizontal move + collide
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    resolveXZ(this.pos, PLAYER_RADIUS, boxes, this.pos.y, this.height)

    // Vertical move + platforms
    this.pos.y += this.vel.y * dt
    const yRes = resolveY(this.pos, this.vel.y, PLAYER_RADIUS, this.height, boxes, GROUND_Y)
    this.grounded = yRes.grounded
    this.vel.y = yRes.velY

    // Map bounds soft clamp
    this.pos.x = clamp(this.pos.x, -bound, bound)
    this.pos.z = clamp(this.pos.z, -bound, bound)
  }
}
