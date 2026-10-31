import { memo, useEffect, useRef } from 'react'
import { biometriaGlobal } from './FuiWebGL'

/**
 * ============================================================================
 * FUNDO DA ÁREA DE PRODUÇÃO — receita "Antic Athena" (21st.dev/community/ascii)
 * ============================================================================
 * Canvas2D desenhado atrás do React Flow (z-0), sem HUD e sem controles: é
 * fundo, não player. Um único visual — o retrato de Atena em blocos ASCII —
 * com duas camadas vivas por cima:
 *
 *   · chuva de código: primeiro binário (0/1) atravessando, depois matrix
 *     (hexadecimal) caindo em cascata, alternando a cada 11 s;
 *   · onda de água no mouse/mão: a célula perto do cursor pulsa e clareia.
 *
 * Pipeline (etapas da receita original, todas preservadas):
 *   1. fonte desenhada no canvas alvo; bgMode/bgBlur/bgOpacity no fundo
 *   2. grade de células `cellSize`; cor/luminância média por célula
 *   3. primitiva por célula conforme renderMode (26 modos)
 *   4. brightness → contrast → saturation → grayscale → toneCurve → tint
 *   5. pós-efeitos de `pfx`
 *   6. lights.points
 *   7. mask revelando a foto original
 *   8. animStyle (ripple/pulse/wave/shimmer/flicker)
 *
 * Zero-GC: buffers Float32Array pré-alocados e strings de cor em cache.
 */

export type ModoRender =
  | 'characters'
  | 'blocks'
  | 'halfblocks'
  | 'braille'
  | 'dots'
  | 'dither'
  | 'mosaic'
  | 'pixel'
  | 'cross'
  | 'diamond'
  | 'voxel'
  | 'lego'
  | 'mixed'
  | 'lines'
  | 'diagonal'
  | 'disco'
  | 'hexdump'
  | 'matrix'
  | 'rings'
  | 'hearts'
  | 'stars'
  | 'hexagons'
  | 'triangles'
  | 'bubbles'
  | 'hatch'
  | 'contour'

export type ModoFundo = 'solid' | 'blur' | 'original' | 'none'
export type TipoBlur = 'off' | 'gaussian' | 'directional' | 'radial' | 'tilt' | 'lens' | 'progressive'
export type EstiloAnim = 'wave' | 'pulse' | 'shimmer' | 'ripple' | 'flicker'
export type NomeCharset = 'blocks' | 'standard' | 'dense' | 'custom'

export interface PontoLuz {
  x: number
  y: number
  radius: number
  intensity: number
}

export interface EfeitoPfx {
  enabled: boolean
  intensity: number
}

export interface PfxParams {
  scanLines: EfeitoPfx
  vignette: EfeitoPfx
  bloom: EfeitoPfx
  chromatic: EfeitoPfx
  filmGrain: EfeitoPfx
  glitch: EfeitoPfx
  halftone: EfeitoPfx
  pixelate: EfeitoPfx
  filmDust: EfeitoPfx
}

export interface MaskParams {
  enabled: boolean
  tool: 'freehand' | 'rect' | 'ellipse'
  brushSize: number
  showOverlay: boolean
  invert: boolean
  dataUrl: string | null
  shapes: unknown[]
}

export interface AnticAthenaParams {
  renderMode: ModoRender
  bgMode: ModoFundo
  bgBlur: number
  bgOpacity: number
  cellSize: number
  coverage: number
  invert: boolean
  styleBlend: GlobalCompositeOperation
  charSet: NomeCharset
  customChars: string
  brightness: number
  contrast: number
  edgeEmphasis: number
  density: number
  toneCurve: { x: number; y: number }[]
  tint: string
  tintOpacity: number
  overlayBlend: GlobalCompositeOperation
  saturation: number
  grayscale: number
  blurType: TipoBlur
  blurAmount: number
  blurAngle: number
  directionalBothSides: boolean
  tiltFocus: number
  tiltPosition: number
  tiltFeather: number
  lensFocus: number
  blurCenterX: number
  blurCenterY: number
  progressivePosition: number
  progressiveReverse: boolean
  pfx: PfxParams
  animated: boolean
  animStyle: EstiloAnim
  animSpeed: EfeitoPfx
  animIntensity: EfeitoPfx
  lights: { enabled: boolean; points: PontoLuz[] }
  mask: MaskParams
}

export const RECEITA_ANTIC_ATHENA_PADRAO: AnticAthenaParams = {
  renderMode: 'blocks',
  bgMode: 'solid',
  bgBlur: 2,
  bgOpacity: 100,
  cellSize: 3,
  coverage: 100,
  invert: false,
  styleBlend: 'source-over',
  charSet: 'blocks',
  customChars: '',
  brightness: 0,
  contrast: 115,
  edgeEmphasis: 0,
  density: 0,
  toneCurve: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  tint: '#d8b46a',
  tintOpacity: 38,
  overlayBlend: 'soft-light',
  saturation: 100,
  grayscale: 28,
  blurType: 'off',
  blurAmount: 35,
  blurAngle: 0,
  directionalBothSides: false,
  tiltFocus: 35,
  tiltPosition: 50,
  tiltFeather: 15,
  lensFocus: 40,
  blurCenterX: 50,
  blurCenterY: 50,
  progressivePosition: 55,
  progressiveReverse: false,
  pfx: {
    vignette: { enabled: true, intensity: 55 },
    scanLines: { enabled: false, intensity: 40 },
    chromatic: { enabled: false, intensity: 15 },
    bloom: { enabled: true, intensity: 45 },
    filmGrain: { enabled: false, intensity: 30 },
    glitch: { enabled: false, intensity: 20 },
    pixelate: { enabled: false, intensity: 15 },
    halftone: { enabled: false, intensity: 20 },
    filmDust: { enabled: false, intensity: 20 },
  },
  animated: true,
  animStyle: 'ripple',
  animSpeed: { enabled: true, intensity: 100 },
  animIntensity: { enabled: true, intensity: 60 },
  lights: {
    enabled: true,
    points: [
      { x: 0.5, y: 0.38, radius: 0.42, intensity: 0.55 },
      { x: 0.35, y: 0.28, radius: 0.25, intensity: 0.35 },
    ],
  },
  mask: {
    enabled: false,
    tool: 'freehand',
    brushSize: 30,
    showOverlay: false,
    invert: false,
    dataUrl: null,
    shapes: [],
  },
}

