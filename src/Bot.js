import * as THREE from 'three'

/**
 * Client-side bot renderer. Reads state from a shared BotSim (offline) or
 * from interpolated server snapshots (online) and draws the mesh.
 */
export default class BotRender {
  constructor(scene, info = {}) {
    this.name = info.name || 'Bot'
    this.cls = info.cls || 'triggerman'
    this.alive = true
    this.pos = new THREE.Vector3()
    this.mesh = this._buildMesh(scene, info.color ?? 0x888888)
  }

  _buildMesh(scene, color) {
    const g = new THREE.Group()
    const bodyMat = new THREE.MeshLambertMaterial({ color })
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa })
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x37474f })

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.32), bodyMat)
    body.position.y = 0.95
    g.add(body)

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), headMat)
    head.position.y = 1.42
    g.add(head)

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

    scene.add(g)
    return g
  }

  /**
   * state: { x, y, z, alive, lookYaw, speed, sliding }
   */
  apply(state) {
    this.alive = !!state.alive
    this.mesh.visible = this.alive
    this.mesh.position.set(state.x, state.y, state.z)
    this.mesh.rotation.y = state.lookYaw
    this.mesh.rotation.x = state.sliding ? Math.PI / 6 : 0
    this.pos.copy(this.mesh.position)

    const t = performance.now() / 1000
    const speed = state.speed ?? 0
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
