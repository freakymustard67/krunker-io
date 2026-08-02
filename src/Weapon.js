import * as THREE from 'three'

/**
 * Client-side weapon: first-person viewmodel, animation (bob / recoil /
 * inspect / ADS), and HUD display. All damage + ammo logic lives in the
 * shared WeaponSim (offline) or on the server (online).
 */
export default class Weapon {
  constructor(camera, scene, classDef) {
    this.camera = camera
    this.scene = scene
    this.classDef = classDef
    this.slot = 0
    this.ammo = classDef ? this._initialAmmo(classDef) : []
    this.reloading = false

    this.group = new THREE.Group()
    camera.add(this.group)
    this._buildModel()

    this.bobPhase = 0
    this.bobAmount = 0
    this.recoilAnim = 0
    this.sfx = null
    this.inspecting = false
    this.inspectTimer = 0

    // Callbacks wired up by main.js
    this.onReload = null
    this.onSwitch = null

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') this.onReload?.()
      if (e.code === 'Digit1') this.onSwitch?.(0)
      if (e.code === 'Digit2') this.onSwitch?.(1)
      if (e.code === 'Digit3') this.onSwitch?.(2)
      if (e.code === 'KeyQ') this.onSwitch?.(this.slot === 2 ? 0 : 2) // knife quick
      if (e.code === 'KeyJ' && !this.inspecting) {
        this.inspecting = true
        this.inspectTimer = 1.2
      }
    })
    document.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return
      const dir = e.deltaY > 0 ? 1 : -1
      this.onSwitch?.((this.slot + dir + 3) % 3)
    })
  }

  get current() { return this.classDef ? this.classDef.weapon : null }

  _initialAmmo(classDef) {
    const w = classDef.weapon
    return [w.magSize, 10, Infinity] // primary, pistol, knife
  }

  setLoadout(classDef) {
    this.classDef = classDef
    this.slot = 0
    this.ammo = this._initialAmmo(classDef)
    this.reloading = false
    this._buildModel()
    this._updateHUD()
  }

  /**
   * Sync display state from the authoritative source (WeaponSim or server
   * snapshot). Rebuilds the viewmodel when the slot changes.
   */
  sync(state) {
    const slotChanged = state.slot !== this.slot
    this.slot = state.slot
    if (Array.isArray(state.ammo)) this.ammo = state.ammo
    this.reloading = !!state.reloading
    if (slotChanged) this._buildModel()
    this._updateHUD()
  }

  /** Called when the authoritative sim/server says a shot was fired. */
  notifyShot(melee = false) {
    if (melee) {
      this.recoilAnim += 0.18
      if (this.sfx) this.sfx.meleeSwing()
      return
    }
    const w = this.current
    this.recoilAnim += (w?.recoil) || 0.05
    if (this.sfx) this.sfx.fire(w?.auto ?? false)
    this._muzzleFlash()
  }

  /** Called when the authoritative sim/server says we landed a hit. */
  notifyHit(headshot = false) {
    if (this.sfx) this.sfx.hit(headshot)
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

  _muzzleFlash() {
    if (this.current?.melee) return
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
    const moving = player.keys.forward || player.keys.backward || player.keys.left || player.keys.right
    if (moving && player.sim.grounded) {
      this.bobPhase += dt * (player.sim.sliding ? 16 : 11)
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
      return
    }

    let targetX = 0.22
    let targetY = -0.2
    let targetZ = -0.48

    if (this.current?.melee) {
      targetX = 0.18
      targetY = -0.18
      targetZ = -0.35
    }

    if (player.ads && !this.current?.melee) {
      targetX = 0
      targetY = -0.14
      targetZ = -0.38
    }

    this.group.position.set(
      targetX + this.bobAmount,
      targetY - this.bobAmount * 0.5 + this.recoilAnim,
      targetZ + this.recoilAnim * 0.5,
    )
  }
}
