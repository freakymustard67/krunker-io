export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function rand(min, max) {
  return Math.random() * (max - min) + min
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1))
}

/**
 * Resolve horizontal (XZ) capsule vs AABB boxes.
 * Also supports standing on tops via separate vertical resolve.
 */
export function resolveXZ(pos, radius, boxes, feetY = 0, height = 1.7) {
  const headY = feetY + height
  for (const b of boxes) {
    // Only collide if vertically overlapping the box
    if (headY <= b.minY + 0.05 || feetY >= b.maxY - 0.05) continue

    const cx = clamp(pos.x, b.minX, b.maxX)
    const cz = clamp(pos.z, b.minZ, b.maxZ)
    const dx = pos.x - cx
    const dz = pos.z - cz
    const dsq = dx * dx + dz * dz
    if (dsq < radius * radius && dsq > 0.0001) {
      const d = Math.sqrt(dsq)
      const overlap = radius - d
      pos.x += (dx / d) * overlap
      pos.z += (dz / d) * overlap
    } else if (dsq < 0.0001) {
      // Centered inside — push out via nearest face
      const left = pos.x - b.minX
      const right = b.maxX - pos.x
      const front = pos.z - b.minZ
      const back = b.maxZ - pos.z
      const m = Math.min(left, right, front, back)
      if (m === left) pos.x = b.minX - radius
      else if (m === right) pos.x = b.maxX + radius
      else if (m === front) pos.z = b.minZ - radius
      else pos.z = b.maxZ + radius
    }
  }
  return pos
}

/**
 * Vertical resolve: stand on platforms, hit ceilings.
 * Returns { grounded, groundY }
 */
export function resolveY(pos, velY, radius, height, boxes, groundY = 0) {
  let grounded = false
  let floorY = groundY
  const feet = pos.y
  const head = pos.y + height

  // World ground
  if (pos.y <= groundY && velY <= 0) {
    pos.y = groundY
    grounded = true
    floorY = groundY
  }

  for (const b of boxes) {
    // Horizontal overlap with expanded radius
    const cx = clamp(pos.x, b.minX, b.maxX)
    const cz = clamp(pos.z, b.minZ, b.maxZ)
    const dx = pos.x - cx
    const dz = pos.z - cz
    const dsq = dx * dx + dz * dz
    if (dsq > radius * radius) continue

    // Landing on top
    if (velY <= 0 && feet >= b.maxY - 0.35 && feet <= b.maxY + 0.15) {
      if (b.maxY >= floorY) {
        pos.y = b.maxY
        floorY = b.maxY
        grounded = true
      }
    }

    // Hitting underside / ceiling
    if (velY > 0 && head >= b.minY && head <= b.minY + 0.4 && feet < b.minY) {
      pos.y = b.minY - height
      velY = 0
    }
  }

  if (grounded) velY = 0
  return { grounded, groundY: floorY, velY }
}

export function distXZ(a, b) {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
