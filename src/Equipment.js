import * as THREE from 'three'
import EquipmentSim from '../shared/EquipmentSim.js'

/**
 * Client-side grenade rendering + explosion FX. Offline mode also creates a
 * local EquipmentSim; online mode renders from server snapshots.
 */
export default class Equipment {
  constructor(scene, opts = {}) {
    this.scene = scene
    this.fx = opts.fx || null
    this.hud = opts.hud || null
    this.meshes = []
  }

  /**
   * sync(list) — list of { x, y, z, t } grenade states.
   */
  sync(list) {
    while (this.meshes.length < list.length) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
      )
      this.scene.add(mesh)
      this.meshes.push(mesh)
    }
    while (this.meshes.length > list.length) {
      const m = this.meshes.pop()
      this.scene.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
    for (let i = 0; i < list.length; i++) {
      this.meshes[i].position.set(list[i].x, list[i].y, list[i].z)
    }
  }

  /** Explosion visuals (offline from local sim, online from server event). */
  onBoom(pos) {
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

export { EquipmentSim }
