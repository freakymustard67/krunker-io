import * as THREE from 'three'

export default class BulletFX {
  constructor(scene) {
    this.scene = scene
    this.tracers = []
    this.impacts = []
    this._hitmarkerEl = null
    this._hitmarkerTimer = 0
  }

  _ensureHitmarker() {
    if (this._hitmarkerEl) return
    let el = document.getElementById('hitmarker')
    if (!el) {
      el = document.createElement('div')
      el.id = 'hitmarker'
      document.getElementById('hud')?.appendChild(el)
    }
    this._hitmarkerEl = el
  }

  /** Screen-space Krunker-style X hitmarker */
  showScreenHitmarker(headshot = false) {
    this._ensureHitmarker()
    const el = this._hitmarkerEl
    if (!el) return
    el.className = headshot ? 'show headshot' : 'show'
    this._hitmarkerTimer = 0.18
  }

  addTracer(from, to, color = 0xffee44) {
    const points = [from.clone(), to.clone()]
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })
    const line = new THREE.Line(geo, mat)
    this.scene.add(line)
    this.tracers.push({ line, life: 0.12 })
  }

  addImpact(pos, color = 0xffaa44, count = 4) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(0.25 + Math.random() * 0.35)
      const p = pos.clone().add(dir)
      const geo = new THREE.BufferGeometry().setFromPoints([pos, p])
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })
      const line = new THREE.Line(geo, mat)
      this.scene.add(line)
      this.impacts.push({ line, life: 0.18 + Math.random() * 0.1 })
    }
  }

  addHitMarker(pos) {
    const s = 0.18
    const corners = [
      new THREE.Vector3(-s, s, 0), new THREE.Vector3(-s * 0.3, s * 0.3, 0),
      new THREE.Vector3(s, s, 0), new THREE.Vector3(s * 0.3, s * 0.3, 0),
      new THREE.Vector3(-s, -s, 0), new THREE.Vector3(-s * 0.3, -s * 0.3, 0),
      new THREE.Vector3(s, -s, 0), new THREE.Vector3(s * 0.3, -s * 0.3, 0),
    ]
    for (let i = 0; i < corners.length; i += 2) {
      const pts = [pos.clone().add(corners[i]), pos.clone().add(corners[i + 1])]
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
      const line = new THREE.Line(geo, mat)
      this.scene.add(line)
      this.impacts.push({ line, life: 0.2 })
    }
  }

  update(dt) {
    if (this._hitmarkerTimer > 0) {
      this._hitmarkerTimer -= dt
      if (this._hitmarkerTimer <= 0 && this._hitmarkerEl) {
        this._hitmarkerEl.className = ''
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]
      t.life -= dt
      t.line.material.opacity = Math.max(0, t.life / 0.12)
      if (t.life <= 0) {
        this.scene.remove(t.line)
        t.line.geometry.dispose()
        t.line.material.dispose()
        this.tracers.splice(i, 1)
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const t = this.impacts[i]
      t.life -= dt
      t.line.material.opacity = Math.max(0, t.life / 0.25)
      if (t.life <= 0) {
        this.scene.remove(t.line)
        t.line.geometry.dispose()
        t.line.material.dispose()
        this.impacts.splice(i, 1)
      }
    }
  }
}
