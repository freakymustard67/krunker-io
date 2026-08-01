import * as THREE from 'three'
import {
  CLASSES, BOT_DETECT_RANGE, BOT_ATTACK_RANGE, BOT_RESPAWN,
  BOT_NAMES, GROUND_Y, SCORE_KILL, BOT_DAMAGE_MULT, BOT_FIRE_MULT,
  JUMP_VEL,
} from './constants.js'
import { distXZ, resolveXZ, resolveY, rand, randInt, clamp } from './utils.js'

export default class Bot {
  constructor(scene, index, spawnPoint, worldBoxes, classIndex = null) {
    this.scene = scene
    this.worldBoxes = worldBoxes
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
    this.color = this.cls.color
    this.score = 0
    this.kills = 0
    this.deaths = 0

    this.state = 'patrol'
    this.stateTimer = 0
    this.waypoint = null
    this._pickWaypoint()

    this.lastFireTime = 0
    this.respawnTimer = 0
    this.grounded = true
    this.sliding = false
    this.slideTimer = 0

    this.mesh = this._buildMesh()
    this.mesh.userData.bot = this
    this.mesh.position.copy(this.pos)
    this.scene.add(this.mesh)
  }

  _buildMesh() {
    const g = new THREE.Group()
    const bodyMat = new THREE.MeshLambertMaterial({ color: this.color })
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa })
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x37474f })

    // Torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.32), bodyMat)
    body.position.y = 0.95
    body.name = 'body'
    g.add(body)

    // Head (hitbox target)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), headMat)
    head.position.y = 1.42
    head.name = 'head'
    g.add(head)

    // Helmet accent
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), bodyMat)
    helm.position.y = 1.55
    g.add(helm)

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), pantsMat)
    legL.position.set(-0.12, 0.35, 0)
    g.add(legL)
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), pantsMat)
    legR.position.set(0.12, 0.35, 0)
    g.add(legR)
    this._legL = legL
    this._legR = legR

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), bodyMat)
    armL.position.set(-0.32, 0.95, 0)
    g.add(armL)
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), bodyMat)
    armR.position.set(0.32, 0.95, 0)
    g.add(armR)
    this._armL = armL
    this._armR = armR

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.28), darkMat)
    gun.position.set(0.22, 0.85, -0.18)
    g.add(gun)

    // Name plate is CSS/HTML optional; mesh-only for now
    return g
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

  takeDamage(amount, fx) {
    if (!this.alive) return false
    this.health -= amount
    if (fx) {
      fx.addImpact(
        new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z),
        0xff3333, 3,
      )
    }
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
    this.mesh.visible = false
    this.respawnTimer = BOT_RESPAWN
  }

  respawn(spawnPoint) {
    this.pos.set(spawnPoint.x, 0, spawnPoint.z)
    this.vel.set(0, 0, 0)
    this.health = this.maxHealth
    this.alive = true
    this.mesh.visible = true
    this.state = 'patrol'
    this._pickWaypoint()
  }

  update(dt, player, worldBoxes, worldMeshes, fx, world) {
    if (!this.alive) {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0 && player.spawnPoints?.length) {
        const sp = player.spawnPoints[randInt(0, player.spawnPoints.length - 1)]
        this.respawn(sp)
      }
      return
    }

    const pPos = player.position
    const dist = distXZ(this.pos, pPos)
    const canSee = player.alive && this._hasLineOfSight(pPos, worldMeshes)

    this.stateTimer -= dt

    if (canSee && dist < BOT_ATTACK_RANGE) {
      this.state = 'attack'
    } else if (canSee && dist < BOT_DETECT_RANGE) {
      this.state = 'chase'
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
      this._moveToward(this.waypoint, this.speed * 0.55, dt, worldBoxes)
    } else if (this.state === 'chase') {
      this._moveToward(pPos, this.speed * 0.95, dt, worldBoxes)
      // Jump over obstacles
      if (this.grounded && (Math.random() < 0.015 || (dist < 6 && Math.random() < 0.05))) {
        this.vel.y = 13
        this.grounded = false
      }
    } else if (this.state === 'attack') {
      // Smart strafe pattern
      const toPlayer = new THREE.Vector3().copy(pPos).sub(this.pos)
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize()
      const strafe = Math.sin(performance.now() / 400 + this.index * 1.5) * (0.3 + 0.5 * (1 - Math.min(dist / BOT_ATTACK_RANGE, 1)))
      const ideal = dist > 20 ? 0.6 : (dist < 6 ? -0.3 : 0.1)
      const target = new THREE.Vector3(
        this.pos.x + toPlayer.x * ideal * 0.03 + side.x * strafe * 5,
        0,
        this.pos.z + toPlayer.z * ideal * 0.03 + side.z * strafe * 5,
      )
      this._moveToward(target, this.speed * (this.sliding ? 0.15 : 0.5), dt, worldBoxes)

      // Bunny hop toward player when far
      if (this.grounded && dist > 15 && Math.random() < 0.04) {
        this.vel.y = JUMP_VEL
        this.grounded = false
      }

      if (player.alive) this._shoot(player, pPos, worldMeshes, fx)
    }

    // Gravity + platforms
    this.vel.y += -55 * dt
    if (this.sliding) this.vel.y += 20 * dt // reduced gravity during slide
    this.pos.y += this.vel.y * dt
    const yRes = resolveY(this.pos, this.vel.y, 0.35, 1.6, worldBoxes, GROUND_Y)
    this.grounded = yRes.grounded
    this.vel.y = yRes.velY

    // Jump pads
    if (world) {
      const force = world.checkJumpPad(this.pos)
      if (force > 0 && this.pos.y < 1.2) {
        this.vel.y = force * 0.85
        this.grounded = false
      }
    }

    // Intentional jump pad pathing — head toward jump pads when far from player
    if (this.state === 'chase' && dist > 30 && this.grounded && world.jumpPads?.length && Math.random() < 0.01) {
      // Find nearest jump pad for a speed boost
      let bestPad = null
      let bestDist = Infinity
      for (const pad of world.jumpPads) {
        const d = distXZ(this.pos, pad)
        if (d < bestDist) { bestDist = d; bestPad = pad }
      }
      if (bestPad && bestDist > 5) {
        this._moveToward(new THREE.Vector3(bestPad.x, 0, bestPad.z), this.speed, dt, worldBoxes)
      }
    }

    this.pos.x = clamp(this.pos.x, -42, 42)
    this.pos.z = clamp(this.pos.z, -42, 42)

    this._animate(dt, spd)
    this.mesh.position.copy(this.pos)

    const lookTarget = (this.state === 'attack' || this.state === 'chase')
      ? pPos
      : (this.waypoint || pPos)
    this.mesh.rotation.y = Math.atan2(lookTarget.x - this.pos.x, lookTarget.z - this.pos.z)
    this.mesh.rotation.x = this.sliding ? Math.PI / 6 : 0
  }

  _moveToward(target, speed, dt, worldBoxes) {
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
    resolveXZ(this.pos, 0.35, worldBoxes, this.pos.y, 1.6)
  }

  _hasLineOfSight(targetPos, worldMeshes) {
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z)
    const aim = new THREE.Vector3(targetPos.x, targetPos.y + 1.3, targetPos.z)
    const dir = aim.clone().sub(origin)
    const dist = dir.length()
    if (dist < 1) return true
    dir.normalize()
    const raycaster = new THREE.Raycaster(origin, dir, 0, dist - 0.5)
    const hits = raycaster.intersectObjects(worldMeshes, true)
    return hits.length === 0
  }

  _shoot(player, targetPos, worldMeshes, fx) {
    const now = performance.now() / 1000
    const fireRate = this.weapon.fireRate * BOT_FIRE_MULT
    if (now - this.lastFireTime < fireRate) return
    this.lastFireTime = now

    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.25, this.pos.z)
    const aimY = targetPos.y + 1.2 + (Math.random() - 0.5) * 0.3
    const dir = new THREE.Vector3(targetPos.x, aimY, targetPos.z).sub(origin).normalize()

    // Bots are intentionally inaccurate
    let spread = (this.weapon.spread || 0.05) * 2.4
    if (this.weapon.id === 'sniper') spread = 0.08
    dir.x += (Math.random() - 0.5) * spread * 2
    dir.y += (Math.random() - 0.5) * spread * 2
    dir.z += (Math.random() - 0.5) * spread * 2
    dir.normalize()

    const playerCenter = new THREE.Vector3(targetPos.x, targetPos.y + 1.15, targetPos.z)
    // Shotgun: only a few pellets so it doesn't delete you
    const pellets = this.weapon.pellets ? 3 : 1

    for (let p = 0; p < pellets; p++) {
      const d = dir.clone()
      if (p > 0) {
        d.x += (Math.random() - 0.5) * 0.18
        d.y += (Math.random() - 0.5) * 0.18
        d.z += (Math.random() - 0.5) * 0.18
        d.normalize()
      }

      // Wall check
      const raycaster = new THREE.Raycaster(origin, d, 0, BOT_ATTACK_RANGE)
      const wallHits = raycaster.intersectObjects(worldMeshes, true)
      const wallDist = wallHits.length ? wallHits[0].distance : BOT_ATTACK_RANGE

      // Capsule hit vs player (works even when player mesh is hidden in FP)
      const toP = playerCenter.clone().sub(origin)
      const t = toP.dot(d)
      let hitPlayer = false
      let hitPos = null
      if (t > 0.3 && t < wallDist && t < BOT_ATTACK_RANGE) {
        const closest = origin.clone().add(d.clone().multiplyScalar(t))
        if (closest.distanceTo(playerCenter) < 0.55) {
          hitPlayer = true
          hitPos = closest
        }
      }

      if (hitPlayer) {
        // Soft hits — ~4–12 dmg per bullet instead of full class damage
        const raw = this.weapon.damage * BOT_DAMAGE_MULT
        const dmg = Math.max(3, Math.round(raw))
        player.lastHitBy = this
        const killed = player.takeDamage(dmg)
        if (fx) {
          fx.addHitMarker(hitPos)
          fx.addTracer(origin, hitPos, 0xff6644)
        }
        if (killed) {
          this.kills++
          this.score += SCORE_KILL
        }
      } else if (wallHits.length > 0) {
        if (fx) {
          fx.addImpact(wallHits[0].point, 0x888888, 2)
          fx.addTracer(origin, wallHits[0].point, 0xff6644)
        }
      } else if (fx && p === 0) {
        fx.addTracer(origin, origin.clone().add(d.multiplyScalar(BOT_ATTACK_RANGE)), 0xff6644)
      }
    }
  }

  _animate(dt, speed = 0) {
    const t = performance.now() / 1000
    const swing = Math.sin(t * (speed > 1 ? 12 : 3)) * Math.min(speed / 6, 0.35)
    if (this._legL) {
      this._legL.rotation.x = swing
      this._legR.rotation.x = -swing
    }
    if (this._armL) {
      this._armL.rotation.x = -swing * 0.45
      this._armR.rotation.x = swing * 0.45
    }
  }
}
