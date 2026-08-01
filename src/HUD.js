import { CLASSES, MATCH_TIME } from './constants.js'
import { formatTime } from './utils.js'

export default class HUD {
  constructor(player, weapon, gameState) {
    this.player = player
    this.weapon = weapon
    this.gameState = gameState
    this.killFeedItems = []
    this.minimapCtx = document.getElementById('mm-canvas')?.getContext('2d')
    this.scoreboardOpen = false
    this.matchTime = MATCH_TIME
    this.matchOver = false
    this.dmgNumbers = []
    this.lastHitBy = null // bot reference for kill cam

    this._setupDeathScreen()
    this._setupScoreboard()
  }

  _setupDeathScreen() {
    document.getElementById('respawn-btn')?.addEventListener('click', () => {
      this.gameState.respawn()
    })
  }

  _setupScoreboard() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault()
        this.scoreboardOpen = true
        this._renderScoreboard()
        document.getElementById('scoreboard')?.classList.add('open')
      }
    })
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.scoreboardOpen = false
        document.getElementById('scoreboard')?.classList.remove('open')
      }
    })
  }

  addKill(killerName, victimName, headshot = false, melee = false) {
    let msg = `${killerName} → ${victimName}`
    if (headshot) msg += '  [HS]'
    if (melee) msg += '  [KNIFE]'
    this._addKillFeedItem(msg)
  }

  _addKillFeedItem(msg) {
    const feed = document.getElementById('kill-feed')
    if (!feed) return
    const el = document.createElement('div')
    el.className = 'kf-item'
    el.textContent = msg
    feed.appendChild(el)
    while (feed.children.length > 6) feed.removeChild(feed.firstChild)
    setTimeout(() => {
      el.classList.add('fade')
      setTimeout(() => el.remove(), 700)
    }, 2800)
  }

  update(dt) {
    if (!this.matchOver) {
      this.matchTime -= dt
      if (this.matchTime <= 0) {
        this.matchTime = 0
        this.matchOver = true
        this.gameState.endMatch?.()
      }
    }

    // Update floating damage numbers
    for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
      const dn = this.dmgNumbers[i]
      dn.life -= dt
      dn.y += dt * 32
      dn.el.style.transform = `translate(-50%, -${dn.y}px)`
      dn.el.style.opacity = Math.max(0, dn.life / 0.7)
      if (dn.life <= 0) {
        dn.el.remove()
        this.dmgNumbers.splice(i, 1)
      }
    }

    const p = this.player
    const hpPct = Math.max(0, (p.health / p.maxHealth) * 100)
    const fill = document.getElementById('health-fill')
    if (fill) {
      fill.style.width = hpPct + '%'
      fill.style.background = p.health <= 30 ? '#f44336' : '#FBC02D'
    }
    const hNum = document.getElementById('health-num')
    if (hNum) hNum.textContent = Math.ceil(p.health)

    const kc = document.getElementById('kill-counter')
    if (kc) kc.textContent = `${p.kills}`

    const sc = document.getElementById('score-display')
    if (sc) sc.textContent = String(p.score)

    const timer = document.getElementById('match-timer')
    if (timer) {
      timer.textContent = formatTime(this.matchTime)
      timer.classList.toggle('low', this.matchTime < 30 && this.matchTime > 0)
    }

    const cls = document.getElementById('class-display')
    if (cls) {
      const c = CLASSES.find((x) => x.id === p.classId)
      if (c) cls.textContent = c.name
    }

    const speed = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z)
    const sd = document.getElementById('speed-display')
    if (sd) sd.textContent = speed.toFixed(0)

    const crosshair = document.getElementById('crosshair')
    if (crosshair) {
      if (p.ads) {
        crosshair.style.opacity = '0'
        crosshair.style.transform = 'translate(-50%,-50%) scale(0.4)'
      } else {
        crosshair.style.opacity = '1'
        const movingScale = 1 + Math.min(speed / 25, 0.8)
        crosshair.style.transform = `translate(-50%,-50%) scale(${movingScale})`
      }
    }

    const fk = document.getElementById('final-kills')
    if (fk) fk.textContent = String(p.kills)

    // Death / auto-respawn countdown
    if (!p.alive) {
      this.showDeath()
      const cd = document.getElementById('respawn-cd')
      if (cd) cd.textContent = Math.max(0, p.respawnTimer).toFixed(1)
      if (p.respawnTimer <= 0) {
        this.gameState.respawn()
      }
    }

    if (this.scoreboardOpen) this._renderScoreboard()
    this._drawMinimap()
  }

  /** Show floating damage number at a screen position (from 3D world pos) */
  showDamageNumber(worldPos, amount, headshot = false) {
    if (!worldPos) return
    // Project 3D position to screen
    // We don't have direct camera access here, but Weapon can call a method
    // that we expose via the game loop. For now, we'll place near crosshair area.
    const el = document.createElement('div')
    el.className = 'dmg-num' + (headshot ? ' headshot' : '')
    el.textContent = String(Math.round(amount))
    // Random offset around crosshair
    const ox = (Math.random() - 0.5) * 60
    const oy = (Math.random() - 0.5) * 50 - 20
    el.style.left = `calc(50% + ${ox}px)`
    el.style.top = `calc(50% + ${oy}px)`
    document.getElementById('hud')?.appendChild(el)
    this.dmgNumbers.push({ el, life: 0.8, y: 0 })
  }

  _renderScoreboard() {
    const body = document.getElementById('sb-body')
    if (!body) return
    const rows = [
      {
        name: this.player.name,
        score: this.player.score,
        kills: this.player.kills,
        deaths: this.player.deaths,
        cls: this.player.classId,
        you: true,
      },
      ...(this.gameState.bots || []).map((b) => ({
        name: b.name,
        score: b.score,
        kills: b.kills,
        deaths: b.deaths,
        cls: b.cls?.id || '?',
        you: false,
      })),
    ]
    rows.sort((a, b) => b.score - a.score || b.kills - a.kills)

    body.innerHTML = rows.map((r, i) => `
      <tr class="${r.you ? 'you' : ''}">
        <td>${i + 1}</td>
        <td>${r.name}${r.you ? ' (you)' : ''}</td>
        <td>${(r.cls || '').toUpperCase()}</td>
        <td>${r.score}</td>
        <td>${r.kills}</td>
        <td>${r.deaths}</td>
      </tr>
    `).join('')
  }

  _drawMinimap() {
    const ctx = this.minimapCtx
    if (!ctx) return
    const s = 130
    const scale = s / 90
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, s, s)

    const boxes = this.gameState.world?.boxes || []
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    for (const b of boxes) {
      if (b.maxY - b.minY < 0.6) continue // skip thin floors for clarity
      const x = (b.minX + 45) * scale
      const z = (b.minZ + 45) * scale
      const w = (b.maxX - b.minX) * scale
      const h = (b.maxZ - b.minZ) * scale
      ctx.fillRect(x, z, w, h)
    }

    // Player with direction
    const px = (this.player.position.x + 45) * scale
    const pz = (this.player.position.z + 45) * scale
    ctx.fillStyle = '#4CAF50'
    ctx.beginPath()
    ctx.arc(px, pz, 3.5, 0, Math.PI * 2)
    ctx.fill()

    const bots = this.gameState.bots || []
    for (const bot of bots) {
      if (!bot.alive) continue
      const bx = (bot.pos.x + 45) * scale
      const bz = (bot.pos.z + 45) * scale
      ctx.fillStyle = '#ff4444'
      ctx.fillRect(bx - 2, bz - 2, 4, 4)
    }
  }

  showDeath() {
    const el = document.getElementById('death-screen')
    if (el) el.style.display = 'flex'
    const killerEl = document.querySelector('.killed-by')
    if (killerEl) {
      const kb = this.lastHitBy || (this.player && this.player.lastHitBy)
      killerEl.textContent = kb ? `Killed by ${kb.name}` : ''
      killerEl.style.display = kb ? 'block' : 'none'
    }
  }

  hideDeath() {
    const el = document.getElementById('death-screen')
    if (el) el.style.display = 'none'
  }

  showMatchEnd(winnerName) {
    const el = document.getElementById('match-end')
    if (!el) return
    el.style.display = 'flex'
    const w = document.getElementById('winner-name')
    if (w) w.textContent = winnerName
    this._renderScoreboard()
    document.getElementById('scoreboard')?.classList.add('open')
  }
}

/** Build class selection UI and resolve when user picks */
export function showClassSelect() {
  return new Promise((resolve) => {
    const root = document.getElementById('class-select')
    const grid = document.getElementById('class-grid')
    if (!root || !grid) {
      resolve(CLASSES[0])
      return
    }
    grid.innerHTML = ''
    CLASSES.forEach((cls) => {
      const card = document.createElement('button')
      card.className = 'class-card'
      card.innerHTML = `
        <div class="class-swatch" style="background:#${cls.color.toString(16).padStart(6, '0')}"></div>
        <div class="class-name">${cls.name}</div>
        <div class="class-weapon">${cls.weapon.name}</div>
        <div class="class-desc">${cls.desc}</div>
        <div class="class-stats">HP ${cls.health} · SPD ${(cls.speed * 100) | 0}%</div>
      `
      card.addEventListener('click', () => {
        root.style.display = 'none'
        resolve(cls)
      })
      grid.appendChild(card)
    })
    root.style.display = 'flex'
  })
}
