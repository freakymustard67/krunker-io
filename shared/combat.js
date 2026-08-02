/**
 * Shared hitscan math. Used identically by the authoritative server and by
 * local/offline simulation, so hit outcomes are deterministic.
 */
import * as THREE from 'three'

export const BODY_RADIUS = 0.34
export const HEAD_RADIUS = 0.24
export const BODY_BOTTOM = 0.12
export const BODY_TOP = 1.25
export const HEAD_HEIGHT = 1.48
export const BODY_SPHERES = 6

const _v1 = new THREE.Vector3()

/** Ray vs sphere. Returns smallest t >= 0, or Infinity. */
export function raySphere(origin, dir, center, radius) {
  const oc = _v1.copy(center).sub(origin)
  const b = oc.dot(dir)
  const c = oc.dot(oc) - radius * radius
  if (c <= 0) return 0 // origin inside sphere
  const disc = b * b - c
  if (disc < 0) return Infinity
  const t = b - Math.sqrt(disc)
  return t >= 0 ? t : Infinity
}

/** Ray vs axis-aligned box (slab method). Returns t, or Infinity. */
export function rayAABB(origin, dir, box, maxT = Infinity) {
  let tmin = 0
  let tmax = maxT
  const axes = [
    [origin.x, dir.x, box.minX, box.maxX],
    [origin.y, dir.y, box.minY, box.maxY],
    [origin.z, dir.z, box.minZ, box.maxZ],
  ]
  for (let a = 0; a < 3; a++) {
    const o = axes[a][0]
    const d = axes[a][1]
    const lo = axes[a][2]
    const hi = axes[a][3]
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity
      continue
    }
    let t1 = (lo - o) / d
    let t2 = (hi - o) / d
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return Infinity
  }
  // Origin inside (or on the entry face of) the box: don't self-block;
  // treat the box as transparent for LOS/hitscan purposes.
  if (tmin <= 0) return Infinity
  return tmin
}

/**
 * Full hitscan: ray against world boxes AND player-shaped targets.
 *
 * targets: array of objects with { pos: Vector3, alive: bool }
 * Returns { target, headshot, dist } or null.
 * The nearest hit (world or player) wins.
 */
export function hitscan(origin, dir, boxes, targets, range = 200) {
  let wallT = range
  if (boxes) {
    for (let i = 0; i < boxes.length; i++) {
      const t = rayAABB(origin, dir, boxes[i], range)
      if (t < wallT) wallT = t
    }
  }
  let best = null
  for (let i = 0; i < targets.length; i++) {
    const tgt = targets[i]
    if (!tgt.alive) continue
    const base = tgt.pos.y
    let bodyT = Infinity
    let headT = raySphere(
      origin, dir,
      _setV(_v1, tgt.pos.x, base + HEAD_HEIGHT, tgt.pos.z),
      HEAD_RADIUS,
    )
    for (let s = 0; s < BODY_SPHERES; s++) {
      const y = base + BODY_BOTTOM + ((BODY_TOP - BODY_BOTTOM) * s) / (BODY_SPHERES - 1)
      const t = raySphere(
        origin, dir,
        _setV(_v1, tgt.pos.x, y, tgt.pos.z),
        BODY_RADIUS,
      )
      if (t < bodyT) bodyT = t
    }
    const effT = Math.min(bodyT, headT)
    if (effT < wallT && effT < range) {
      wallT = effT
      best = { target: tgt, headshot: headT < bodyT, dist: effT }
    }
  }
  return best
}

/** Unit direction vector from yaw (Y axis rotation) + pitch (X axis rotation). */
export function aimDir(yaw, pitch) {
  return new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  )
}

function _setV(v, x, y, z) {
  v.set(x, y, z)
  return v
}

export function hitPoint(origin, dir, dist) {
  return origin.clone().addScaledVector(dir, dist)
}
