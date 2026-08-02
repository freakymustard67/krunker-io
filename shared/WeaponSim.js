/**
 * Authoritative weapon logic: fire rates, ammo, reloads, pellets, spread and
 * hitscan. Runs on the server for online play and locally in offline mode.
 */
import * as THREE from 'three'
import { SECONDARY, MELEE } from './constants.js'
import { hitscan, aimDir, hitPoint } from './combat.js'

export default class WeaponSim {
  constructor(classDef) {
    this.loadout = [{ ...classDef.weapon }, { ...SECONDARY }, { ...MELEE }]
    this.ammo = this.loadout.map((w) => w.magSize)
    this.slot = 0
    this.reloading = false
    this.reloadTimer = 0
    this.time = 0
    this.lastFire = [0, 0, 0]
    this.maxRange = 200
  }

  get current() { return this.loadout[this.slot] }

  setClass(classDef) {
    this.loadout = [{ ...classDef.weapon }, { ...SECONDARY }, { ...MELEE }]
    this.ammo = this.loadout.map((w) => w.magSize)
    this.slot = 0
    this.reloading = false
    this.reloadTimer = 0
  }

  resetAmmo() {
    this.ammo = this.loadout.map((w) => w.magSize)
    this.reloading = false
    this.reloadTimer = 0
    this.slot = 0
  }

  switchSlot(i) {
    if (i === this.slot || i < 0 || i > 2) return false
    this.slot = i
    this.reloading = false
    this.reloadTimer = 0
    return true
  }

  reload() {
    const w = this.current
    if (w.melee || this.reloading || this.ammo[this.slot] === w.magSize || w.magSize === Infinity) return false
    this.reloading = true
    this.reloadTimer = w.reloadTime
    return true
  }

  canFire() {
    const w = this.current
    return this.time - this.lastFire[this.slot] >= w.fireRate
  }

  update(dt) {
    this.time += dt
    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        this.reloading = false
        this.ammo[this.slot] = this.current.magSize
      }
    }
  }

  /**
   * Attempt to fire the current weapon from `shooter` (a PlayerSim) against
   * `targets` (array of PlayerSim/BotSim with .pos/.alive/.takeDamage).
   * Damage is applied here; the caller handles scoring + events.
   *
   * Returns { fired, melee, hits, killed } where each hit is
   * { target, dmg, headshot, point, killed }.
   */
  tryFire(shooter, boxes, targets) {
    const w = this.current
    const res = { fired: false, melee: false, hits: [], killed: [] }
    if (this.reloading || !shooter.alive) return res
    if (!this.canFire()) return res
    this.lastFire[this.slot] = this.time

    if (w.melee) {
      res.fired = true
      res.melee = true
      this._melee(shooter, boxes, targets, res)
      return res
    }

    const ammo = this.ammo[this.slot]
    if (ammo <= 0) { this.reload(); return res }

    const pellets = w.pellets || 1
    const origin = this._eye(shooter)
    for (let i = 0; i < pellets; i++) {
      const dir = this._dir(shooter, w)
      const hit = hitscan(origin, dir, boxes, targets, this.maxRange)
      if (hit) {
        const isHead = hit.headshot
        const dmg = Math.round(w.damage * (isHead ? (w.headMult || 1.5) : 1))
        const killed = hit.target.takeDamage(dmg)
        const point = hitPoint(origin, dir, hit.dist)
        res.hits.push({ target: hit.target, dmg, headshot: isHead, point, killed })
        if (killed) res.killed.push({ target: hit.target, headshot: isHead, melee: false, dmg })
      }
    }

    if (w.magSize !== Infinity) this.ammo[this.slot]--
    if (this.ammo[this.slot] <= 0) this.reload() // auto-reload on empty
    res.fired = true
    return res
  }

  _melee(shooter, boxes, targets, res) {
    const origin = this._eye(shooter)
    const dir = aimDir(shooter.yaw, shooter.pitch)
    const hit = hitscan(origin, dir, boxes, targets, MELEE.range)
    if (hit) {
      const killed = hit.target.takeDamage(MELEE.damage)
      const point = hitPoint(origin, dir, hit.dist)
      res.hits.push({ target: hit.target, dmg: MELEE.damage, headshot: hit.headshot, point, killed })
      if (killed) res.killed.push({ target: hit.target, headshot: hit.headshot, melee: true, dmg: MELEE.damage })
    }
  }

  _dir(shooter, w) {
    const spread = shooter.ads ? (w.adsSpread ?? 0) : (w.spread ?? 0.05)
    // Moving spread penalty
    const spd = Math.sqrt(shooter.vel.x ** 2 + shooter.vel.z ** 2)
    const movePen = shooter.grounded ? spd * 0.004 : spd * 0.006
    const finalSpread = spread + movePen
    const dir = aimDir(shooter.yaw, shooter.pitch)
    dir.x += (Math.random() - 0.5) * finalSpread * 2
    dir.y += (Math.random() - 0.5) * finalSpread * 2
    dir.z += (Math.random() - 0.5) * finalSpread * 2
    return dir.normalize()
  }

  _eye(shooter) {
    return new THREE.Vector3(shooter.pos.x, shooter.pos.y + shooter.eyeY, shooter.pos.z)
  }
}
