import { Pause, Play, SkipBack, SkipForward, Sparkles, Terminal } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import { fuiAudio } from './FuiAudio'
import { biometriaGlobal } from './FuiWebGL'

export interface CenaAscii {
  id: string
  codigo: string
  nome: string
  subtitulo: string
}

export const CENAS_ASCII: CenaAscii[] = [
  {
    id: 'torus',
    codigo: '01/06',
    nome: '3D TORUS // TOPOLOGIA NEURAL',
    subtitulo: 'Z-Buffer ASCII Torus + Anéis Orbitais Groot-1',
  },
  {
    id: 'radar',
    codigo: '02/06',
    nome: 'TOPO-RADAR // TERRENO C4ISR',
    subtitulo: 'Mapa Topográfico ASCII + Varredura Azimutal 360°',
  },
  {
    id: 'globe',
    codigo: '03/06',
    nome: "GOD'S EYE // ESFERA ORBITAL 4D",
    subtitulo: 'Globo Meridiano ASCII + Satélites de Reconhecimento',
  },
  {
    id: 'matrix',
    codigo: '04/06',
    nome: 'ARXIV CoRR // DATA STREAM',
    subtitulo: 'Cascata Hexadecimal + Tokens AirLLM & OpenObserve',
  },
  {
    id: 'wave',
    codigo: '05/06',
    nome: 'QUANTUM PLEXUS // INTERFERÊNCIA',
    subtitulo: 'Campo Harmônico de Ondas ASCII + Malha Sincronizada',
  },
  {
    id: 'horizon',
    codigo: '06/06',
    nome: 'CYBER HORIZON // MMPOSE GRID',
    subtitulo: 'Grade Perspectiva 3D + Pulso Biométrico NUI',
  },
]

const RAMP_PADRAO = ' .·:-=+*#%@█'
const RAMP_TORUS = '.,-~:;=!*#$@'
const RAMP_BLOCOS = ' ·░▒▓█'
const TOKENS_MATRIX = [
  'GROOT-1',
  'AIRLLM',
  'MMPOSE',
  'OPENPOSE',
  'OPENOBSERVE',
  'TASKOSAUR',
  'GODS-EYE',
  'ARXIV:2604',
  'C4ISR',
  'cs.AI',
  'cs.CV',
  'cs.RO',
]

