/**
 * Data-driven "Burg"-inspired map (shared between client rendering and
 * server-side simulation). Layout preserved from the original scene builder,
 * minus one misplaced duplicate ramp.
 *
 * Each entry: { x, y, z, w, h, d, color, emissive?, emissiveIntensity? }
 * where (x, y, z) is the box CENTER and y sits at the FLOOR level.
 */
const RAW = []

function add(x, y, z, w, h, d, color, emissive = 0, emissiveIntensity = 0.4) {
  RAW.push({ x, y, z, w, h, d, color, emissive, emissiveIntensity })
}

function plat(x, y, z, w, d, color = 0xc4a882) {
  add(x, y, z, w, 0.45, d, color)
}

function wall(x, y, z, w, h, d, color = 0x8b7355) {
  add(x, y, z, w, h, d, color)
}

/** Stepped ramp along +Z direction from low (zStart) to high */
function rampZ(x, zStart, width, steps, stepH, stepD, color) {
  for (let i = 0; i < steps; i++) {
    add(x, i * stepH, zStart + i * stepD + stepD / 2, width, stepH, stepD, color)
  }
}

/** Stepped ramp along +X */
function rampX(z, xStart, depth, steps, stepH, stepD, color) {
  for (let i = 0; i < steps; i++) {
    add(xStart + i * stepD + stepD / 2, i * stepH, z, stepD, stepH, depth, color)
  }
}

function jumpPad(x, z, force = 22) {
  add(x, 0, z, 2.2, 0.2, 2.2, 0x00e5ff, 0x00bcd4, 0.6)
  JUMP_PADS.push({ x, z, r: 1.3, force })
}

const size = 90

// Outer boundary walls
const wallH = 6
const wallC = 0x6b5b4a
const half = size / 2 - 0.5
wall(0, 0, -half, size, wallH, 1.2, wallC)
wall(0, 0, half, size, wallH, 1.2, wallC)
wall(-half, 0, 0, 1.2, wallH, size, wallC)
wall(half, 0, 0, 1.2, wallH, size, wallC)

// ── Center tower (multi-level) ──────────────────────────────────────────────
add(0, 0, 0, 10, 1.5, 10, 0x8d6e63) // base
plat(0, 4, 0, 8, 8, 0xc4a882) // mid deck
add(0, 4.45, 0, 4, 3, 4, 0x795548) // tower core
plat(0, 7.5, 0, 5, 5, 0xd7c4a8) // top deck
// Center access ramps (north + west)
rampZ(0, -9, 3.5, 5, 0.3, 0.9, 0xa1887f)
rampX(0, -9, 3.5, 5, 0.3, 0.9, 0xa1887f)
// Stairs up to top from mid
add(2.5, 4.45, 0, 1.2, 0.7, 1.5, 0xa1887f)
add(2.5, 5.15, 0, 1.2, 0.7, 1.5, 0xa1887f)
add(2.5, 5.85, 0, 1.2, 0.7, 1.5, 0xa1887f)
add(2.5, 6.55, 0, 1.2, 0.7, 1.5, 0xa1887f)

// ── Four corner buildings ───────────────────────────────────────────────────
const corners = [
  { x: -28, z: -28 },
  { x: 28, z: -28 },
  { x: -28, z: 28 },
  { x: 28, z: 28 },
]
const bCols = [0xd84315, 0x1565c0, 0x2e7d32, 0x6a1b9a]
corners.forEach((c, i) => {
  add(c.x, 0, c.z, 12, 5, 12, bCols[i])
  plat(c.x, 5, c.z, 13, 13, 0xbcaaa4)
  wall(c.x, 5.45, c.z - 5, 10, 1.8, 0.6, 0x8d6e63)
  const rx = c.x > 0 ? c.x - 8 : c.x + 8
  rampZ(rx, c.z > 0 ? c.z - 14 : c.z + 5, 3, 8, 0.625, 1.1, 0xa1887f)
  plat(c.x + (c.x > 0 ? -10 : 10), 2.5, c.z, 6, 6, 0xc4a882)
})

// ── Mid-side elevated walkways ──────────────────────────────────────────────
plat(0, 3, -22, 18, 4, 0xb0bec5)
plat(0, 3, 22, 18, 4, 0xb0bec5)
plat(-22, 3, 0, 4, 18, 0xb0bec5)
plat(22, 3, 0, 4, 18, 0xb0bec5)

// Connecting ramps to bridges
rampZ(-6, -30, 3, 6, 0.5, 1.1, 0x90a4ae)
rampZ(6, 22, 3, 6, 0.5, 1.1, 0x90a4ae)
rampX(-6, -30, 3, 6, 0.5, 1.1, 0x90a4ae)
rampX(6, 22, 3, 6, 0.5, 1.1, 0x90a4ae)

// ── Mid-map cover crates ────────────────────────────────────────────────────
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
  add(x, y, z, w, h, d, crateC)
}

// Low walls for cover
wall(-10, 0, 0, 0.6, 1.4, 8, 0x78909c)
wall(10, 0, 0, 0.6, 1.4, 8, 0x78909c)
wall(0, 0, -10, 8, 1.4, 0.6, 0x78909c)
wall(0, 0, 10, 8, 1.4, 0.6, 0x78909c)

// ── Sniper perches (high platforms) ─────────────────────────────────────────
add(-35, 0, 0, 6, 8, 6, 0x455a64)
plat(-35, 8, 0, 7, 7, 0x90a4ae)
wall(-35, 8.45, -2.5, 6, 1.5, 0.5, 0x546e7a)

add(35, 0, 0, 6, 8, 6, 0x455a64)
plat(35, 8, 0, 7, 7, 0x90a4ae)
wall(35, 8.45, 2.5, 6, 1.5, 0.5, 0x546e7a)

// Access ramps to perches
rampX(0, -42, 3, 10, 0.8, 0.7, 0x607d8b)
rampX(0, 35, 3, 10, 0.8, 0.7, 0x607d8b)

// ── Jump pads ───────────────────────────────────────────────────────────────
const JUMP_PADS = []
jumpPad(0, -18, 20)
jumpPad(0, 18, 20)
jumpPad(-18, 0, 20)
jumpPad(18, 0, 20)
jumpPad(-12, -12, 18)
jumpPad(12, 12, 18)

// ── Spawn points ────────────────────────────────────────────────────────────
const SPAWN_POINTS = [
  { x: -38, z: -38 },
  { x: 38, z: -38 },
  { x: -38, z: 38 },
  { x: 38, z: 38 },
  { x: 0, z: -38 },
  { x: 0, z: 38 },
  { x: -38, z: -8 },
  { x: 38, z: -8 },
  { x: -20, z: -20 },
  { x: 20, z: 20 },
]

// AABB collision boxes derived once — used by the server AND the client sim
const COLLISION = RAW.map((b) => ({
  minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
  minY: b.y, maxY: b.y + b.h,
  minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
}))

export const BURG = {
  name: 'burg',
  boxes: RAW,
  collisionBoxes: COLLISION,
  jumpPads: JUMP_PADS,
  spawnPoints: SPAWN_POINTS,
  bound: 43,
}
