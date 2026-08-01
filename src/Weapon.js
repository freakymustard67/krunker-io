import * as THREE from 'three'
import { CLASSES, SECONDARY, MELEE, SCORE_KILL, SCORE_HEADSHOT, SCORE_MELEE } from './constants.js'

export default class Weapon {
  constructor(camera, scene) {
    this.camera = camera
    this.scene = scene
    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = 200

    this.slot = 0 // 0 primary, 1 secondary, 2 melee
    this.loadout = [CLASSES[0].weapon, SECONDARY, MELEE]
    this.ammo = [CLASSES[0].weapon.magSize, SECONDARY.magSize, Infinity]
    this.lastFireTime = 0
    this.reloading = false
    this.reloadTimer = 0

    this.group = new THREE.Group()
    camera.add(this.group)
    this._buildModel()

    this.bobPhase = 0
    this.bobAmount = 0
    this.recoilAnim = 0
    this.onKill = null
    this.onHit = null
    this._botMeshes = []
    this._worldMeshes = []
    this.sfx = null
    this.hud = null
    this.inspecting = false
    this.inspectTimer = 0

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') this._reload()
      if (e.code === 'Digit1') this._switch(0)
      if (e.code === 'Digit2') this._switch(1)
      if (e.code === 'Digit3') this._switch(2)
      if (e.code === 'KeyQ') this._switch(this.slot === 2 ? 0 : 2) // knife quick
      if (e.code === 'KeyJ' && !this.inspecting) {
        this.inspecting = true
        this.inspectTimer = 1.2
      }
    })
    document.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return
      const dir = e.deltaY > 0 ? 1 : -1
      this._switch((this.slot + dir + 3) % 3)
    })
  }

  get current() { return this.loadout[this.slot] }

  setClass(cls) {
    this.loadout = [{ ...cls.weapon }, { ...SECONDARY }, { ...MELEE }]
    this.ammo = [cls.weapon.magSize, SECONDARY.magSize, Infinity]
    this.slot = 0
    this.reloading = false
    this.reloadTimer = 0
    this._buildModel()
    this._updateHUD()
  }

  resetAmmo() {
    this.ammo = this.loadout.map((w) => w.magSize)
    this.reloading = false
    this.reloadTimer = 0
    this.slot = 0
    this._buildModel()
    this._updateHUD()
  }

  _buildModel() {
    while (this.group.children.length) {
      const c = this.group.children[0]
      this.group.remove(c)
      c.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
    }
    this._currentModel = new THREE.Group()
    this.group.add(this._currentModel)
    this._buildWeaponMesh(this.current)
  }

  _buildWeaponMesh(w) {
    const g = this._currentModel
    const bodyMat = new THREE.MeshLambertMaterial({ color: w.color })
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 })

    if (w.melee) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.28), new THREE.MeshLambertMaterial({ color: 0xcfd8dc }))
      blade.position.set(0, 0, -0.15)
      g.add(blade)
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.1), woodMat)
      handle.position.set(0, -0.02, 0.02)
      g.add(handle)
      return
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.3), bodyMat)
    g.add(body)

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.24, 6), darkMat)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.005, -0.24)
    g.add(barrel)

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), darkMat)
    grip.position.set(0, -0.06, 0.06)
    grip.rotation.x = 0.25
    g.add(grip)

    if (w.id === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.1, 8), darkMat)
      scope.rotation.x = Math.PI / 2
      scope.position.set(0, 0.045, -0.05)
      g.add(scope)
      body.scale.set(1, 0.85, 1.35)
      barrel.scale.set(1, 1.3, 1)
    }
    if (w.id === 'shotgun') {
      const b2 = barrel.clone()
      b2.position.x = 0.02
      g.add(b2)
      const b3 = barrel.clone()
      b3.position.x = -0.02
      g.add(b3)
      body.scale.set(1.1, 0.9, 0.95)
    }
    if (w.id === 'lmg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.06), darkMat)
      mag.position.set(0, -0.06, 0.02)
      g.add(mag)
      body.scale.set(1.15, 1.1, 1.25)
    }
    if (w.id === 'smg') {
      body.scale.set(0.9, 0.9, 0.75)
      barrel.scale.set(0.9, 0.7, 0.9)
    }
    if (w.id === 'revolver') {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), darkMat)
      cyl.rotation.z = Math.PI / 2
      cyl.position.set(0, -0.01, 0.02)
      g.add(cyl)
      body.scale.set(0.85, 0.9, 0.65)
    }
    if (w.id === 'pistol') {
      body.scale.set(0.8, 0.85, 0.55)
      barrel.scale.set(0.85, 0.55, 0.85)
    }
    if (w.id === 'semi') {
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.08), darkMat)
      scope.position.set(0, 0.04, -0.04)
      g.add(scope)
    }
  }

  _switch(idx) {
    if (idx === this.slot || idx < 0 || idx > 2) return
    this.slot = idx
    this.reloading = false
    this.reloadTimer = 0
    this._buildModel()
    this._updateHUD()
  }

  _reload() {
    const w = this.current
    if (w.melee || this.reloading || this.ammo[this.slot] === w.magSize || w.magSize === Infinity) return
    this.reloading = true
    this.reloadTimer = w.reloadTime
  }

  _updateHUD() {
    const w = this.current
    const ammo = this.ammo[this.slot]
    const ammoEl = document.getElementById('ammo-display')
    const wepEl = document.getElementById('weapon-display')
    if (ammoEl) {
      if (w.melee) ammoEl.textContent = '—'
      else if (w.magSize === Infinity) ammoEl.textContent = '∞'
      else ammoEl.textContent = this.reloading ? 'REL' : `${ammo}`
    }
    if (wepEl) wepEl.textContent = w.name
  }

  setTargets(botMeshes, worldMeshes) {
    this._botMeshes = botMeshes
    this._worldMeshes = worldMeshes
  }

  fire(botMeshes, worldMeshes, fx, player) {
    if (this.reloading || !player.alive) return false

    const now = performance.now() / 1000
    const w = this.current
    if (now - this.lastFireTime < w.fireRate) return false

    if (w.melee) {
      this.lastFireTime = now
      if (this.sfx) this.sfx.meleeSwing()
      return this._meleeAttack(botMeshes, fx, player)
    }

    const ammo = this.ammo[this.slot]
    if (ammo <= 0) { this._reload(); return false }

    this.lastFireTime = now
    const pellets = w.pellets || 1
    let anyHit = false
    if (this.sfx) this.sfx.fire(w.auto)
    for (let i = 0; i < pellets; i++) {
      if (this._firePellet(w, botMeshes, worldMeshes, fx, player)) anyHit = true
    }

    if (w.magSize !== Infinity) this.ammo[this.slot]--
    this._updateHUD()
    this.recoilAnim += w.recoil || 0.05
    if (w.kick) player.applyKick(w.kick)
    this._muzzleFlash()
    return anyHit
  }

  _meleeAttack(botMeshes, fx, player) {
    const origin = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    const q = new THREE.Quaternion()
    this.camera.getWorldQuaternion(q)
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    this.raycaster.set(origin, dir)
    this.raycaster.far = MELEE.range
    const hits = this.raycaster.intersectObjects(botMeshes, true)
    this.raycaster.far = 200

    if (hits.length > 0) {
      const hit = hits[0]
      const hitBot = this._findBot(hit.object, botMeshes)
      if (hitBot && hitBot.alive) {
        const killed = hitBot.takeDamage(MELEE.damage, fx)
        fx.addHitMarker(hit.point)
        fx.addImpact(hit.point, 0xff3333, 5)
        fx.showScreenHitmarker(false)
        if (this.sfx) this.sfx.hit(false)
        if (this.hud) this.hud.showDamageNumber(hit.point, MELEE.damage, false)
        if (this.onHit) this.onHit(false)
        if (killed) {
          player.kills++
          player.addScore(SCORE_KILL + SCORE_MELEE)
          if (this.onKill) this.onKill(hitBot, false, true)
        }
        return true
      }
    }
    this.recoilAnim += 0.08
    return false
  }

  _findBot(obj, botMeshes) {
    let o = obj
    while (o) {
      for (const bm of botMeshes) {
        if (o === bm) return bm.userData.bot
      }
      o = o.parent
    }
    return null
  }

  _firePellet(w, botMeshes, worldMeshes, fx, player) {
    const origin = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    const q = new THREE.Quaternion()
    this.camera.getWorldQuaternion(q)
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q)

    const spread = player.ads ? (w.adsSpread ?? 0) : (w.spread ?? 0.05)
    // Moving spread penalty
    const spd = Math.sqrt(player.vel.x ** 2 + player.vel.z ** 2)
    const movePen = player.grounded ? spd * 0.004 : spd * 0.006
    const finalSpread = spread + movePen

    dir.x += (Math.random() - 0.5) * finalSpread * 2
    dir.y += (Math.random() - 0.5) * finalSpread * 2
    dir.z += (Math.random() - 0.5) * finalSpread * 2
    dir.normalize()

    this.raycaster.set(origin, dir)
    const allTargets = [...botMeshes, ...worldMeshes]
    const hits = this.raycaster.intersectObjects(allTargets, true)

    if (hits.length === 0) {
      fx.addTracer(origin, origin.clone().add(dir.clone().multiplyScalar(200)), 0xffee44)
      return false
    }

    const hit = hits[0]
    const hitPos = hit.point
    const hitBot = this._findBot(hit.object, botMeshes)

    if (hitBot && hitBot.alive) {
      // Headshot if hit point is near head height relative to bot feet
      const localY = hitPos.y - hitBot.pos.y
      const isHead = localY > 1.2
      const dmg = w.damage * (isHead ? (w.headMult || 1.5) : 1)
      const killed = hitBot.takeDamage(dmg, fx)

      fx.addHitMarker(hitPos)
      fx.addImpact(hitPos, isHead ? 0xff0000 : 0xff3333, isHead ? 6 : 3)
      fx.showScreenHitmarker(isHead)
      if (this.sfx) this.sfx.hit(isHead)
      if (this.hud) this.hud.showDamageNumber(hitPos, dmg, isHead)
      if (this.onHit) this.onHit(isHead)

      if (killed) {
        player.kills++
        player.addScore(SCORE_KILL + (isHead ? SCORE_HEADSHOT : 0))
        if (this.sfx) this.sfx.kill()
        if (this.onKill) this.onKill(hitBot, isHead, false)
      }
      fx.addTracer(origin, hitPos, w.id === 'sniper' ? 0xffffff : 0xffee44)
      return true
    }

    fx.addImpact(hitPos, 0xcccccc, 4)
    fx.addTracer(origin, hitPos, 0xffee44)
    return false
  }

  _muzzleFlash() {
    if (this.current.melee) return
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.85 }),
    )
    flash.position.set(0, 0, -0.38)
    this._currentModel.add(flash)
    setTimeout(() => {
      this._currentModel.remove(flash)
      flash.geometry.dispose()
      flash.material.dispose()
    }, 40)
  }

  update(dt, player) {
    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        this.reloading = false
        this.ammo[this.slot] = this.current.magSize
      }
    }

    const moving = player.keys.forward || player.keys.backward || player.keys.left || player.keys.right
    if (moving && player.grounded) {
      this.bobPhase += dt * (player.sliding ? 16 : 11)
      this.bobAmount = Math.abs(Math.sin(this.bobPhase)) * (player.ads ? 0.002 : 0.007)
    } else {
      this.bobPhase = 0
      this.bobAmount += (0 - this.bobAmount) * dt * 10
    }

    this.recoilAnim += (0 - this.recoilAnim) * dt * 14

    // Inspect animation
    if (this.inspecting) {
      this.inspectTimer -= dt
      const phase = this.inspectTimer
      let inspX = 0, inspY = 0, inspZ = 0, inspR = 0
      if (phase > 0.8) {
        const t = (1.2 - phase) / 0.4 // raise
        inspY = -t * 0.25
        inspZ = t * 0.15
        inspR = t * 0.6
      } else if (phase > 0.4) {
        const t = (0.8 - phase) / 0.4 // hold + tilt
        inspY = -0.25
        inspZ = 0.15
        inspR = 0.6 + t * 0.3
      } else {
        const t = (0.4 - phase) / 0.4 // lower
        inspY = -0.25 * (1 - t)
        inspZ = 0.15 * (1 - t)
        inspR = 0.9 * (1 - t)
      }
      this.group.position.set(0.22 + inspX, -0.2 + inspY, -0.48 + inspZ)
      this.group.rotation.z = inspR
      if (phase <= 0) {
        this.inspecting = false
        this.group.rotation.z = 0
      }
      this._updateHUD()
      return
    }

    let targetX = 0.22
    let targetY = -0.2
    let targetZ = -0.48

    if (this.current.melee) {
      targetX = 0.18
      targetY = -0.18
      targetZ = -0.35
    }

    if (player.ads && !this.current.melee) {
      targetX = 0
      targetY = -0.14
      targetZ = -0.38
    }

    this.group.position.set(
      targetX + this.bobAmount,
      targetY - this.bobAmount * 0.5 + this.recoilAnim,
      targetZ + this.recoilAnim * 0.5,
    )

    this._updateHUD()
  }
}
