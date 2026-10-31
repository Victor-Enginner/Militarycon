/** Sintetizador de Áudio Procedural para FUI / C4ISR (Web Audio API pura, zero assets externos). */

class FuiSoundEngine {
  private ctx: AudioContext | null = null
  public muted = false

  private getCtx(): AudioContext | null {
    if (this.muted) return null
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this.ctx = new AC()
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {})
      }
      return this.ctx
    } catch {
      return null
    }
  }

  /** Bipe mecânico curto de alta frequência ao passar a mão / focar um nó. */
  hoverTick() {
    const ctx = this.getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(2400, now)
    osc.frequency.exponentialRampToValueAtTime(3600, now + 0.028)
    gain.gain.setValueAtTime(0.035, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.035)
  }

  /** Travamento mecânico (Pinch / Click com o dedo no ar). */
  pinchLock() {
    const ctx = this.getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(980, now)
    osc.frequency.setValueAtTime(1960, now + 0.025)
    osc.frequency.exponentialRampToValueAtTime(3100, now + 0.075)
    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.09)
  }

  /** Pulso harmônico quando um comando de voz é capturado e enviado aos agentes. */
  voiceDispatch() {
    const ctx = this.getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    ;[520, 780, 1170].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + i * 0.055)
      gain.gain.setValueAtTime(0.06, now + i * 0.055)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.055 + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.055)
      osc.stop(now + i * 0.055 + 0.15)
    })
  }

  /** Confirmação de calibração do Groot 1 quando novas placas holográficas chegam ao canvas. */
  grootMaterialize() {
    const ctx = this.getCtx()
    if (!ctx) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.22)
    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.28)
  }
}

export const fuiAudio = new FuiSoundEngine()