export const AsciiProductionBg = memo(function AsciiProductionBg({
  zenMode = false,
}: {
  zenMode?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [cenaIdx, setCenaIdx] = useState(0)
  const [emLoop, setEmLoop] = useState(true)
  const [intensidade, setIntensidade] = useState<'sutil' | 'medio' | 'forte'>('medio')
  const [progressoLoop, setProgressoLoop] = useState(0)

  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -999,
    y: -999,
    active: false,
  })

  // Rastrea posição do mouse na área de produção para reagir no campo ASCII
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      mouseRef.current.active = true
    }
    const onLeave = () => {
      mouseRef.current.active = false
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Temporizador do Loop Automático de cenas ASCII (troca a cada 11 segundos)
  useEffect(() => {
    if (!emLoop) {
      setProgressoLoop(0)
      return
    }
    const duracaoMs = 11000
    const inicio = performance.now()
    const timer = setInterval(() => {
      const dec = performance.now() - inicio
      const pct = Math.min(100, (dec / duracaoMs) * 100)
      setProgressoLoop(pct)
      if (dec >= duracaoMs) {
        setCenaIdx((atual) => (atual + 1) % CENAS_ASCII.length)
      }
    }, 120)
    return () => clearInterval(timer)
  }, [emLoop, cenaIdx])

  // Renderizador 60fps em Canvas Monoespaçado de Alta Performance
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let cols = 0
    let rows = 0
    const cellW = 14
    const cellH = 18

    // Colunas para cena Matrix
    let drops: number[] = []
    let speeds: number[] = []

    const ajustarTamanho = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / cellW)
      rows = Math.ceil(h / cellH)
      drops = Array.from({ length: cols }, () => Math.random() * rows)
      speeds = Array.from({ length: cols }, () => 0.18 + Math.random() * 0.42)
    }

    ajustarTamanho()
    window.addEventListener('resize', ajustarTamanho)

    let t0 = performance.now()
    let ultimoFrame = 0

    const alphaMult = intensidade === 'sutil' ? 0.58 : intensidade === 'medio' ? 0.92 : 1.32

    const renderizar = (agora: number) => {
      rafId = requestAnimationFrame(renderizar)
      // Trava em ~30fps para estética autêntica de terminal ASCII e 0% impacto no ReactFlow
      if (agora - ultimoFrame < 33) return
      ultimoFrame = agora

      const t = (agora - t0) * 0.001
      const w = window.innerWidth
      const h = window.innerHeight

      ctx.clearRect(0, 0, w, h)
      ctx.font = '600 12px "JetBrains Mono", "Fira Code", Consolas, monospace'
      ctx.textBaseline = 'top'

      // Posição interativa (Mão Direita do MediaPipe tem prioridade, senão Mouse)
      const pointerX = biometriaGlobal.handRight.active
        ? biometriaGlobal.handRight.screenX
        : mouseRef.current.x
      const pointerY = biometriaGlobal.handRight.active
        ? biometriaGlobal.handRight.screenY
        : mouseRef.current.y
      const pCol = pointerX / cellW
      const pRow = pointerY / cellH

      const cx = cols * 0.5
      const cy = rows * 0.5

      // ==================== CENA 0: 3D TORUS (DONUT) + ORBITAL FIELD ====================
      if (cenaIdx === 0) {
        const A = t * 0.85
        const B = t * 0.52
        const cosA = Math.cos(A)
        const sinA = Math.sin(A)
        const cosB = Math.cos(B)
        const sinB = Math.sin(B)

        // Fundo de grade sutil com pontos e ondas radiais
        for (let r = 0; r < rows; r++) {
          const dy = (r - cy) * 1.25
          for (let c = 0; c < cols; c++) {
            const dx = c - cx
            const dist = Math.hypot(dx, dy)
            const distCursor = Math.hypot(c - pCol, r - pRow)

            // Anel orbital externo ou onda de cursor
            const wave = Math.sin(dist * 0.28 - t * 2.1)
            if (distCursor < 8) {
              const idx = Math.min(
                RAMP_PADRAO.length - 1,
                Math.max(1, Math.floor((1 - distCursor / 8) * RAMP_PADRAO.length))
              )
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.55 * alphaMult).toFixed(2)})`
              ctx.fillText(RAMP_PADRAO[idx], c * cellW, r * cellH)
            } else if (Math.abs(dist - 24) < 0.8 || Math.abs(dist - 36) < 0.7) {
              ctx.fillStyle = `rgba(255, 255, 255, ${(0.16 * alphaMult).toFixed(2)})`
              ctx.fillText( (c + r) % 2 === 0 ? '·' : ':', c * cellW, r * cellH)
            } else if (wave > 0.82 && (c + r) % 3 === 0) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.14 * alphaMult).toFixed(2)})`
              ctx.fillText('.', c * cellW, r * cellH)
            }
          }
        }

        // Z-buffer do Torus 3D no centro da área de produção
        const zbuf = new Float32Array(cols * rows)
        const chbuf: string[] = new Array(cols * rows).fill('')
        const lumBuf = new Float32Array(cols * rows)

        for (let theta = 0; theta < 6.28; theta += 0.09) {
          const cost = Math.cos(theta)
          const sint = Math.sin(theta)
          for (let phi = 0; phi < 6.28; phi += 0.04) {
            const cosp = Math.cos(phi)
            const sinp = Math.sin(phi)

            const circleX = 2.1 + 0.95 * cost
            const circleY = 0.95 * sint

            const x = circleX * (cosB * cosp + sinA * sinB * sinp) - circleY * cosA * sinB
            const y = circleX * (sinB * cosp - sinA * cosB * sinp) + circleY * cosA * cosB
            const z = 4.6 + cosA * circleX * sinp + circleY * sinA
            const ooz = 1 / z

            const xp = Math.floor(cx + 36 * ooz * x)
            const yp = Math.floor(cy + 22 * ooz * y)

            if (xp >= 0 && xp < cols && yp >= 0 && yp < rows) {
              const L =
                cosp * cost * sinB -
                cosA * cost * sinp -
                sinA * sint +
                cosB * (cosA * sint - cost * sinA * sinp)
              const pos = xp + yp * cols
              if (ooz > zbuf[pos]) {
                zbuf[pos] = ooz
                const lumIdx = Math.max(0, Math.min(11, Math.floor((L + 1.4) * 4.5)))
                chbuf[pos] = RAMP_TORUS[lumIdx]
                lumBuf[pos] = L
              }
            }
          }
        }

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const pos = c + r * cols
            const ch = chbuf[pos]
            if (!ch) continue
            const L = lumBuf[pos]
            if (L > 0.45) {
              const a = Math.min(0.85, (0.28 + L * 0.32) * alphaMult)
              ctx.fillStyle = `rgba(255, 85, 0, ${a.toFixed(2)})`
            } else {
              const a = Math.min(0.65, (0.18 + Math.max(0, L + 0.8) * 0.22) * alphaMult)
              ctx.fillStyle = `rgba(235, 240, 248, ${a.toFixed(2)})`
            }
            ctx.fillText(ch, c * cellW, r * cellH)
          }
        }
      }

      // ==================== CENA 1: TOPOGRAPHIC RADAR MATRIX ====================
      else if (cenaIdx === 1) {
        const radarAngle = (t * 0.95) % (Math.PI * 2)
        for (let r = 0; r < rows; r++) {
          const ny = (r - cy) / Math.max(1, rows * 0.45)
          for (let c = 0; c < cols; c++) {
            const nx = (c - cx) / Math.max(1, cols * 0.45)
            const dist = Math.hypot(nx * 1.35, ny)
            const ang = Math.atan2(ny, nx * 1.35)
            const angNormalized = ang < 0 ? ang + Math.PI * 2 : ang

            // Elevação topográfica procedural
            const elev =
              Math.sin(c * 0.14 + t * 0.6) * Math.cos(r * 0.16 - t * 0.4) +
              0.5 * Math.sin((c + r) * 0.09 - t * 0.8)

            // Feixe de varredura azimutal
            let diffAng = radarAngle - angNormalized
            if (diffAng < 0) diffAng += Math.PI * 2
            const noFeixe = diffAng >= 0 && diffAng < 0.65 && dist < 1.15

            const distCursor = Math.hypot(c - pCol, r - pRow)
            const pulsoCursor = distCursor < 7 ? 1 - distCursor / 7 : 0

            // Anéis concêntricos do radar em ASCII
            if (Math.abs(dist - 0.35) < 0.018 || Math.abs(dist - 0.7) < 0.016 || Math.abs(dist - 1.05) < 0.015) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.36 * alphaMult).toFixed(2)})`
              ctx.fillText('+', c * cellW, r * cellH)
              continue
            }

            const v = (elev + 1.5) / 3.0 + pulsoCursor * 0.5
            const idx = Math.min(RAMP_PADRAO.length - 1, Math.max(0, Math.floor(v * RAMP_PADRAO.length)))
            const ch = RAMP_PADRAO[idx]
            if (ch === ' ') continue

            if (noFeixe || pulsoCursor > 0.2) {
              const fade = noFeixe ? 1 - diffAng / 0.65 : pulsoCursor
              ctx.fillStyle = `rgba(255, 85, 0, ${Math.min(0.88, (0.26 + fade * 0.52) * alphaMult).toFixed(2)})`
            } else {
              ctx.fillStyle = `rgba(220, 228, 240, ${(0.14 * v * alphaMult).toFixed(2)})`
            }
            ctx.fillText(ch, c * cellW, r * cellH)
          }
        }
      }

      // ==================== CENA 2: GOD'S EYE 4D GLOBE ====================
      else if (cenaIdx === 2) {
        const radius = Math.min(cols * 0.32, rows * 0.42)
        const rot = t * 0.55

        for (let r = 0; r < rows; r++) {
          const dy = (r - cy) * 1.18
          for (let c = 0; c < cols; c++) {
            const dx = c - cx
            const d = Math.hypot(dx, dy)
            const distCursor = Math.hypot(c - pCol, r - pRow)

            if (distCursor < 6.5) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.62 * alphaMult).toFixed(2)})`
              ctx.fillText('#', c * cellW, r * cellH)
              continue
            }

            if (d <= radius) {
              const nz = Math.sqrt(Math.max(0, radius * radius - d * d)) / radius
              const nx = dx / radius
              const ny = dy / radius
              const lon = Math.atan2(nx, nz) + rot
              const lat = Math.asin(Math.max(-1, Math.min(1, ny)))

              const gridLon = Math.abs(Math.sin(lon * 6))
              const gridLat = Math.abs(Math.sin(lat * 6))

              if (gridLon < 0.14 || gridLat < 0.14) {
                const isEq = Math.abs(lat) < 0.08
                ctx.fillStyle = isEq
                  ? `rgba(255, 85, 0, ${(0.62 * nz * alphaMult).toFixed(2)})`
                  : `rgba(240, 245, 255, ${((0.18 + nz * 0.35) * alphaMult).toFixed(2)})`
                ctx.fillText(isEq ? '=' : nz > 0.65 ? '+' : '·', c * cellW, r * cellH)
              } else if ((c + r) % 4 === 0 && nz > 0.35) {
                ctx.fillStyle = `rgba(255, 85, 0, ${(0.16 * nz * alphaMult).toFixed(2)})`
                ctx.fillText('.', c * cellW, r * cellH)
              }
            } else if (Math.abs(d - radius * 1.24) < 0.9) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.28 * alphaMult).toFixed(2)})`
              ctx.fillText('~', c * cellW, r * cellH)
            } else if (c % 8 === 0 && r % 4 === 0) {
              ctx.fillStyle = `rgba(255, 255, 255, ${(0.07 * alphaMult).toFixed(2)})`
              ctx.fillText('·', c * cellW, r * cellH)
            }
          }
        }
      }

      // ==================== CENA 3: ARXIV CoRR & HEX MATRIX STREAM ====================
      else if (cenaIdx === 3) {
        const glyphs = '0123456789ABCDEF+-=*:·#∑∆λΩ'
        for (let c = 0; c < cols; c++) {
          const headRow = Math.floor(drops[c])
          const token = TOKENS_MATRIX[c % TOKENS_MATRIX.length]

          for (let r = 0; r < rows; r++) {
            const distHead = headRow - r
            const distCursor = Math.hypot(c - pCol, r - pRow)

            if (distCursor < 6) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.68 * alphaMult).toFixed(2)})`
              ctx.fillText(token[r % token.length], c * cellW, r * cellH)
              continue
            }

            if (distHead >= 0 && distHead < 14) {
              const fade = 1 - distHead / 14
              const isHead = distHead === 0
              const ch =
                c % 3 === 0
                  ? token[r % token.length]
                  : glyphs[(c * 7 + r * 13 + Math.floor(t * 8)) % glyphs.length]

              if (isHead) {
                ctx.fillStyle = `rgba(255, 85, 0, ${Math.min(0.9, 0.72 * alphaMult).toFixed(2)})`
              } else if (distHead < 3) {
                ctx.fillStyle = `rgba(255, 130, 50, ${(0.45 * fade * alphaMult).toFixed(2)})`
              } else {
                ctx.fillStyle = `rgba(220, 230, 242, ${(0.24 * fade * alphaMult).toFixed(2)})`
              }
              ctx.fillText(ch, c * cellW, r * cellH)
            } else if (r % 6 === 0 && c % 8 === 0) {
              ctx.fillStyle = `rgba(255, 255, 255, ${(0.07 * alphaMult).toFixed(2)})`
              ctx.fillText('┼', c * cellW, r * cellH)
            }
          }

          drops[c] += speeds[c]
          if (drops[c] - 14 > rows) {
            drops[c] = -Math.random() * 12
          }
        }
      }

      // ==================== CENA 4: QUANTUM PLEXUS WAVEFIELD ====================
      else if (cenaIdx === 4) {
        const s1x = cx - Math.cos(t * 0.7) * (cols * 0.22)
        const s1y = cy - Math.sin(t * 0.5) * (rows * 0.18)
        const s2x = cx + Math.cos(t * 0.6) * (cols * 0.22)
        const s2y = cy + Math.sin(t * 0.8) * (rows * 0.18)

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const d1 = Math.hypot(c - s1x, (r - s1y) * 1.2)
            const d2 = Math.hypot(c - s2x, (r - s2y) * 1.2)
            const dc = Math.hypot(c - pCol, (r - pRow) * 1.2)

            const w1 = Math.sin(d1 * 0.42 - t * 2.4)
            const w2 = Math.sin(d2 * 0.42 - t * 2.1)
            const wc = dc < 14 ? Math.cos(dc * 0.5 - t * 4.0) * (1 - dc / 14) : 0

            const val = (w1 + w2 + wc * 1.8 + 2.2) / 4.4
            const idx = Math.min(RAMP_BLOCOS.length - 1, Math.max(0, Math.floor(val * RAMP_BLOCOS.length)))
            const ch = RAMP_BLOCOS[idx]
            if (ch === ' ') continue

            if (val > 0.68 || dc < 7) {
              ctx.fillStyle = `rgba(255, 85, 0, ${Math.min(0.82, val * 0.48 * alphaMult).toFixed(2)})`
            } else {
              ctx.fillStyle = `rgba(230, 235, 245, ${(val * 0.24 * alphaMult).toFixed(2)})`
            }
            ctx.fillText(ch, c * cellW, r * cellH)
          }
        }
      }

      // ==================== CENA 5: CYBER HORIZON // MMPOSE PERSPECTIVE GRID ====================
      else {
        const horizonRow = Math.floor(rows * 0.42)
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const distCursor = Math.hypot(c - pCol, r - pRow)
            if (distCursor < 7) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.65 * (1 - distCursor / 7) * alphaMult).toFixed(2)})`
              ctx.fillText('◈', c * cellW, r * cellH)
              continue
            }

            if (r < horizonRow) {
              // Céu orbital com estrelas/telemetria ASCII
              const star = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453
              const frac = star - Math.floor(star)
              if (frac > 0.965) {
                const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + c)
                ctx.fillStyle = `rgba(255, 255, 255, ${(0.22 * twinkle * alphaMult).toFixed(2)})`
                ctx.fillText(frac > 0.985 ? '+' : '·', c * cellW, r * cellH)
              }
            } else if (r === horizonRow) {
              ctx.fillStyle = `rgba(255, 85, 0, ${(0.52 * alphaMult).toFixed(2)})`
              ctx.fillText('═', c * cellW, r * cellH)
            } else {
              // Plano de chão em perspectiva 3D
              const dy = (r - horizonRow) / (rows - horizonRow)
              const z = 1.0 / Math.max(0.08, dy)
              const xPersp = (c - cx) * dy * 0.45
              const gridX = Math.abs((xPersp + t * 0.6) % 1)
              const gridZ = Math.abs((z - t * 2.2) % 1)

              if (gridX < 0.14 || gridZ < 0.18) {
                const isOrange = gridZ < 0.18
                ctx.fillStyle = isOrange
                  ? `rgba(255, 85, 0, ${(0.42 * dy * alphaMult).toFixed(2)})`
                  : `rgba(235, 240, 250, ${(0.26 * dy * alphaMult).toFixed(2)})`
                ctx.fillText(isOrange ? '─' : '│', c * cellW, r * cellH)
              }
            }
          }
        }
      }
    }

    rafId = requestAnimationFrame(renderizar)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', ajustarTamanho)
    }
  }, [cenaIdx, intensidade])

  const cenaAtual = CENAS_ASCII[cenaIdx]

  const irCenaAnterior = () => {
    fuiAudio.hoverTick()
    setCenaIdx((i) => (i - 1 + CENAS_ASCII.length) % CENAS_ASCII.length)
  }

  const irProximaCena = () => {
    fuiAudio.hoverTick()
    setCenaIdx((i) => (i + 1) % CENAS_ASCII.length)
  }

  const alternarIntensidade = () => {
    fuiAudio.pinchLock()
    setIntensidade((atual) => (atual === 'sutil' ? 'medio' : atual === 'medio' ? 'forte' : 'sutil'))
  }

  return (
    <div className="fui-ascii-production-wrap" aria-hidden={zenMode}>
      <canvas ref={canvasRef} className="fui-ascii-canvas" />

      {/* Controlador Tático do Loop de Backgrounds ASCII na Área de Produção */}
      {!zenMode && (
        <div
          className="fui-ascii-hud liquid-glass-panel"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="fui-ascii-hud-left">
            <span className="fui-ascii-badge">
              <Terminal size={11} color="#ff5500" />
              <span>ASCII LOOP [{cenaAtual.codigo}]</span>
            </span>
            <strong className="fui-ascii-title">{cenaAtual.nome}</strong>
          </div>

          <div className="fui-ascii-hud-controls">
            <button
              type="button"
              className="fui-ascii-btn"
              onClick={irCenaAnterior}
              title="Background ASCII Anterior"
            >
              <SkipBack size={12} />
            </button>
            <button
              type="button"
              className={`fui-ascii-btn ${emLoop ? 'ativo' : ''}`}
              onClick={() => {
                fuiAudio.pinchLock()
                setEmLoop((v) => !v)
              }}
              title={emLoop ? 'Pausar Loop Automático neste ASCII' : 'Retomar Loop Automático de Backgrounds ASCII'}
            >
              {emLoop ? <Pause size={12} /> : <Play size={12} />}
              <span>{emLoop ? 'AUTO' : 'FIXO'}</span>
            </button>
            <button
              type="button"
              className="fui-ascii-btn"
              onClick={irProximaCena}
              title="Próximo Background ASCII"
            >
              <SkipForward size={12} />
            </button>
            <button
              type="button"
              className="fui-ascii-btn"
              onClick={alternarIntensidade}
              title="Alternar Brilho/Intensidade do ASCII"
            >
              <Sparkles size={11} color="#ff5500" />
              <span>{intensidade.toUpperCase()}</span>
            </button>
          </div>

          {emLoop && (
            <div className="fui-ascii-progress-track">
              <div className="fui-ascii-progress-fill" style={{ width: `${progressoLoop}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
})
