/**
 * Krunker-style hit sounds + firing sounds using Web Audio API.
 */
export default class SoundFX {
  constructor() {
    this.ctx = null
    this._initOnInteraction()
  }

  _initOnInteraction() {
    const start = () => {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      }
      document.removeEventListener('mousedown', start)
      document.removeEventListener('keydown', start)
    }
    document.addEventListener('mousedown', start)
    document.addEventListener('keydown', start)
  }

  _ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      } catch { return null }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  /** Short blip for hitmarker */
  hit(headshot = false) {
    const ctx = this._ensure()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.setValueAtTime(headshot ? 880 : 660, ctx.currentTime)
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.06)
  }

  /** Kill sound */
  kill() {
    const ctx = this._ensure()
    if (!ctx) return
    const t = ctx.currentTime
    // Two-tone chime
    for (const freq of [440, 660]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(freq, t + (freq === 440 ? 0 : 0.08))
      gain.gain.setValueAtTime(0.1, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
      osc.start(t)
      osc.stop(t + 0.15)
    }
  }

  /** Weapon fire */
  fire(auto = false) {
    const ctx = this._ensure()
    if (!ctx) return
    const t = ctx.currentTime
    const noiseLen = auto ? 0.05 : 0.08
    // White noise burst
    const bufferSize = Math.floor(ctx.sampleRate * noiseLen)
    if (bufferSize < 1) return
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(auto ? 3000 : 1500, t)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + noiseLen)
    source.start(t)
  }

  /** Melee swing */
  meleeSwing() {
    const ctx = this._ensure()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(300, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.04, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.1)
  }
}
