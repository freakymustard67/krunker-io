import * as THREE from 'three'
import { MAP_SIZE } from './constants.js'

/**
 * Burg-inspired multi-level Krunker map:
 * central courtyard, raised platforms, ramps (stepped), cover walls, jump pads.
 */
export default class World {
  constructor(scene) {
    this.group = new THREE.Group()
    this.boxes = []
    this.meshes = []
    this.spawnPoints = []
    this.jumpPads = []
    this._build(scene)
    scene.add(this.group)
  }

  _addBox(x, y, z, w, h, d, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d)
    const mat = new THREE.MeshLambertMaterial({ color })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y + h / 2, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (opts.emissive) {
      mat.emissive = new THREE.Color(opts.emissive)
      mat.emissiveIntensity = opts.emissiveIntensity ?? 0.4
    }
    this.group.add(mesh)
    this.meshes.push(mesh)
    this.boxes.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: y, maxY: y + h,
      minZ: z - d / 2, maxZ: z + d / 2,
    })
    return mesh
  }

  /** Thin platform (floor piece) */
  _plat(x, y, z, w, d, color = 0xc4a882) {
    return this._addBox(x, y, z, w, 0.45, d, color)
  }

  /** Wall / cover */
  _wall(x, y, z, w, h, d, color = 0x8b7355) {
    return this._addBox(x, y, z, w, h, d, color)
  }

  /** Stepped ramp along +Z direction from low to high */
  _rampZ(x, zStart, width, steps, stepH, stepD, color) {
    for (let i = 0; i < steps; i++) {
      this._addBox(x, i * stepH, zStart + i * stepD + stepD / 2, width, stepH, stepD, color)
    }
  }

  /** Stepped ramp along +X */
  _rampX(z, xStart, depth, steps, stepH, stepD, color) {
    for (let i = 0; i < steps; i++) {
      this._addBox(xStart + i * stepD + stepD / 2, i * stepH, z, stepD, stepH, depth, color)
    }
  }

  _jumpPad(x, z, force = 22) {
    const mesh = this._addBox(x, 0, z, 2.2, 0.2, 2.2, 0x00e5ff, {
      emissive: 0x00bcd4,
      emissiveIntensity: 0.6,
    })
    // Ring indicator
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.08, 6, 16),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.28, z)
    this.group.add(ring)
    this.jumpPads.push({ x, z, r: 1.3, force, mesh, ring })
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
    // Subtle noise dots
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

    // Outer boundary walls
    const wallH = 6
    const wallC = 0x6b5b4a
    const half = size / 2 - 0.5
    this._wall(0, 0, -half, size, wallH, 1.2, wallC)
    this._wall(0, 0, half, size, wallH, 1.2, wallC)
    this._wall(-half, 0, 0, 1.2, wallH, size, wallC)
    this._wall(half, 0, 0, 1.2, wallH, size, wallC)

    // ── Center tower (multi-level) ──────────────────────────────────────────
    this._addBox(0, 0, 0, 10, 1.5, 10, 0x8d6e63) // base
    this._plat(0, 4, 0, 8, 8, 0xc4a882) // mid deck
    this._addBox(0, 4.45, 0, 4, 3, 4, 0x795548) // tower core
    this._plat(0, 7.5, 0, 5, 5, 0xd7c4a8) // top deck
    // Center access ramps
    this._rampZ(0, -9, 3.5, 5, 0.3, 0.9, 0xa1887f)
    this._rampZ(0, 4.5, 3.5, 5, 0.3, 0.9, 0xa1887f) // wrong dir — fix below
    // Better: ramps from ground to mid
    this._rampX(0, -9, 3.5, 5, 0.3, 0.9, 0xa1887f)

    // Stairs up to top from mid (small)
    this._addBox(2.5, 4.45, 0, 1.2, 0.7, 1.5, 0xa1887f)
    this._addBox(2.5, 5.15, 0, 1.2, 0.7, 1.5, 0xa1887f)
    this._addBox(2.5, 5.85, 0, 1.2, 0.7, 1.5, 0xa1887f)
    this._addBox(2.5, 6.55, 0, 1.2, 0.7, 1.5, 0xa1887f)

    // ── Four corner buildings ───────────────────────────────────────────────
    const corners = [
      { x: -28, z: -28 },
      { x: 28, z: -28 },
      { x: -28, z: 28 },
      { x: 28, z: 28 },
    ]
    const bCols = [0xd84315, 0x1565c0, 0x2e7d32, 0x6a1b9a]
    corners.forEach((c, i) => {
      // Building body
      this._addBox(c.x, 0, c.z, 12, 5, 12, bCols[i])
      // Roof platform
      this._plat(c.x, 5, c.z, 13, 13, 0xbcaaa4)
      // Roof cover wall (half)
      this._wall(c.x, 5.45, c.z - 5, 10, 1.8, 0.6, 0x8d6e63)
      // Ramp up to roof
      const rx = c.x > 0 ? c.x - 8 : c.x + 8
      this._rampZ(rx, c.z > 0 ? c.z - 14 : c.z + 5, 3, 8, 0.625, 1.1, 0xa1887f)
      // Side platform
      this._plat(c.x + (c.x > 0 ? -10 : 10), 2.5, c.z, 6, 6, 0xc4a882)
    })

    // ── Mid-side elevated walkways ──────────────────────────────────────────
    // North / South bridges
    this._plat(0, 3, -22, 18, 4, 0xb0bec5)
    this._plat(0, 3, 22, 18, 4, 0xb0bec5)
    // East / West bridges
    this._plat(-22, 3, 0, 4, 18, 0xb0bec5)
    this._plat(22, 3, 0, 4, 18, 0xb0bec5)

    // Connecting ramps to bridges
    this._rampZ(-6, -30, 3, 6, 0.5, 1.1, 0x90a4ae)
    this._rampZ(6, 22, 3, 6, 0.5, 1.1, 0x90a4ae)
    this._rampX(-6, -30, 3, 6, 0.5, 1.1, 0x90a4ae)
    this._rampX(6, 22, 3, 6, 0.5, 1.1, 0x90a4ae)

    // ── Mid-map cover crates ────────────────────────────────────────────────
    const crateC = 0xef6c00
    const crates = [
      [-12, 0, -8, 3, 2, 3],
      [12, 0, 8, 3, 2, 3],
      [-8, 0, 12, 4, 1.5, 2],
      [8, 0, -12, 4, 1.5, 2],
      [-15, 0, 5, 2.5, 2.5, 2.5],
      [15, 0, -5, 2.5, 2.5, 2.5],
      [0, 0, -15, 5, 1.2, 2],
      [0, 0, 15, 5, 1.2, 2],
    ]
    for (const [x, y, z, w, h, d] of crates) {
      this._addBox(x, y, z, w, h, d, crateC)
    }

    // Low walls for cover
    this._wall(-10, 0, 0, 0.6, 1.4, 8, 0x78909c)
    this._wall(10, 0, 0, 0.6, 1.4, 8, 0x78909c)
    this._wall(0, 0, -10, 8, 1.4, 0.6, 0x78909c)
    this._wall(0, 0, 10, 8, 1.4, 0.6, 0x78909c)

    // ── Sniper perches (high platforms) ─────────────────────────────────────
    this._addBox(-35, 0, 0, 6, 8, 6, 0x455a64)
    this._plat(-35, 8, 0, 7, 7, 0x90a4ae)
    this._wall(-35, 8.45, -2.5, 6, 1.5, 0.5, 0x546e7a)

    this._addBox(35, 0, 0, 6, 8, 6, 0x455a64)
    this._plat(35, 8, 0, 7, 7, 0x90a4ae)
    this._wall(35, 8.45, 2.5, 6, 1.5, 0.5, 0x546e7a)

    // Access ramps to perches
    this._rampX(0, -42, 3, 10, 0.8, 0.7, 0x607d8b)
    this._rampX(0, 35, 3, 10, 0.8, 0.7, 0x607d8b)

    // ── Jump pads ───────────────────────────────────────────────────────────
    this._jumpPad(0, -18, 20)
    this._jumpPad(0, 18, 20)
    this._jumpPad(-18, 0, 20)
    this._jumpPad(18, 0, 20)
    this._jumpPad(-12, -12, 18)
    this._jumpPad(12, 12, 18)

    // ── Spawn points ────────────────────────────────────────────────────────
    this.spawnPoints = [
      { x: -38, z: -38 },
      { x: 38, z: -38 },
      { x: -38, z: 38 },
      { x: 38, z: 38 },
      { x: 0, z: -38 },
      { x: 0, z: 38 },
      { x: -38, z: 0 },
      { x: 38, z: 0 },
      { x: -20, z: -20 },
      { x: 20, z: 20 },
    ]

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

    // Distant sky gradient plane
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
