import * as THREE from 'three'
import { MAP_SIZE } from '../shared/constants.js'
import { BURG } from '../shared/mapBurg.js'

/**
 * Client-side world renderer. The level layout lives in shared/mapBurg.js so
 * the server simulates against the exact same geometry.
 */
export default class World {
  constructor(scene) {
    this.group = new THREE.Group()
    this.boxes = BURG.collisionBoxes
    this.meshes = []
    this.spawnPoints = BURG.spawnPoints
    this.jumpPads = BURG.jumpPads
    this._build(scene)
    scene.add(this.group)
  }

  _build(scene) {
    const size = MAP_SIZE

    // Ground texture — sand/stone grid
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#b8a07a'
    ctx.fillRect(0, 0, 512, 512)
    ctx.strokeStyle = '#a08c68'
    ctx.lineWidth = 3
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath()
      ctx.moveTo(i, 0); ctx.lineTo(i, 512)
      ctx.moveTo(0, i); ctx.lineTo(512, i)
      ctx.stroke()
    }
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3)
    }
    const gridTex = new THREE.CanvasTexture(canvas)
    gridTex.wrapS = THREE.RepeatWrapping
    gridTex.wrapT = THREE.RepeatWrapping
    gridTex.repeat.set(size / 5, size / 5)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ map: gridTex }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.group.add(ground)

    // Level geometry from shared map data
    for (const b of BURG.boxes) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d)
      const mat = new THREE.MeshLambertMaterial({ color: b.color })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(b.x, b.y + b.h / 2, b.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (b.emissive) {
        mat.emissive = new THREE.Color(b.emissive)
        mat.emissiveIntensity = b.emissiveIntensity ?? 0.4
      }
      this.group.add(mesh)
      this.meshes.push(mesh)
    }

    // Jump pad rings (visual only)
    for (const pad of BURG.jumpPads) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.08, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(pad.x, 0.28, pad.z)
      this.group.add(ring)
    }

    // ── Lighting / sky ──────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x8899aa, 0.55))
    scene.add(new THREE.HemisphereLight(0x87b8e0, 0xb8a07a, 0.7))

    const sun = new THREE.DirectionalLight(0xfff5e6, 1.15)
    sun.position.set(40, 55, 25)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 140
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    scene.add(sun)

    scene.background = new THREE.Color(0x5ba3d9)
    scene.fog = new THREE.Fog(0x5ba3d9, 70, 130)

    const skyMat = new THREE.MeshBasicMaterial({ color: 0x8ec8f0, side: THREE.BackSide })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 16, 12), skyMat)
    scene.add(sky)
  }

  /** Check jump pads — returns boost force or 0 */
  checkJumpPad(pos) {
    for (const pad of this.jumpPads) {
      const dx = pos.x - pad.x
      const dz = pos.z - pad.z
      if (dx * dx + dz * dz < pad.r * pad.r && pos.y < 1.5) {
        return pad.force
      }
    }
    return 0
  }
}