const CHARSETS: Record<string, string> = {
  blocks: ' ·░▒▓█',
  halfblocks: ' ▁▂▃▄▅▆▇█',
  standard: ' .:-=+*#%@',
  dense: ' .\'`^",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  braille: ' ⠁⠃⠇⠏⠟⠿⡿⣿',
  hex: ' 0123456789ABCDEF',
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Teto de células desenhadas por frame (mantém o frame rate em telas grandes). */
const LIMITE_CELULAS = 22000

/** Tempo de cada fase da chuva de código: binário ↔ matrix. */
const FASE_CHUVA_S = 11

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Converte cor Hex (#d8b46a) em RGB [0..255] */
function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace('#', '')
  const num = parseInt(limpo.length === 3 ? limpo.replace(/(.)/g, '$1$1') : limpo, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/** Mistura Soft-Light idêntica ao W3C Canvas Composite spec (usada pelo tint da receita). */
function blendSoftLightChannel(base: number, blend: number): number {
  const b = base / 255
  const s = blend / 255
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)
  const res = s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (d - b)
  return Math.max(0, Math.min(255, res * 255))
}

/** toneCurve: mapeia a luminância por uma spline linear por partes (0..1 → 0..1). */
function aplicarCurvaTons(lum: number, curva: { x: number; y: number }[]): number {
  if (!curva || curva.length < 2) return lum
  for (let i = 1; i < curva.length; i++) {
    const a = curva[i - 1]
    const b = curva[i]
    if (lum <= b.x) {
      const t = b.x === a.x ? 0 : clamp01((lum - a.x) / (b.x - a.x))
      return a.y + t * (b.y - a.y)
    }
  }
  return curva[curva.length - 1].y
}

/**
 * Etapa 4 da receita: brightness → contrast → saturation → grayscale → toneCurve → tint.
 * Devolve cor final + a luminância (já invertida se `invert`) que escolhe o glifo.
 */
function ajustarCorAthena(
  r: number,
  g: number,
  b: number,
  cfg: AnticAthenaParams,
  tintRgb: [number, number, number]
): [number, number, number, number] {
  const br = (cfg.brightness / 100) * 255
  let cr = r + br
  let cg = g + br
  let cb = b + br

  const cf = cfg.contrast / 100
  cr = (cr - 128) * cf + 128
  cg = (cg - 128) * cf + 128
  cb = (cb - 128) * cf + 128

  const lumAntes = clamp01((0.299 * cr + 0.587 * cg + 0.114 * cb) / 255)
  const satF = (cfg.saturation / 100) * (1 - cfg.grayscale / 100)
  const lumCinza = 0.299 * cr + 0.587 * cg + 0.114 * cb
  cr = lumCinza + (cr - lumCinza) * satF
  cg = lumCinza + (cg - lumCinza) * satF
  cb = lumCinza + (cb - lumCinza) * satF

  // toneCurve na luminância, reescalando o RGB para o novo brilho
  const lumCurva = clamp01(aplicarCurvaTons(lumAntes, cfg.toneCurve))
  const razao = lumAntes > 0.004 ? lumCurva / lumAntes : lumCurva * 4
  cr *= razao
  cg *= razao
  cb *= razao

  const tOp = cfg.tintOpacity / 100
  if (tOp > 0) {
    const slR = blendSoftLightChannel(cr, tintRgb[0])
    const slG = blendSoftLightChannel(cg, tintRgb[1])
    const slB = blendSoftLightChannel(cb, tintRgb[2])
    cr = cr * (1 - tOp) + slR * tOp
    cg = cg * (1 - tOp) + slG * tOp
    cb = cb * (1 - tOp) + slB * tOp
  }

  cr = Math.max(0, Math.min(255, cr))
  cg = Math.max(0, Math.min(255, cg))
  cb = Math.max(0, Math.min(255, cb))
  const finalLum = clamp01((0.299 * cr + 0.587 * cg + 0.114 * cb) / 255)

  return [cr, cg, cb, cfg.invert ? 1 - finalLum : finalLum]
}

/**
 * Escultura Chiaroscuro "Antic Athena": busto de Atena em mármore, elmo coríntio
 * com crista, halo geométrico grego e drapeado clássico. É a "foto de origem" do
 * pipeline — o retrato que aparece no fundo do site.
 */
function desenharEsculturaAnticAthena(w: number, h: number): ImageData {
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const c = off.getContext('2d')!
  const img = c.createImageData(w, h)
  const data = img.data

  const cx = w * 0.5
  const cy = h * 0.48
  const scale = Math.min(w, h) * 0.44

  const lx = -0.58
  const ly = -0.45
  const lz = 0.68

  for (let py = 0; py < h; py++) {
    const ny = (py - cy) / scale
    for (let px = 0; px < w; px++) {
      const nx = (px - cx) / scale
      const idx = (py * w + px) * 4

      let r = 8
      let g = 8
      let b = 10

      const distCenter = Math.hypot(nx, ny)

      // 1. Halo solar grego / mandala arquitetônica ao fundo
      const ang = Math.atan2(ny + 0.12, nx)
      const haloDist = Math.hypot(nx, ny + 0.12)
      if (haloDist > 0.52 && haloDist < 1.05) {
        const ring1 = Math.abs(haloDist - 0.68) < 0.022
        const ring2 = Math.abs(haloDist - 0.88) < 0.018
        const rays =
          Math.pow(Math.max(0, Math.cos(ang * 16)), 6) *
          Math.max(0, 1 - Math.abs(haloDist - 0.78) * 3.5)
        const greekKey = haloDist > 0.82 && haloDist < 0.88 && Math.sin(ang * 32) > 0.2
        const haloVal = (ring1 ? 0.52 : 0) + (ring2 ? 0.42 : 0) + rays * 0.38 + (greekKey ? 0.35 : 0)
        if (haloVal > 0) {
          r += haloVal * 185
          g += haloVal * 148
          b += haloVal * 92
        }
      }

      // 2. Busto escultórico
      let sdfMin = 999
      let normX = 0
      let normY = 0
      let normZ = 1
      let matTone = 1.0

      // A. Crânio / rosto oval em pose nobre
      const rx = nx * 0.96 - (ny + 0.08) * 0.12
      const ry = (ny + 0.08) * 1.15 + nx * 0.12
      const dHead = Math.hypot(rx / 0.34, ry / 0.44)
      if (dHead < 1.0) {
        const z = Math.sqrt(Math.max(0, 1 - dHead * dHead))
        const brow = Math.exp(-Math.pow((ry + 0.1) / 0.06, 2) - Math.pow(rx / 0.24, 2)) * 0.18
        const noseBridge =
          ry > -0.12 && ry < 0.14 ? Math.exp(-Math.pow((rx + 0.03) / 0.045, 2)) * 0.24 : 0
        const eyeSocketL =
          Math.exp(-Math.pow((rx + 0.13) / 0.07, 2) - Math.pow((ry + 0.04) / 0.05, 2)) * 0.22
        const eyeSocketR =
          Math.exp(-Math.pow((rx - 0.07) / 0.07, 2) - Math.pow((ry + 0.04) / 0.05, 2)) * 0.22
        const lips = Math.exp(-Math.pow((rx + 0.02) / 0.09, 2) - Math.pow((ry - 0.22) / 0.035, 2)) * 0.14
        const chin = Math.exp(-Math.pow((rx + 0.02) / 0.11, 2) - Math.pow((ry - 0.33) / 0.06, 2)) * 0.15

        const heightField = z + brow + noseBridge - eyeSocketL - eyeSocketR + lips + chin
        normX = rx / 0.34 - (noseBridge > 0.05 ? (rx + 0.03) * 4.2 : 0)
        normY = ry / 0.44 - brow * 2.1 + (eyeSocketL + eyeSocketR) * 2.5
        normZ = Math.max(0.15, heightField)
        sdfMin = 0
        matTone = 1.04
      }

      // B. Elmo coríntio + viseira
      const hx = nx - 0.04
      const hy = ny + 0.34
      const dHelmet = Math.hypot(hx / 0.42, hy / 0.34)
      if (dHelmet < 1.0 && ny < -0.04) {
        const z = Math.sqrt(Math.max(0, 1 - dHelmet * dHelmet))
        const visorRidge = Math.abs(ny + 0.12 - nx * 0.18) < 0.035 ? 0.28 : 0
        normX = hx / 0.42
        normY = hy / 0.34 - visorRidge * 2.2
        normZ = z + visorRidge
        sdfMin = 0
        matTone = 1.15
      }

      // C. Crista / pluma do elmo
      const cxPlume = nx - 0.1
      const cyPlume = ny + 0.42
      const rPlume = Math.hypot(cxPlume / 0.56, cyPlume / 0.46)
      if (rPlume > 0.68 && rPlume < 1.04 && ny < -0.12 && nx > -0.35) {
        const plumeAngle = Math.atan2(cyPlume, cxPlume)
        const featherWave = 0.5 + 0.5 * Math.sin(plumeAngle * 42 + rPlume * 18)
        normX = Math.cos(plumeAngle) * (0.7 + featherWave * 0.3)
        normY = Math.sin(plumeAngle) * (0.7 + featherWave * 0.3)
        normZ = Math.sqrt(Math.max(0.1, 1 - Math.pow((rPlume - 0.86) / 0.18, 2)))
        sdfMin = 0
        matTone = 1.18
      }

      // D. Pescoço clássico
      if (sdfMin > 0 && ny >= -0.02 && ny < 0.42 && Math.abs(nx - 0.04) < 0.22) {
        const neckX = (nx - 0.04) / 0.22
        normX = neckX * 0.85
        normY = 0.1
        normZ = Math.sqrt(Math.max(0.1, 1 - neckX * neckX))
        sdfMin = 0
        matTone = 0.92
      }

      // E. Busto / drapeado do peplo
      if (ny >= 0.32 && ny < 1.05) {
        const shoulderW = 0.32 + (ny - 0.32) * 0.95
        if (Math.abs(nx) < shoulderW) {
          const sx = nx / shoulderW
          const fold = Math.sin(nx * 22 + Math.sin(ny * 8) * 1.6) * 0.35
          normX = sx * 0.75 + fold
          normY = (ny - 0.6) * 0.4
          normZ = Math.sqrt(Math.max(0.15, 1 - sx * sx * 0.75)) + fold * 0.25
          sdfMin = 0
          matTone = 0.98
        }
      }

      if (sdfMin === 0) {
        const len = Math.hypot(normX, normY, normZ) || 1
        const nxN = normX / len
        const nyN = normY / len
        const nzN = normZ / len

        const diff = Math.max(0, nxN * lx + nyN * ly + nzN * lz)
        const rim = Math.pow(1 - Math.max(0, nzN), 2.6) * 0.65
        const spec =
          Math.pow(Math.max(0, nxN * (lx * 0.5) + nyN * (ly * 0.5) + nzN * 0.85), 14) * 0.45

        const marbleVein = 0.94 + 0.06 * Math.sin((nx * 14 + ny * 9 + Math.sin(nx * 23)) * 3.14)
        const lum = Math.min(1.0, (0.1 + diff * 0.78 + rim + spec) * matTone * marbleVein)

        r = lum * 238
        g = lum * 212
        b = lum * 168
      } else if (distCenter < 1.35) {
        const noise = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453
        const frac = noise - Math.floor(noise)
        const glow = Math.max(0, 1 - distCenter / 1.3) * 0.18
        r += glow * 195 + (frac > 0.985 ? 65 : 0)
        g += glow * 155 + (frac > 0.985 ? 52 : 0)
        b += glow * 95 + (frac > 0.985 ? 32 : 0)
      }

      data[idx] = Math.min(255, r)
      data[idx + 1] = Math.min(255, g)
      data[idx + 2] = Math.min(255, b)
      data[idx + 3] = 255
    }
  }

  return img
}

// ---------------------------------------------------------------------------
// Cache de cores: quantiza RGBA e reaproveita as strings (nada de GC por frame).
// ---------------------------------------------------------------------------
const cacheCores = new Map<number, string>()

function corStr(r: number, g: number, b: number, a: number): string {
  const rq = (r > 255 ? 255 : r < 0 ? 0 : r) >> 2
  const gq = (g > 255 ? 255 : g < 0 ? 0 : g) >> 2
  const bq = (b > 255 ? 255 : b < 0 ? 0 : b) >> 2
  const aq = ((a > 1 ? 1 : a < 0 ? 0 : a) * 31) | 0
  const chave = (rq << 22) | (gq << 16) | (bq << 10) | aq
  let s = cacheCores.get(chave)
  if (s === undefined) {
    s = `rgba(${rq << 2},${gq << 2},${bq << 2},${(aq / 31).toFixed(3)})`
    cacheCores.set(chave, s)
  }
  return s
}

function corHsl(h: number, s: number, l: number, a: number): string {
  return `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%,${a.toFixed(2)})`
}

export const AsciiProductionBg = memo(function AsciiProductionBg({
  zenMode = false,
}: {
  zenMode?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -999,
    y: -999,
    active: false,
  })

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

  // -------------------------------------------------------------------------
  // RENDERIZADOR
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const camada = document.createElement('canvas')
    const camadaCtx = camada.getContext('2d')
    const rascunho = document.createElement('canvas')
    const rascunhoCtx = rascunho.getContext('2d')
    const mini = document.createElement('canvas')
    const miniCtx = mini.getContext('2d')
    if (!camadaCtx || !rascunhoCtx || !miniCtx) return

    const cfg: AnticAthenaParams = RECEITA_ANTIC_ATHENA_PADRAO
    const tintRgb = hexParaRgb(cfg.tint)
    // zen mode (palco cheio, sem painéis): o fundo pode respirar mais forte.
    const alphaMult = zenMode ? 1.06 : 0.94

    let rafId = 0
    let larg = 1
    let alt = 1
    let dpr = 1
    let cols = 0
    let rows = 0
    let celW = 8
    let celH = 10

    let cR = new Float32Array(0)
    let cG = new Float32Array(0)
    let cB = new Float32Array(0)
    let cLum = new Float32Array(0)
    let cEdge = new Float32Array(0)
    let cHash = new Float32Array(0)

    let fonte: HTMLCanvasElement | null = null
    let mascara: HTMLImageElement | null = null
    let mascaraPronta = false
    if (cfg.mask.enabled && cfg.mask.dataUrl) {
      mascara = new Image()
      mascara.onload = () => {
        mascaraPronta = true
      }
      mascara.src = cfg.mask.dataUrl
    }

    // Chuva de código: uma coluna a cada 2 células da grade.
    let chuvaY = new Float32Array(0)
    let chuvaVel = new Float32Array(0)

    const prepararCena = (w: number, h: number) => {
      let cw = Math.max(2, cfg.cellSize)
      let chh = Math.max(2, cfg.cellSize * 1.16)
      while ((w / cw) * (h / chh) > LIMITE_CELULAS) {
        cw *= 1.3
        chh *= 1.3
      }
      celW = Math.max(2, Math.round(cw))
      celH = Math.max(2, Math.round(chh))
      cols = Math.max(1, Math.ceil(w / celW))
      rows = Math.max(1, Math.ceil(h / celH))

      const colunas = Math.max(1, Math.floor(cols / 2))
      chuvaY = new Float32Array(colunas)
      chuvaVel = new Float32Array(colunas)
      for (let k = 0; k < colunas; k++) {
        chuvaY[k] = Math.random() * rows
        chuvaVel[k] = 0.45 + Math.random() * 0.95
      }
    }

    /** "Foto" de origem em resolução de leitura (usada no fundo e nas máscaras). */
    const gerarFonte = (w: number, h: number) => {
      const fw = 460
      const fh = Math.max(140, Math.round((fw * h) / Math.max(1, w)))
      const c = document.createElement('canvas')
      c.width = fw
      c.height = fh
      const cx = c.getContext('2d')
      if (!cx) return
      cx.putImageData(desenharEsculturaAnticAthena(fw, fh), 0, 0)
      fonte = c
    }

    /** Etapa 2: amostragem da grade + pipeline de cor + bordas (Sobel). */
    const amostrar = () => {
      const total = cols * rows
      cR = new Float32Array(total)
      cG = new Float32Array(total)
      cB = new Float32Array(total)
      cLum = new Float32Array(total)
      cEdge = new Float32Array(total)
      cHash = new Float32Array(total)

      mini.width = cols
      mini.height = rows
      miniCtx.imageSmoothingEnabled = true
      miniCtx.imageSmoothingQuality = 'high'
      miniCtx.clearRect(0, 0, cols, rows)
      if (fonte) miniCtx.drawImage(fonte, 0, 0, cols, rows)
      const px = miniCtx.getImageData(0, 0, cols, rows).data

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const p = i * 4
          const [cr, cg, cb, lum] = ajustarCorAthena(px[p], px[p + 1], px[p + 2], cfg, tintRgb)
          cR[i] = cr
          cG[i] = cg
          cB[i] = cb
          cLum[i] = lum
          cHash[i] = hash2(c * 1.37, r * 2.11)
        }
      }

      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c
          const gx = cLum[i + 1] - cLum[i - 1]
          const gy = cLum[i + cols] - cLum[i - cols]
          cEdge[i] = Math.min(1, Math.hypot(gx, gy) * 2.5)
        }
      }
    }

    const inicializar = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      larg = canvas.clientWidth || window.innerWidth
      alt = canvas.clientHeight || window.innerHeight
      canvas.width = Math.floor(larg * dpr)
      canvas.height = Math.floor(alt * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      camada.width = canvas.width
      camada.height = canvas.height
      rascunho.width = canvas.width
      rascunho.height = canvas.height

      prepararCena(larg, alt)
      gerarFonte(larg, alt)
      amostrar()
    }

    inicializar()
    window.addEventListener('resize', inicializar)

    // -----------------------------------------------------------------------
    // Etapa 3: primitivas por célula
    // -----------------------------------------------------------------------
    const desenharPrimitiva = (
      c: CanvasRenderingContext2D,
      modo: ModoRender,
      x: number,
      y: number,
      cw: number,
      chh: number,
      lum: number,
      r: number,
      g: number,
      b: number,
      alfa: number,
      hsh: number,
      col: number,
      row: number,
      tempo: number
    ) => {
      const meioX = x + cw * 0.5
      const meioY = y + chh * 0.5
      c.fillStyle = corStr(r, g, b, alfa)

      switch (modo) {
        case 'characters':
        case 'blocks':
        case 'braille':
        case 'hexdump': {
          const rampa =
            modo === 'braille'
              ? CHARSETS.braille
              : modo === 'hexdump'
                ? CHARSETS.hex
                : CHARSETS[cfg.charSet === 'custom' ? 'blocks' : cfg.charSet] || CHARSETS.blocks
          const glifo =
            modo === 'characters' && cfg.charSet === 'custom' && cfg.customChars
              ? cfg.customChars[
                  Math.min(
                    cfg.customChars.length - 1,
                    Math.max(0, Math.floor(lum * cfg.customChars.length))
                  )
                ]
              : rampa[Math.min(rampa.length - 1, Math.max(0, Math.floor(lum * rampa.length)))]
          if (glifo && glifo !== ' ') c.fillText(glifo, x, y)
          break
        }
        case 'halfblocks': {
          const rampa = CHARSETS.halfblocks
          const glifo = rampa[Math.min(rampa.length - 1, Math.max(0, Math.floor(lum * rampa.length)))]
          if (glifo && glifo !== ' ') c.fillText(glifo, x, y)
          break
        }
        case 'dots': {
          c.beginPath()
          c.arc(meioX, meioY, Math.max(0.8, lum * cw * 0.48), 0, Math.PI * 2)
          c.fill()
          break
        }
        case 'dither': {
          const limite = (BAYER4[(row & 3) * 4 + (col & 3)] + 0.5) / 16
          if (lum <= limite) return
          const lado = Math.max(1, cw * 0.34)
          c.fillRect(meioX - lado * 0.5, meioY - lado * 0.5, lado, lado)
          break
        }
        case 'mosaic': {
          const recuo = Math.max(0, cw * 0.08)
          c.fillRect(x + recuo, y + recuo, cw - recuo * 2, chh - recuo * 2)
          break
        }
        case 'pixel': {
          const lado = Math.max(1, lum * cw)
          c.fillRect(meioX - lado * 0.5, meioY - lado * 0.5, lado, lado)
          break
        }
        case 'cross': {
          const raio = Math.max(1, lum * cw * 0.46)
          const esp = Math.max(1, cw * 0.1)
          c.fillRect(meioX - raio, meioY - esp * 0.5, raio * 2, esp)
          c.fillRect(meioX - esp * 0.5, meioY - raio, esp, raio * 2)
          break
        }
        case 'diamond': {
          const raio = Math.max(1.2, lum * cw * 0.5)
          c.beginPath()
          c.moveTo(meioX, meioY - raio)
          c.lineTo(meioX + raio, meioY)
          c.lineTo(meioX, meioY + raio)
          c.lineTo(meioX - raio, meioY)
          c.closePath()
          c.fill()
          break
        }
        case 'voxel': {
          const s = Math.max(2, cw * 0.82)
          const x0 = meioX - s * 0.5
          const y0 = meioY - s * 0.35
          const prof = s * 0.26
          c.fillStyle = corStr(r * 0.72, g * 0.72, b * 0.72, alfa)
          c.fillRect(x0, y0 + s, s, prof)
          c.fillStyle = corStr(r * 1.15, g * 1.12, b * 1.05, alfa)
          c.beginPath()
          c.moveTo(x0, y0)
          c.lineTo(x0 + prof, y0 - prof)
          c.lineTo(x0 + s + prof, y0 - prof)
          c.lineTo(x0 + s, y0)
          c.closePath()
          c.fill()
          c.fillStyle = corStr(r, g, b, alfa)
          c.fillRect(x0, y0, s, s)
          c.fillStyle = corStr(r * 0.55, g * 0.55, b * 0.55, alfa)
          c.beginPath()
          c.moveTo(x0 + s, y0)
          c.lineTo(x0 + s + prof, y0 - prof)
          c.lineTo(x0 + s + prof, y0 + s - prof)
          c.lineTo(x0 + s, y0 + s)
          c.closePath()
          c.fill()
          break
        }
        case 'lego': {
          const s = Math.max(2, cw * 0.78)
          c.fillRect(meioX - s * 0.5, meioY - s * 0.35, s, s * 0.75)
          c.beginPath()
          c.arc(meioX, meioY - s * 0.35, Math.max(0.8, s * 0.22), 0, Math.PI * 2)
          c.fill()
          break
        }
        case 'mixed': {
          if (hsh < 0.3) {
            c.beginPath()
            c.arc(meioX, meioY, Math.max(0.9, lum * cw * 0.45), 0, Math.PI * 2)
            c.fill()
          } else if (hsh < 0.55) {
            const s = Math.max(2, lum * cw * 0.9)
            c.fillRect(x + (cw - s) * 0.5, y + (chh - s) * 0.5, s, s)
          } else if (hsh < 0.8) {
            const raio = Math.max(1, lum * cw * 0.44)
            c.fillRect(meioX - raio, meioY - 0.7, raio * 2, 1.4)
            c.fillRect(meioX - 0.7, meioY - raio, 1.4, raio * 2)
          } else {
            const rampa = CHARSETS.dense
            c.fillText(
              rampa[Math.min(rampa.length - 1, Math.max(0, Math.floor(lum * rampa.length)))],
              x,
              y
            )
          }
          break
        }
        case 'lines': {
          const comp = Math.max(1, lum * cw)
          const esp = Math.max(1, chh * 0.22)
          c.fillRect(x, meioY - esp * 0.5, comp, esp)
          break
        }
        case 'diagonal': {
          const esp = Math.max(1, cw * 0.16)
          c.save()
          c.translate(meioX, meioY)
          c.rotate(hsh > 0.5 ? Math.PI * 0.25 : -Math.PI * 0.25)
          c.fillRect(-cw * 0.6, -esp * 0.5, cw * 1.2 * Math.max(0.25, lum), esp)
          c.restore()
          break
        }
        case 'disco': {
          const matiz = (hsh * 360 + tempo * 90) % 360
          const s = Math.max(1.5, cw * 0.84)
          c.fillStyle = corHsl(matiz, 92, 32 + lum * 40, alfa)
          if (hsh > 0.72) {
            c.beginPath()
            c.arc(meioX, meioY, s * 0.34, 0, Math.PI * 2)
            c.fill()
          } else {
            c.fillRect(meioX - s * 0.5, meioY - s * 0.5, s, s)
          }
          break
        }
        case 'rings': {
          const raio = Math.max(1.2, cw * 0.48)
          c.strokeStyle = corStr(r, g, b, alfa)
          c.lineWidth = Math.max(0.6, cw * 0.1)
          c.beginPath()
          c.arc(meioX, meioY, raio * (0.4 + lum * 0.6), 0, Math.PI * 2)
          c.stroke()
          break
        }
        case 'hearts': {
          const s = Math.max(1.4, cw * 0.5) * (0.55 + lum * 0.55)
          c.beginPath()
          c.moveTo(meioX, meioY + s)
          c.bezierCurveTo(meioX - s * 1.4, meioY - s * 0.2, meioX - s * 0.6, meioY - s * 1.2, meioX, meioY - s * 0.4)
          c.bezierCurveTo(meioX + s * 0.6, meioY - s * 1.2, meioX + s * 1.4, meioY - s * 0.2, meioX, meioY + s)
          c.fill()
          break
        }
        case 'stars': {
          const raio = Math.max(1.2, cw * 0.5) * (0.5 + lum * 0.6)
          c.beginPath()
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2 - Math.PI / 2
            const rr = k % 2 === 0 ? raio : raio * 0.34
            const px2 = meioX + Math.cos(ang) * rr
            const py2 = meioY + Math.sin(ang) * rr
            if (k === 0) c.moveTo(px2, py2)
            else c.lineTo(px2, py2)
          }
          c.closePath()
          c.fill()
          break
        }
        case 'hexagons': {
          const raio = Math.max(1.2, cw * 0.5)
          c.beginPath()
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2 + Math.PI / 6
            const px2 = meioX + Math.cos(ang) * raio
            const py2 = meioY + Math.sin(ang) * raio
            if (k === 0) c.moveTo(px2, py2)
            else c.lineTo(px2, py2)
          }
          c.closePath()
          if (lum > 0.5) c.fill()
          else {
            c.strokeStyle = corStr(r, g, b, alfa)
            c.lineWidth = Math.max(0.6, cw * 0.09)
            c.stroke()
          }
          break
        }
        case 'triangles': {
          const raio = Math.max(1.4, cw * 0.56) * (0.6 + lum * 0.5)
          const cima = hsh > 0.5
          c.beginPath()
          for (let k = 0; k < 3; k++) {
            const ang = (k / 3) * Math.PI * 2 + (cima ? -Math.PI / 2 : Math.PI / 2)
            const px2 = meioX + Math.cos(ang) * raio
            const py2 = meioY + Math.sin(ang) * raio
            if (k === 0) c.moveTo(px2, py2)
            else c.lineTo(px2, py2)
          }
          c.closePath()
          c.fill()
          break
        }
        case 'bubbles': {
          const raio = Math.max(1.2, cw * 0.46) * (0.5 + lum * 0.6)
          c.strokeStyle = corStr(r, g, b, alfa)
          c.lineWidth = Math.max(0.6, cw * 0.1)
          c.beginPath()
          c.arc(meioX, meioY, raio, 0, Math.PI * 2)
          c.stroke()
          c.fillStyle = corStr(255, 250, 240, alfa * 0.8)
          c.beginPath()
          c.arc(meioX - raio * 0.35, meioY - raio * 0.35, Math.max(0.5, raio * 0.22), 0, Math.PI * 2)
          c.fill()
          break
        }
        case 'hatch': {
          const linhas = lum > 0.66 ? 3 : lum > 0.33 ? 2 : 1
          c.strokeStyle = corStr(r, g, b, alfa)
          c.lineWidth = Math.max(0.6, cw * 0.1)
          for (let k = 0; k < linhas; k++) {
            const off = (k / linhas) * cw
            c.beginPath()
            c.moveTo(x + off, y + chh)
            c.lineTo(x + off + cw, y)
            c.stroke()
          }
          break
        }
        case 'contour': {
          const iso = Math.abs((lum * 8) % 1 - 0.5)
          if (iso > 0.16) return
          c.strokeStyle = corStr(r, g, b, alfa)
          c.lineWidth = Math.max(0.6, cw * 0.09)
          c.beginPath()
          c.moveTo(x, meioY)
          c.lineTo(x + cw, meioY)
          c.stroke()
          break
        }
        default:
          break
      }
    }

    // -----------------------------------------------------------------------
    // Etapa 4/5: composição da camada com blur + pós-efeitos
    // -----------------------------------------------------------------------
    const comporCamada = () => {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'source-over'
      const b = cfg.blurAmount / 100
      const blurPx = 1 + b * 12

      switch (cfg.blurType) {
        case 'gaussian':
          ctx.filter = `blur(${blurPx.toFixed(2)}px)`
          ctx.drawImage(camada, 0, 0, larg, alt)
          break
        case 'directional': {
          const passos = 7
          const ang = (cfg.blurAngle * Math.PI) / 180
          const dist = blurPx * 1.8
          const lados = cfg.directionalBothSides ? [-1, 1] : [0, 1]
          const total = lados.length * passos
          ctx.globalAlpha = 1 / total
          for (const sinal of lados) {
            for (let k = 0; k < passos; k++) {
              const f = (k / (passos - 1)) * dist * sinal
              ctx.drawImage(camada, Math.cos(ang) * f, Math.sin(ang) * f, larg, alt)
            }
          }
          break
        }
        case 'radial':
        case 'lens': {
          const foco = clamp01(cfg.lensFocus / 100)
          const passos = cfg.blurType === 'radial' ? 7 : 5
          const cx = (cfg.blurCenterX / 100) * larg
          const cyy = (cfg.blurCenterY / 100) * alt
          ctx.globalAlpha = cfg.blurType === 'radial' ? 0.42 : 0.7
          ctx.drawImage(camada, 0, 0, larg, alt)
          for (let k = 1; k <= passos; k++) {
            const escala = 1 + (k / passos) * b * 0.5
            ctx.save()
            ctx.translate(cx, cyy)
            ctx.scale(escala, escala)
            ctx.translate(-cx, -cyy)
            ctx.filter = `blur(${(blurPx * 0.35 * k).toFixed(2)}px)`
            ctx.globalAlpha = (0.45 - foco * 0.28) / k
            ctx.drawImage(camada, 0, 0, larg, alt)
            ctx.restore()
          }
          break
        }
        case 'tilt':
        case 'progressive': {
          const bandas = 12
          const hBanda = alt / bandas
          for (let k = 0; k < bandas; k++) {
            const y0 = k * hBanda
            const centro = (k + 0.5) / bandas
            let peso: number
            if (cfg.blurType === 'tilt') {
              const pos = cfg.tiltPosition / 100
              const foco = Math.max(0.05, cfg.tiltFocus / 100)
              const d = Math.abs(centro - pos) / foco
              peso = d <= 1 ? 0 : Math.min(1, (d - 1) / Math.max(0.02, cfg.tiltFeather / 100))
            } else {
              const pos = cfg.progressivePosition / 100
              const d = cfg.progressiveReverse ? 1 - centro : centro
              peso = d <= pos ? 0 : Math.min(1, (d - pos) / Math.max(0.02, 1 - pos))
            }
            ctx.save()
            ctx.beginPath()
            ctx.rect(0, y0, larg, hBanda + 1)
            ctx.clip()
            if (peso > 0.01) ctx.filter = `blur(${(blurPx * peso).toFixed(2)}px)`
            ctx.drawImage(camada, 0, 0, larg, alt)
            ctx.restore()
          }
          break
        }
        case 'off':
        default:
          ctx.drawImage(camada, 0, 0, larg, alt)
          break
      }
      ctx.restore()
    }

    const aplicarPfx = () => {
      const pfx = cfg.pfx

      if (pfx.scanLines.enabled) {
        const i = pfx.scanLines.intensity / 100
        ctx.save()
        ctx.fillStyle = `rgba(0,0,0,${(i * 0.42).toFixed(3)})`
        for (let y = 0; y < alt; y += 3) ctx.fillRect(0, y, larg, 1)
        ctx.restore()
      }

      if (pfx.vignette.enabled) {
        const i = pfx.vignette.intensity / 100
        ctx.save()
        const grad = ctx.createRadialGradient(
          larg * 0.5,
          alt * 0.5,
          Math.min(larg, alt) * 0.28,
          larg * 0.5,
          alt * 0.5,
          Math.max(larg, alt) * 0.72
        )
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(1, `rgba(5,5,7,${(i * 0.88).toFixed(2)})`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, larg, alt)
        ctx.restore()
      }

      if (pfx.bloom.enabled) {
        const i = pfx.bloom.intensity / 100
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = Math.min(1, i * 0.6 * alphaMult)
        ctx.filter = `blur(${(6 + i * 14).toFixed(1)}px)`
        ctx.drawImage(camada, 0, 0, larg, alt)
        ctx.restore()
      }

      if (pfx.chromatic.enabled) {
        const i = pfx.chromatic.intensity / 100
        const desloc = 2 + i * 10
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.32 + i * 0.3
        ctx.filter = 'hue-rotate(-40deg)'
        ctx.drawImage(camada, -desloc, 0, larg, alt)
        ctx.filter = 'hue-rotate(40deg)'
        ctx.drawImage(camada, desloc, 0, larg, alt)
        ctx.restore()
      }

      if (pfx.filmGrain.enabled) {
        const i = pfx.filmGrain.intensity / 100
        ctx.save()
        ctx.fillStyle = `rgba(255,255,255,${(i * 0.05).toFixed(3)})`
        for (let k = 0; k < 260; k++) {
          ctx.fillRect(Math.random() * larg, Math.random() * alt, 1.2, 1.2)
        }
        ctx.restore()
      }

      if (pfx.glitch.enabled) {
        const i = pfx.glitch.intensity / 100
        ctx.save()
        const fatias = 3 + Math.round(i * 8)
        for (let k = 0; k < fatias; k++) {
          if (Math.random() > 0.35) continue
          const y = Math.random() * alt
          const hh = 3 + Math.random() * (8 + i * 26)
          const dx = (Math.random() - 0.5) * (6 + i * 60)
          ctx.drawImage(camada, 0, y, larg, hh, dx, y, larg, hh)
        }
        ctx.restore()
      }

      if (pfx.halftone.enabled) {
        const i = pfx.halftone.intensity / 100
        ctx.save()
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = `rgba(20,20,24,${(i * 0.45).toFixed(3)})`
        const passo = 5
        for (let y = 0; y < alt; y += passo) {
          for (let x = y % (passo * 2) === 0 ? 0 : passo * 0.5; x < larg; x += passo) {
            ctx.beginPath()
            ctx.arc(x, y, passo * 0.22, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
      }

      if (pfx.pixelate.enabled) {
        const i = pfx.pixelate.intensity / 100
        const bloco = Math.max(2, Math.round(2 + i * 14))
        rascunho.width = Math.max(1, Math.floor(larg / bloco))
        rascunho.height = Math.max(1, Math.floor(alt / bloco))
        const rc = rascunho.getContext('2d')
        if (rc) {
          rc.clearRect(0, 0, rascunho.width, rascunho.height)
          rc.drawImage(canvas, 0, 0, rascunho.width, rascunho.height)
          ctx.save()
          ctx.imageSmoothingEnabled = false
          ctx.clearRect(0, 0, larg, alt)
          ctx.drawImage(rascunho, 0, 0, larg, alt)
          ctx.restore()
        }
      }

      if (pfx.filmDust.enabled) {
        const i = pfx.filmDust.intensity / 100
        ctx.save()
        ctx.fillStyle = `rgba(255,248,230,${(0.25 + i * 0.5).toFixed(2)})`
        const graos = 24 + Math.round(i * 70)
        for (let k = 0; k < graos; k++) {
          ctx.fillRect(Math.random() * larg, Math.random() * alt, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6)
        }
        ctx.strokeStyle = `rgba(255,255,255,${(i * 0.16).toFixed(2)})`
        ctx.lineWidth = 1
        for (let k = 0; k < Math.round(1 + i * 3); k++) {
          const x = Math.random() * larg
          ctx.beginPath()
          ctx.moveTo(x, Math.random() * alt * 0.3)
          ctx.lineTo(x + (Math.random() - 0.5) * 6, alt * (0.6 + Math.random() * 0.4))
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    // -----------------------------------------------------------------------
    // CHUVA DE CÓDIGO: binário atravessando → matrix caindo
    // -----------------------------------------------------------------------
    const desenharChuva = (t: number) => {
      const colunas = chuvaY.length
      if (!colunas) return
      const faseMatriz = Math.floor(t / FASE_CHUVA_S) % 2 === 1
      const rampa = faseMatriz ? CHARSETS.hex : '01'
      const cauda = 14

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.font = `600 ${Math.max(6, Math.round(celH * 0.96))}px "JetBrains Mono", "Fira Code", Consolas, monospace`
      ctx.textBaseline = 'top'

      for (let k = 0; k < colunas; k++) {
        const c = k * 2
        const x = c * celW
        const cabeca = chuvaY[k]
        const topo = Math.floor(cabeca)
        const semente = Math.floor(hash2(k * 1.7, cabeca * 0.13) * 97)
        const giro = Math.floor(t * (faseMatriz ? 6 : 9))

        for (let d = 0; d < cauda; d++) {
          const r = topo - d
          if (r < 0 || r >= rows) continue
          const glifo = rampa[(semente + d * 3 + giro) % rampa.length]
          const forca = 1 - d / cauda
          const alfa = (d === 0 ? 0.5 : forca * forca * 0.28) * alphaMult
          ctx.fillStyle = faseMatriz
            ? d === 0
              ? `rgba(205,255,215,${alfa.toFixed(3)})`
              : `rgba(62,232,124,${(alfa * 0.85).toFixed(3)})`
            : d === 0
              ? `rgba(222,238,255,${alfa.toFixed(3)})`
              : `rgba(150,190,255,${(alfa * 0.6).toFixed(3)})`
          ctx.fillText(glifo, x, r * celH)
        }

        chuvaY[k] += chuvaVel[k] * (faseMatriz ? 1.2 : 0.85)
        if (chuvaY[k] - cauda > rows) {
          chuvaY[k] = -Math.random() * 10
          chuvaVel[k] = 0.45 + Math.random() * 0.95
        }
      }
      ctx.restore()
    }

    // -----------------------------------------------------------------------
    // CENA ÚNICA: ANTIC ATHENA + chuva + onda do mouse
    // -----------------------------------------------------------------------
    const renderizar = (t: number) => {
      // Etapa 1: fundo
      ctx.save()
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'source-over'
      if (cfg.bgMode === 'solid') {
        ctx.fillStyle = '#090807'
        ctx.fillRect(0, 0, larg, alt)
      } else if ((cfg.bgMode === 'original' || cfg.bgMode === 'blur') && fonte) {
        ctx.globalAlpha = clamp01(cfg.bgOpacity / 100)
        if (cfg.bgMode === 'blur') ctx.filter = `blur(${Math.max(0.5, cfg.bgBlur * 2)}px)`
        ctx.drawImage(fonte, 0, 0, larg, alt)
      }
      ctx.restore()

      camadaCtx.setTransform(1, 0, 0, 1, 0, 0)
      camadaCtx.clearRect(0, 0, camada.width, camada.height)
      camadaCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      camadaCtx.globalCompositeOperation = cfg.styleBlend
      camadaCtx.textBaseline = 'top'
      camadaCtx.font = `700 ${Math.max(6, Math.round(celH * 0.96))}px "JetBrains Mono", "Fira Code", Consolas, monospace`

      const ponteiroX = biometriaGlobal.handRight.active
        ? biometriaGlobal.handRight.screenX
        : mouseRef.current.x
      const ponteiroY = biometriaGlobal.handRight.active
        ? biometriaGlobal.handRight.screenY
        : mouseRef.current.y
      const pCol = ponteiroX / celW
      const pRow = ponteiroY / celH

      const animVel = cfg.animated ? (cfg.animSpeed.intensity / 100) * 2.6 : 0
      const animAmp = cfg.animated ? (cfg.animIntensity.intensity / 100) * 0.35 : 0
      const cobertura = clamp01(cfg.coverage / 100)
      const densidade = cfg.density / 100
      const limiarCorte = Math.max(0, 1 - cobertura + (densidade < 0 ? -densidade * 0.5 : 0))
      const edgeFator = (cfg.edgeEmphasis / 100) * 1.6

      const cx = cols * 0.5
      const cy = rows * 0.5

      for (let r = 0; r < rows; r++) {
        const ny = (r - cy) / Math.max(1, rows * 0.5)
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const hsh = cHash[i]
          if (hsh < limiarCorte) continue

          let base = cLum[i]
          if (base < 0.03) continue
          base += cEdge[i] * edgeFator
          if (densidade > 0) base += densidade * 0.12

          const nx = (c - cx) / Math.max(1, cols * 0.5)
          const distCentro = Math.hypot(nx, ny)
          const distCursor = Math.hypot(c - pCol, r - pRow)

          // Etapa 8: animação
          let mod = 0
          if (animAmp > 0) {
            switch (cfg.animStyle) {
              case 'wave':
                mod =
                  Math.sin(nx * 5.5 + t * animVel) * 0.55 +
                  Math.sin(ny * 4.2 - t * animVel * 0.8) * 0.45
                break
              case 'pulse':
                mod = Math.sin(t * animVel * 1.7 - distCentro * 4.5)
                break
              case 'shimmer':
                mod =
                  Math.sin(t * animVel * 5.5 + hsh * 31.4) *
                  (0.45 + 0.55 * Math.sin(nx * 12 + ny * 8 + t * animVel))
                break
              case 'flicker': {
                const cubeta = Math.floor(t * animVel * 7)
                mod = hash2(hsh * 977, cubeta) > 0.94 ? 1 : -0.25
                break
              }
              case 'ripple':
              default:
                mod = Math.sin(distCentro * 13 - t * animVel * 1.7)
                break
            }
          }

          // Onda de água: a célula perto do cursor pulsa e clareia
          const ondulacaoMao =
            distCursor < 13 ? Math.cos(distCursor * 0.7 - t * 5.2) * (1 - distCursor / 13) * 0.42 : 0

          // Etapa 6: luzes pontuais
          let luz = 0
          if (cfg.lights.enabled) {
            for (const pt of cfg.lights.points) {
              const dl = Math.hypot(c / cols - pt.x, r / rows - pt.y)
              if (dl < pt.radius) luz += (1 - dl / pt.radius) * pt.intensity * 0.28
            }
          }

          let lum = base + mod * animAmp * (0.35 + base * 0.9) + ondulacaoMao + luz
          lum = clamp01(lum)
          if (lum < 0.045) continue

          const ganho = 0.72 + lum * 0.6 + luz * 1.5
          const cr = cR[i] * ganho + (ondulacaoMao > 0.08 ? 55 : 0)
          const cg = cG[i] * ganho + (ondulacaoMao > 0.08 ? 20 : 0)
          const cb = cB[i] * ganho
          const alfa = Math.min(0.94, (0.16 + lum * 0.78) * alphaMult)

          desenharPrimitiva(
            camadaCtx,
            cfg.renderMode,
            c * celW,
            r * celH,
            celW,
            celH,
            lum,
            cr,
            cg,
            cb,
            alfa,
            hsh,
            c,
            r,
            t
          )
        }
      }

      comporCamada()
      aplicarPfx()
      desenharChuva(t)

      // Etapa 7: máscara revelando a foto original
      if (cfg.mask.enabled && mascara && mascaraPronta && fonte) {
        rascunho.width = canvas.width
        rascunho.height = canvas.height
        const rc = rascunho.getContext('2d')
        if (rc) {
          rc.setTransform(dpr, 0, 0, dpr, 0, 0)
          rc.clearRect(0, 0, larg, alt)
          if (cfg.mask.invert) {
            rc.fillStyle = '#fff'
            rc.fillRect(0, 0, larg, alt)
            rc.globalCompositeOperation = 'destination-out'
            rc.drawImage(mascara, 0, 0, larg, alt)
          } else {
            rc.drawImage(mascara, 0, 0, larg, alt)
          }
          rc.globalCompositeOperation = 'source-in'
          rc.drawImage(fonte, 0, 0, larg, alt)
          rc.globalCompositeOperation = 'source-over'
          ctx.drawImage(rascunho, 0, 0, larg, alt)
        }
      }
    }

    const t0 = performance.now()
    let ultimoFrame = 0
    const quadroMs = 1000 / 30

    const laco = (agora: number) => {
      rafId = requestAnimationFrame(laco)
      if (agora - ultimoFrame < quadroMs) return
      ultimoFrame = agora
      if (document.hidden) return

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, larg, alt)
      renderizar((agora - t0) * 0.001)
    }

    rafId = requestAnimationFrame(laco)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', inicializar)
    }
  }, [zenMode])

  return (
    <div className="fui-ascii-production-wrap" aria-hidden>
      <canvas ref={canvasRef} className="fui-ascii-canvas" />
    </div>
  )
})
