/**
 * Krunker-style equipment: throwable grenade (G key).
 * Simple physics + delayed explosion with area damage + FX.
 */
import * as THREE from 'three'

export default class Equipment {
  constructor(scene, worldBoxes, player, bots, fx, hud) {
    this.scene = scene
    this.worldBoxes = worldBoxes
    this.player = player
    this.bots = bots
    this.fx = fx
    this.hud = hud
    this.grenades = []
    this._setupInput()
  }

  _setupInput() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyG' && document.pointerLockElement && this.player.alive) {
        this._throw()
      }
    })
  }

  _throw() {
    // Spawn a grenade in front of the player
    const origin = new THREE.Vector3()
    this.player.camera.getWorldPosition(origin)
    const q = new THREE.Quaternion()
    this.player.camera.getWorldQuaternion(q)
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q)

    const startPos = origin.clone().add(dir.clone().multiplyScalar(0.8))
    const vel = dir.clone().multiplyScalar(16)
    vel.y += 4 // slight upward arc

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
    )
    mesh.position.copy(startPos)
    this.scene.add(mesh)

    this.grenades.push({
      pos: startPos,
      vel,
      mesh,
      timer: 2.0, // seconds to detonate
      live: true,
    })
  }

  update(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]
      if (!g.live) continue

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

      // Bounce off walls (simple AABB check)
      // (skip for performance — just boundary clamp)
      const bound = 44
      if (g.pos.x < -bound) { g.pos.x = -bound; g.vel.x *= -0.3 }
      if (g.pos.x > bound) { g.pos.x = bound; g.vel.x *= -0.3 }
      if (g.pos.z < -bound) { g.pos.z = -bound; g.vel.z *= -0.3 }
      if (g.pos.z > bound) { g.pos.z = bound; g.vel.z *= -0.3 }

      g.mesh.position.copy(g.pos)

      // Explode
      if (g.timer <= 0) {
        this._explode(g)
        this.scene.remove(g.mesh)
        g.mesh.geometry.dispose()
        g.mesh.material.dispose()
        this.grenades.splice(i, 1)
      }
    }
  }

  _explode(g) {
    const pos = g.pos

    // Visual: expanding ring + flash
    const ringGeo = new THREE.RingGeometry(0.1, 0.5, 16)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.position.copy(pos)
    ring.position.y += 0.1
    ring.rotation.x = -Math.PI / 2
    this.scene.add(ring)

    // Animate ring expansion
    const startTime = performance.now()
    const expand = () => {
      const elapsed = (performance.now() - startTime) / 1000
      if (elapsed > 0.4) {
        this.scene.remove(ring)
        ring.geometry.dispose()
        ring.material.dispose()
        return
      }
      const scale = 1 + elapsed * 20
      ring.scale.set(scale, scale, scale)
      ring.material.opacity = 1 - elapsed / 0.4
      requestAnimationFrame(expand)
    }
    expand()

    // Flash sphere
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 }),
    )
    flash.position.copy(pos)
    this.scene.add(flash)
    setTimeout(() => {
      this.scene.remove(flash)
      flash.geometry.dispose()
      flash.material.dispose()
    }, 150)

    // Damage in radius
    const radius = 5.5
    const maxDmg = 60

    // Player damage
    if (this.player.alive) {
      const d = this.player.pos.distanceTo(pos)
      if (d < radius) {
        const dmg = Math.round(maxDmg * (1 - d / radius))
        const killed = this.player.takeDamage(dmg)
        if (killed && this.hud) {
          this.hud.addKill('[EXPLOSION]', 'You', false, false)
        }
      }
    }

    // Bot damage
    for (const bot of this.bots) {
      if (!bot.alive) continue
      const d = bot.pos.distanceTo(pos)
      if (d < radius) {
        const dmg = Math.round(maxDmg * (1 - d / radius))
        const killed = bot.takeDamage(dmg, this.fx)
        if (killed && this.hud) {
          this.hud.addKill('You', bot.name, false, false)
        }
      }
    }

    // Impact particles
    for (let i = 0; i < 12; i++) {
      const pDir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(0.3 + Math.random() * 0.8)
      const pEnd = pos.clone().add(pDir)
      const pMat = new THREE.LineBasicMaterial({
        color: [0xff6600, 0xff4400, 0xffcc00][Math.floor(Math.random() * 3)],
        transparent: true,
        opacity: 0.8,
      })
      const pGeo = new THREE.BufferGeometry().setFromPoints([pos, pEnd])
      const line = new THREE.Line(pGeo, pMat)
      this.scene.add(line)
      setTimeout(() => {
        this.scene.remove(line)
        pGeo.dispose()
        pMat.dispose()
      }, 200)
    }
  }
}
