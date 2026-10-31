import { Eye, EyeOff, Mic, MicOff, Send, Video, VideoOff, Volume2, VolumeX } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { TelemetriaFUI } from './api'
import { fuiAudio } from './FuiAudio'
import { biometriaGlobal } from './FuiWebGL'

export type AcoesEspaciaisFUI = {
  panBy: (dx: number, dy: number) => void
  zoomByFactor: (fator: number, centerX?: number, centerY?: number) => void
  selecionarNoEm: (screenX: number, screenY: number, abrirViewer?: boolean) => string | null
  arrastarNo: (id: string, dxScreen: number, dyScreen: number) => void
  soltarArrasteNo: (id: string) => void
  dispararPesquisaAgentes: (query: string) => void
  comandoVozAcao: (acao: 'aprovar' | 'favoritar' | 'descartar' | 'abrir' | 'fechar' | 'ampliar' | 'reduzir' | 'enquadrar' | 'video') => void
}

declare global {
  interface Window {
    Hands?: new (opts: { locateFile: (file: string) => string }) => {
      setOptions: (opts: Record<string, unknown>) => void
      onResults: (cb: (res: MediaPipeHandResults) => void) => void
      send: (input: { image: HTMLVideoElement }) => Promise<void>
      close?: () => void
    }
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    SpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

type Landmark = { x: number; y: number; z: number }
type MediaPipeHandResults = {
  multiHandLandmarks?: Landmark[][]
  multiHandedness?: { label: string; score: number }[]
}

type ModoGesto1Mao = 'OPEN' | 'FIST_PAN' | 'PINCH_CLICK' | 'PEACE_CLOSE'

type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function carregarScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[src="${src}"]`)
    if (existente) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`))
    document.head.appendChild(s)
  })
}

/** Filtro 1€ Adaptativo (Casiez et al.): super estável quando a mão para, zero atraso quando a mão acelera! */
function filtrar1Euro(atual: number, alvo: number, minAlpha = 0.22, maxAlpha = 0.82, limiarVel = 48): number {
  const delta = Math.abs(alvo - atual)
  const t = Math.min(1, delta / limiarVel)
  const alpha = minAlpha + (maxAlpha - minAlpha) * t
  return atual + (alvo - atual) * alpha
}

/** Verifica se um dedo está estendido comparando a distância da ponta (tip) ao pulso (0) vs articulação PIP ao pulso (0). */
function dedoEstendido(h: Landmark[], tipIdx: number, pipIdx: number, fator = 1.12): boolean {
  const w = h[0]
  const tip = h[tipIdx]
  const pip = h[pipIdx]
  const dTip = Math.hypot(tip.x - w.x, tip.y - w.y)
  const dPip = Math.hypot(pip.x - w.x, pip.y - w.y)
  return dTip > dPip * fator
}

/** Detecta se uma mão está em estado de "PEGAR / GRAB" (seja Fechada em Punho ✊ OU em Pinça 👌) para o Zoom de 2 Mãos. */
function maoPegandoParaZoom(h: Landmark[], estavaPegando: boolean): boolean {
  const thumb = h[4]
  const index = h[8]
  const distPinch = Math.hypot(thumb.x - index.x, thumb.y - index.y, (thumb.z - index0Z(thumb, index)) * 0.35)
  const limiarPinch = estavaPegando ? 0.088 : 0.068
  if (distPinch < limiarPinch) return true

  // Verifica se os dedos estão fechados/curvados (punho fechado ou semi-fechado "pegando" o ar)
  const extIndex = dedoEstendido(h, 8, 6, estavaPegando ? 1.16 : 1.11)
  const extMiddle = dedoEstendido(h, 12, 10, estavaPegando ? 1.16 : 1.11)
  const extRing = dedoEstendido(h, 16, 14, estavaPegando ? 1.15 : 1.10)
  const dedosDobrados = (!extIndex ? 1 : 0) + (!extMiddle ? 1 : 0) + (!extRing ? 1 : 0)
  return dedosDobrados >= 2
}

function index0Z(a: Landmark, b: Landmark): number {
  return b.z || a.z || 0
}

/** Busca magnética de alvos interativos (botões, links e cards) em um raio de 30px ao redor do cursor da mão. */
function buscarAlvoMagnetico(sx: number, sy: number): {
  btnEl?: HTMLElement
  nodeEl?: HTMLElement
  nodeId: string | null
} {
  const offsets = [
    [0, 0],
    [-14, 0], [14, 0], [0, -14], [0, 14],
    [-26, 0], [26, 0], [0, -26], [0, 26],
    [-18, -18], [18, -18], [-18, 18], [18, 18],
  ]
  let foundBtn: HTMLElement | undefined
  let foundNode: HTMLElement | undefined

  for (const [ox, oy] of offsets) {
    const px = sx + ox
    const py = sy + oy
    if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) continue
    const els = document.elementsFromPoint(px, py)
    if (!foundBtn) {
      foundBtn = els.map((el) => el.closest('button, a')).find(Boolean) as HTMLElement | undefined
    }
    if (!foundNode) {
      foundNode = els.map((el) => el.closest('.react-flow__node')).find(Boolean) as HTMLElement | undefined
    }
    if (foundBtn && foundNode) break
  }

  return {
    btnEl: foundBtn,
    nodeEl: foundNode,
    nodeId: foundNode?.getAttribute('data-id') || null,
  }
}

/** Classifica ortogonalmente o gesto de 1 mão com prioridade para Click de Pinça (👌) estável. */
function classificarGestoMao(h: Landmark[], estavaPinch: boolean): {
  modo: ModoGesto1Mao
  distPinch: number
} {
  const thumb = h[4]
  const index = h[8]
  const distPinch = Math.hypot(thumb.x - index.x, thumb.y - index.y, (thumb.z - index.z) * 0.38)

  const extIndex = dedoEstendido(h, 8, 6, 1.09)
  const extMiddle = dedoEstendido(h, 12, 10, 1.10)
  const extRing = dedoEstendido(h, 16, 14, 1.09)
  const extPinky = dedoEstendido(h, 20, 18, 1.09)

  // 1. GESTO "V" / PAZ (✌️ Indicador + Médio estendidos, Anelar + Mínimo dobrados, sem pinça): FECHAR TELA COM 1 MÃO
  const sepIndexMiddle = Math.hypot(h[8].x - h[12].x, h[8].y - h[12].y)
  if (extIndex && extMiddle && !extRing && !extPinky && distPinch > 0.072 && sepIndexMiddle > 0.036) {
    return { modo: 'PEACE_CLOSE', distPinch }
  }

  // 2. PINÇA DE PRECISÃO 👌 (Polegar + Indicador próximos — verificado ANTES do punho fechado para nunca falhar o clique!)
  const limiarPinch = estavaPinch ? 0.080 : 0.062
  const dIdxWrist = Math.hypot(h[8].x - h[0].x, h[8].y - h[0].y)
  const dMcpWrist = Math.hypot(h[5].x - h[0].x, h[5].y - h[0].y)
  const naoEhPunhoEncolhido = extMiddle || extRing || extPinky || dIdxWrist > dMcpWrist * 0.88
  if (distPinch < limiarPinch && (naoEhPunhoEncolhido || estavaPinch)) {
    return { modo: 'PINCH_CLICK', distPinch }
  }

  // 3. PUNHO FECHADO ✊ (Mão fechada para mover/Pan ou passar página): Todos os 4 dedos principais dobrados na palma e sem pinça
  if (!extIndex && !extMiddle && !extRing && !extPinky) {
    return { modo: 'FIST_PAN', distPinch }
  }

  return { modo: 'OPEN', distPinch }
}

export const BiometricNUI = memo(function BiometricNUI({
  telemetria,
  acoes,
  viewerAberto,
  isZenMode = false,
  onToggleZenMode,
  audioAtivo,
  onToggleAudio,
}: {
  telemetria?: TelemetriaFUI
  acoes: AcoesEspaciaisFUI
  viewerAberto?: boolean
  isZenMode?: boolean
  onToggleZenMode?: () => void
  audioAtivo?: boolean
  onToggleAudio?: () => void
}) {
  const [camAtiva, setCamAtiva] = useState(false)
  const [camStatus, setCamStatus] = useState<'OFFLINE' | 'LOADING ML...' | 'BIOMETRIC LOCK' | '2-HAND ZOOM' | 'SEARCHING HANDS'>('OFFLINE')
  const [vozAtiva, setVozAtiva] = useState(false)
  const [transcricao, setTranscricao] = useState('Diga: "Pesquisar arxiv interfaces neurais" ou "Fechar"')
  const [somAtivo, setSomAtivo] = useState(true)
  const [hudCompacto, setHudCompacto] = useState(false)

  // Estado React enxuto: só re-renderiza quando muda o MODO ou visibilidade (NUNCA a cada pixel de movimento!)
  const [uiR, setUiR] = useState<{
    active: boolean
    modo: ModoGesto1Mao
    hoverId: string | null
    closeBucket: number
  }>({ active: false, modo: 'OPEN', hoverId: null, closeBucket: 0 })

  const [uiL, setUiL] = useState<{ active: boolean; grabbing: boolean }>({ active: false, grabbing: false })
  const [pinchScaleAtivo, setPinchScaleAtivo] = useState(false)

  // Refs DOM diretos para movimento 60fps Zero-Lag sem re-renderizar o React
  const cursorRRef = useRef<HTMLDivElement>(null)
  const cursorLRef = useRef<HTMLDivElement>(null)
  const zoomLineRef = useRef<SVGLineElement>(null)
  const zoomCircleRef = useRef<SVGCircleElement>(null)
  const zoomLabelRef = useRef<SVGTextElement>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const acoesRef = useRef(acoes)
  acoesRef.current = acoes
  const viewerAbertoRef = useRef(!!viewerAberto)
  viewerAbertoRef.current = !!viewerAberto

  const gestosRef = useRef({
    smoothR: { x: window.innerWidth * 0.55, y: window.innerHeight * 0.5 },
    smoothL: { x: window.innerWidth * 0.35, y: window.innerHeight * 0.5 },
    ultimoModoR: 'OPEN' as ModoGesto1Mao,
    wasGrabbing0: false,
    wasGrabbing1: false,
    twoHandGrace: 0,
    lastPinchTimeR: 0,
    lastPinchPosR: { x: 0, y: 0 },
    draggedNodeId: null as string | null,
    wasSelectedOnPinch: false,
    pinchMoveDist: 0,
    lastPanPos: null as { x: number; y: number } | null,
    lastSmoothSpan: null as number | null,
    anchorSpan: null as number | null,
    lastTwoHandMid: null as { x: number; y: number } | null,
    hoveredNodeId: null as string | null,
    peaceStartTime: 0,
    peaceTriggered: false,
    frameCount: 0,
    swipeStartX: null as number | null,
    swipeStartTime: 0,
    lastPageFlipTime: 0,
    lastPageFlipDir: null as 'next' | 'prev' | null,
  })

  // ---------- 1. RASTREAMENTO BIOMÉTRICO 60FPS (1€ FILTER + DOM DIRETO + 2-HAND GRAB ZOOM) ----------
  useEffect(() => {
    if (!camAtiva) {
      setCamStatus('OFFLINE')
      biometriaGlobal.handRight.active = false
      biometriaGlobal.handLeft.active = false
      biometriaGlobal.head.active = false
      setUiR((c) => ({ ...c, active: false, closeBucket: 0 }))
      setUiL((c) => ({ ...c, active: false }))
      setPinchScaleAtivo(false)
      return
    }

    let cancelado = false
    let stream: MediaStream | null = null
    let rafId = 0
    let emInferencia = false

    const iniciarBiometria = async () => {
      try {
        setCamStatus('LOADING ML...')
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            },
            audio: false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        }
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCamStatus('SEARCHING HANDS')
      } catch {
        setCamStatus('OFFLINE')
        setCamAtiva(false)
        return
      }

      try {
        await carregarScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js')
        if (cancelado || !window.Hands) return

        const hands = new window.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
        })

        // modelComplexity: 0 roda o modelo Lite na GPU com o dobro de FPS e latência mínima!
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 0,
          minDetectionConfidence: 0.60,
          minTrackingConfidence: 0.58,
        })

        hands.onResults((results: MediaPipeHandResults) => {
          if (cancelado) return
          const rawHands = results.multiHandLandmarks || []
          const canvas = overlayCanvasRef.current
          const ctx = canvas?.getContext('2d')
          if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }

          // FILTRO ANTI-FANTASMA PRECISO:
          // Só descarta a 2ª detecção se os dois centros de palma (landmark 9) estiverem quase no mesmo ponto (< 8.5% do quadro),
          // permitindo que as 2 mãos reais cheguem perto uma da outra para começar a puxar/abrir o zoom!
          const landmarksList: Landmark[][] = []
          if (rawHands.length >= 1) {
            landmarksList.push(rawHands[0])
          }
          if (rawHands.length >= 2) {
            const hA = rawHands[0]
            const hB = rawHands[1]
            const distPalmas = Math.hypot(hA[9].x - hB[9].x, hA[9].y - hB[9].y)
            const distPulsos = Math.hypot(hA[0].x - hB[0].x, hA[0].y - hB[0].y)
            if (distPalmas > 0.085 || distPulsos > 0.11) {
              landmarksList.push(hB)
            }
          }

          const g = gestosRef.current
          g.frameCount++

          if (landmarksList.length === 0) {
            setCamStatus((s) => (s === 'SEARCHING HANDS' ? s : 'SEARCHING HANDS'))
            biometriaGlobal.handRight.active = false
            biometriaGlobal.handLeft.active = false
            if (g.draggedNodeId) {
              acoesRef.current.soltarArrasteNo(g.draggedNodeId)
              g.draggedNodeId = null
            }
            g.lastPanPos = null
            g.lastSmoothSpan = null
            g.anchorSpan = null
            g.lastTwoHandMid = null
            g.twoHandGrace = 0
            g.ultimoModoR = 'OPEN'
            setUiR((c) => (c.active ? { ...c, active: false, closeBucket: 0 } : c))
            setUiL((c) => (c.active ? { ...c, active: false } : c))
            setPinchScaleAtivo((p) => (p ? false : p))
            return
          }

          const W = window.innerWidth
          const H = window.innerHeight

          // Se houver 2 mãos na tela, ordena sempre: Mão da Direita da tela = h0, Mão da Esquerda da tela = h1
          // (evita que o MediaPipe inverta o índice 0 e 1 no meio do zoom!)
          if (landmarksList.length >= 2) {
            const screenX_A = 1 - landmarksList[0][9].x
            const screenX_B = 1 - landmarksList[1][9].x
            if (screenX_A < screenX_B) {
              const tmp = landmarksList[0]
              landmarksList[0] = landmarksList[1]
              landmarksList[1] = tmp
            }
          }

          // Desenha esqueleto no mini-radar da webcam em Laranja Fluorescente (#ff5500) + Branco
          if (canvas && ctx) {
            landmarksList.forEach((hand, hIdx) => {
              ctx.strokeStyle = hIdx === 0 ? '#ff5500' : '#ffffff'
              ctx.lineWidth = 1.8
              const conexoes = [
                [0, 1], [1, 2], [2, 3], [3, 4],
                [0, 5], [5, 6], [6, 7], [7, 8],
                [0, 9], [9, 10], [10, 11], [11, 12],
                [0, 13], [13, 14], [14, 15], [15, 16],
                [0, 17], [17, 18], [18, 19], [19, 20],
              ]
              for (const [a, b] of conexoes) {
                ctx.beginPath()
                ctx.moveTo((1 - hand[a].x) * canvas.width, hand[a].y * canvas.height)
                ctx.lineTo((1 - hand[b].x) * canvas.width, hand[b].y * canvas.height)
                ctx.stroke()
              }
              for (const pt of hand) {
                ctx.fillStyle = '#ffffff'
                ctx.beginPath()
                ctx.arc((1 - pt.x) * canvas.width, pt.y * canvas.height, 2.2, 0, Math.PI * 2)
                ctx.fill()
              }
            })
          }

          // =========================================================================
          // VERIFICAÇÃO PRIORITÁRIA DE 2 MÃOS: FECHAR AS DUAS MÃOS (✊+✊) OU PINÇAR (👌+👌)
          // =========================================================================
          const h0 = landmarksList[0]
          const palm0 = h0[9]

          if (landmarksList.length >= 2) {
            const h1 = landmarksList[1]
            const palm1 = h1[9]

            const grab0 = maoPegandoParaZoom(h0, g.wasGrabbing0)
            const grab1 = maoPegandoParaZoom(h1, g.wasGrabbing1)
            g.wasGrabbing0 = grab0
            g.wasGrabbing1 = grab1

            // Usa o centro da palma (9) para o zoom de 2 mãos (muito mais estável ao fechar/abrir as mãos!)
            const rawX0 = (1 - palm0.x) * W
            const rawY0 = palm0.y * H
            const rawX1 = (1 - palm1.x) * W
            const rawY1 = palm1.y * H

            g.smoothR.x = filtrar1Euro(g.smoothR.x, rawX0)
            g.smoothR.y = filtrar1Euro(g.smoothR.y, rawY0)
            g.smoothL.x = filtrar1Euro(g.smoothL.x, rawX1)
            g.smoothL.y = filtrar1Euro(g.smoothL.y, rawY1)

            const sx0 = g.smoothR.x
            const sy0 = g.smoothR.y
            const sx1 = g.smoothL.x
            const sy1 = g.smoothL.y

            // Atualiza posição DOM dos 2 cursores diretamente a 60fps
            if (cursorRRef.current) {
              cursorRRef.current.style.transform = `translate3d(${sx0.toFixed(1)}px, ${sy0.toFixed(1)}px, 0)`
            }
            if (cursorLRef.current) {
              cursorLRef.current.style.transform = `translate3d(${sx1.toFixed(1)}px, ${sy1.toFixed(1)}px, 0)`
            }

            biometriaGlobal.handRight = {
              x: (sx0 / W) * 2 - 1,
              y: -((sy0 / H) * 2 - 1),
              screenX: sx0,
              screenY: sy0,
              pinching: grab0,
              active: true,
              dist: grab0 ? 0.02 : 0.1,
            }
            biometriaGlobal.handLeft = {
              x: (sx1 / W) * 2 - 1,
              y: -((sy1 / H) * 2 - 1),
              screenX: sx1,
              screenY: sy1,
              pinching: grab1,
              active: true,
              dist: grab1 ? 0.02 : 0.1,
            }

            setUiR((c) => (!c.active || c.modo !== (grab0 ? 'FIST_PAN' : 'OPEN') ? { ...c, active: true, modo: grab0 ? 'FIST_PAN' : 'OPEN' } : c))
            setUiL((c) => (!c.active || c.grabbing !== grab1 ? { active: true, grabbing: grab1 } : c))

            const ambasPegando = (grab0 && grab1) || (g.twoHandGrace > 0 && (grab0 || grab1))
            if (grab0 && grab1) {
              g.twoHandGrace = 5 // mantém lock por 5 frames caso 1 mão acelere muito rápido
            } else if (g.twoHandGrace > 0) {
              g.twoHandGrace--
            }

            if (ambasPegando) {
              if (g.draggedNodeId) {
                acoesRef.current.soltarArrasteNo(g.draggedNodeId)
                g.draggedNodeId = null
              }
              setCamStatus((s) => (s === '2-HAND ZOOM' ? s : '2-HAND ZOOM'))
              setPinchScaleAtivo((p) => (p ? p : true))

              // Distância horizontal + euclidiana combinada (puxar para os lados amplia com força total!)
              const dxSpan = Math.abs(sx0 - sx1)
              const dySpan = Math.abs(sy0 - sy1)
              const rawSpan = Math.max(40, Math.hypot(dxSpan * 1.18, dySpan * 0.9))
              const centerX = (sx0 + sx1) / 2
              const centerY = (sy0 + sy1) / 2

              if (g.lastSmoothSpan === null || g.anchorSpan === null) {
                fuiAudio.pinchLock()
                g.lastSmoothSpan = rawSpan
                g.anchorSpan = rawSpan
                g.lastTwoHandMid = { x: centerX, y: centerY }
              } else {
                const smoothSpan = g.lastSmoothSpan + (rawSpan - g.lastSmoothSpan) * 0.52
                const ratio = smoothSpan / g.lastSmoothSpan
                // Sensibilidade exponencial suave: abrir para os lados amplia, fechar reduz sem zona morta!
                if (Math.abs(ratio - 1) > 0.0025) {
                  const fator = Math.max(0.88, Math.min(1.14, Math.pow(ratio, 1.42)))
                  acoesRef.current.zoomByFactor(fator, centerX, centerY)
                  g.lastSmoothSpan = smoothSpan
                }
                // Também permite mover o centro da cena se as duas mãos fechadas se deslocarem juntas
                if (g.lastTwoHandMid) {
                  const mdx = centerX - g.lastTwoHandMid.x
                  const mdy = centerY - g.lastTwoHandMid.y
                  if (Math.hypot(mdx, mdy) > 1.5) {
                    acoesRef.current.panBy(mdx * 0.85, mdy * 0.85)
                  }
                }
                g.lastTwoHandMid = { x: centerX, y: centerY }
              }

              // Atualiza linha vetorial SVG diretamente via DOM Ref (60fps Zero-Lag!)
              if (zoomLineRef.current) {
                zoomLineRef.current.setAttribute('x1', sx0.toFixed(1))
                zoomLineRef.current.setAttribute('y1', sy0.toFixed(1))
                zoomLineRef.current.setAttribute('x2', sx1.toFixed(1))
                zoomLineRef.current.setAttribute('y2', sy1.toFixed(1))
              }
              if (zoomCircleRef.current) {
                zoomCircleRef.current.setAttribute('cx', centerX.toFixed(1))
                zoomCircleRef.current.setAttribute('cy', centerY.toFixed(1))
              }
              if (zoomLabelRef.current && g.anchorSpan) {
                zoomLabelRef.current.setAttribute('x', centerX.toFixed(1))
                zoomLabelRef.current.setAttribute('y', (centerY - 26).toFixed(1))
                const mult = (rawSpan / g.anchorSpan).toFixed(2)
                zoomLabelRef.current.textContent = `2H GRAB ZOOM // ${mult}x`
              }

              g.lastPanPos = null
              return
            } else {
              // 2 mãos visíveis mas abertas (soltou o zoom): reseta âncora para permitir repetir o movimento ("remar" o zoom)
              g.lastSmoothSpan = null
              g.anchorSpan = null
              g.lastTwoHandMid = null
              setPinchScaleAtivo((p) => (p ? false : p))
            }
          } else {
            g.wasGrabbing1 = false
            g.twoHandGrace = 0
            g.lastSmoothSpan = null
            g.anchorSpan = null
            g.lastTwoHandMid = null
            biometriaGlobal.handLeft.active = false
            setUiL((c) => (c.active ? { active: false, grabbing: false } : c))
            setPinchScaleAtivo((p) => (p ? false : p))
          }

          // =========================================================================
          // OPERAÇÃO DE 1 MÃO (CLICK ESTABILIZADO + IMÃ MAGNÉTICO + FOLHEAR PÁGINA NO VIEWER)
          // =========================================================================
          setCamStatus((s) => (s === 'BIOMETRIC LOCK' ? s : 'BIOMETRIC LOCK'))
          const { modo: modo0, distPinch: dist0 } = classificarGestoMao(h0, g.ultimoModoR === 'PINCH_CLICK')
          const isPinching0 = modo0 === 'PINCH_CLICK'

          // Âncora anatômica anti-pulo: usa 60% articulação MCP (5) + 25% ponta do indicador (8) + 15% polegar (4)
          // para que fechar o indicador sobre o polegar NUNCA desloque a mira para fora do botão!
          const anchorPoint =
            modo0 === 'FIST_PAN'
              ? palm0
              : {
                  x: h0[5].x * 0.60 + h0[8].x * 0.25 + h0[4].x * 0.15,
                  y: h0[5].y * 0.60 + h0[8].y * 0.25 + h0[4].y * 0.15,
                }
          const rawX0 = (1 - anchorPoint.x) * W
          const rawY0 = anchorPoint.y * H

          // Quando os dedos começam a fechar para clicar (dist0 < 0.088), congela/amortece a mira em 92% no início do clique!
          const aproximandoPinch = dist0 < 0.088 && g.pinchMoveDist < 22
          const prevSx = g.smoothR.x
          g.smoothR.x = aproximandoPinch
            ? filtrar1Euro(g.smoothR.x, rawX0, 0.04, 0.12, 90)
            : filtrar1Euro(g.smoothR.x, rawX0)
          g.smoothR.y = aproximandoPinch
            ? filtrar1Euro(g.smoothR.y, rawY0, 0.04, 0.12, 90)
            : filtrar1Euro(g.smoothR.y, rawY0)
          const sx0 = g.smoothR.x
          const sy0 = g.smoothR.y
          const vx = sx0 - prevSx

          if (cursorRRef.current) {
            cursorRRef.current.style.transform = `translate3d(${sx0.toFixed(1)}px, ${sy0.toFixed(1)}px, 0)`
          }

          biometriaGlobal.handRight = {
            x: (sx0 / W) * 2 - 1,
            y: -((sy0 / H) * 2 - 1),
            screenX: sx0,
            screenY: sy0,
            pinching: isPinching0 || modo0 === 'FIST_PAN',
            active: true,
            dist: dist0,
          }
          biometriaGlobal.head = {
            yaw: (0.5 - palm0.x) * 1.35,
            pitch: (palm0.y - 0.5) * 1.35,
            roll: 0,
            active: true,
          }

          // =========================================================================
          // MODO FOLHEAR PÁGINA / PASSAR SLIDES COM A MÃO QUANDO O VIEWER ESTÁ ABERTO
          // =========================================================================
          if (viewerAbertoRef.current) {
            const nowFlip = performance.now()
            if (Math.abs(vx) > 9.5) {
              if (g.swipeStartX === null || nowFlip - g.swipeStartTime > 380) {
                g.swipeStartX = prevSx
                g.swipeStartTime = nowFlip
              }
              const deltaSwipeX = sx0 - g.swipeStartX
              if (Math.abs(deltaSwipeX) > 105 && nowFlip - g.lastPageFlipTime > 650) {
                const direcao: 'next' | 'prev' = deltaSwipeX < 0 ? 'next' : 'prev'
                // Evita disparar a direção oposta no retorno natural da mão em menos de 1.1s
                if (g.lastPageFlipDir !== direcao || nowFlip - g.lastPageFlipTime > 950) {
                  g.lastPageFlipTime = nowFlip
                  g.lastPageFlipDir = direcao
                  g.swipeStartX = null
                  window.dispatchEvent(new CustomEvent('fui:viewer-slide', { detail: { direcao } }))
                }
              }
            } else if (nowFlip - g.swipeStartTime > 380) {
              g.swipeStartX = null
            }
          }

          // Raycasting DOM Magnético (raio de 30px)
          let nodeId = g.hoveredNodeId
          if (modo0 !== g.ultimoModoR || g.frameCount % 2 === 0) {
            const mag = buscarAlvoMagnetico(sx0, sy0)
            nodeId = mag.nodeId
            if (nodeId && nodeId !== g.hoveredNodeId && modo0 === 'OPEN') {
              fuiAudio.hoverTick()
            }
            g.hoveredNodeId = nodeId
          }

          let closeBucket = 0
          if (modo0 === 'PEACE_CLOSE') {
            if (g.draggedNodeId) {
              acoesRef.current.soltarArrasteNo(g.draggedNodeId)
              g.draggedNodeId = null
            }
            g.lastPanPos = null
            const now = performance.now()
            if (!g.peaceStartTime) {
              g.peaceStartTime = now
              g.peaceTriggered = false
            }
            const decorrido = now - g.peaceStartTime
            closeBucket = Math.min(4, Math.floor((decorrido / 360) * 4))
            if (decorrido >= 360 && !g.peaceTriggered) {
              g.peaceTriggered = true
              fuiAudio.voiceDispatch()
              acoesRef.current.comandoVozAcao('fechar')
            }
          } else {
            g.peaceStartTime = 0
            g.peaceTriggered = false
          }

          if (modo0 === 'FIST_PAN') {
            // 1 MÃO FECHADA (PUNHO): Move o canvas (Pan) OU puxa a página no Viewer!
            if (g.draggedNodeId) {
              acoesRef.current.soltarArrasteNo(g.draggedNodeId)
              g.draggedNodeId = null
            }
            if (g.ultimoModoR !== 'FIST_PAN' || !g.lastPanPos) {
              g.lastPanPos = { x: sx0, y: sy0 }
            } else {
              const dx = sx0 - g.lastPanPos.x
              const dy = sy0 - g.lastPanPos.y
              if (viewerAbertoRef.current) {
                const nowFlip = performance.now()
                if (Math.abs(dx) > 62 && nowFlip - g.lastPageFlipTime > 620) {
                  const direcao: 'next' | 'prev' = dx < 0 ? 'next' : 'prev'
                  g.lastPageFlipTime = nowFlip
                  g.lastPageFlipDir = direcao
                  g.lastPanPos = { x: sx0, y: sy0 }
                  window.dispatchEvent(new CustomEvent('fui:viewer-slide', { detail: { direcao } }))
                }
              } else if (Math.hypot(dx, dy) > 0.8) {
                acoesRef.current.panBy(dx * 1.45, dy * 1.45)
                g.lastPanPos = { x: sx0, y: sy0 }
              }
            }
          } else if (modo0 === 'PINCH_CLICK') {
            // 1 MÃO PINÇA 👌: Clique Magnético Imediato em Botões, Links e Cards!
            if (g.ultimoModoR !== 'PINCH_CLICK') {
              fuiAudio.pinchLock()
              const now = performance.now()
              g.lastPinchTimeR = now
              g.lastPinchPosR = { x: sx0, y: sy0 }
              g.pinchMoveDist = 0

              const { btnEl, nodeEl, nodeId: magNodeId } = buscarAlvoMagnetico(sx0, sy0)
              if (btnEl && (!nodeEl || btnEl.classList.contains('nodrag') || btnEl.closest('.viewer, .fui-hud-painel, .topo, .lg-top-navbar, .barra-selecao'))) {
                btnEl.click()
                g.draggedNodeId = null
                g.wasSelectedOnPinch = false
              } else if (magNodeId) {
                g.wasSelectedOnPinch = true
                acoesRef.current.selecionarNoEm(sx0, sy0, false)
                g.draggedNodeId = magNodeId
              } else {
                g.draggedNodeId = null
                g.wasSelectedOnPinch = false
              }
              g.lastPanPos = { x: sx0, y: sy0 }
            } else if (g.lastPanPos) {
              const dx = sx0 - g.lastPanPos.x
              const dy = sy0 - g.lastPanPos.y
              const step = Math.hypot(dx, dy)
              if (step > 2.2) {
                g.pinchMoveDist += step
                if (viewerAbertoRef.current) {
                  const nowFlip = performance.now()
                  if (Math.abs(sx0 - g.lastPinchPosR.x) > 68 && nowFlip - g.lastPageFlipTime > 620) {
                    const direcao: 'next' | 'prev' = sx0 - g.lastPinchPosR.x < 0 ? 'next' : 'prev'
                    g.lastPageFlipTime = nowFlip
                    g.lastPageFlipDir = direcao
                    g.lastPinchPosR = { x: sx0, y: sy0 }
                    window.dispatchEvent(new CustomEvent('fui:viewer-slide', { detail: { direcao } }))
                  }
                } else if (g.draggedNodeId && g.pinchMoveDist > 26) {
                  acoesRef.current.arrastarNo(g.draggedNodeId, dx, dy)
                } else if (!g.draggedNodeId) {
                  acoesRef.current.panBy(dx * 1.3, dy * 1.3)
                }
                g.lastPanPos = { x: sx0, y: sy0 }
              }
            }
          } else {
            if (g.draggedNodeId) {
              // 1 Único Clique de Pinça 👌 sem arrastar (< 28px) ABRE A IMAGEM/CARD IMEDIATAMENTE EM TELA CHEIA!
              if (g.pinchMoveDist < 28) {
                acoesRef.current.comandoVozAcao('abrir')
              } else {
                acoesRef.current.soltarArrasteNo(g.draggedNodeId)
              }
              g.draggedNodeId = null
              g.wasSelectedOnPinch = false
            }
            g.lastPanPos = null
          }

          g.ultimoModoR = modo0
          setUiR((prev) => {
            if (prev.active && prev.modo === modo0 && prev.hoverId === nodeId && prev.closeBucket === closeBucket) {
              return prev
            }
            return { active: true, modo: modo0, hoverId: nodeId, closeBucket }
          })
        })

        // Loop leve: 28 FPS de inferência ML (~35ms) para não pesar na CPU/GPU!
        let lastInferTime = 0
        const loopFrame = (now: number) => {
          if (cancelado) return
          if (!emInferencia && now - lastInferTime >= 35 && videoRef.current && videoRef.current.readyState >= 2) {
            emInferencia = true
            lastInferTime = now
            hands
              .send({ image: videoRef.current })
              .catch(() => {})
              .finally(() => {
                emInferencia = false
              })
          }
          rafId = requestAnimationFrame(loopFrame)
        }
        rafId = requestAnimationFrame(loopFrame)
      } catch {
        // Se MediaPipe CDN demorar ou falhar, mantém a câmera ligada mostrando o vídeo ao vivo!
        setCamStatus('SEARCHING HANDS')
      }
    }

    iniciarBiometria()
    return () => {
      cancelado = true
      cancelAnimationFrame(rafId)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [camAtiva])

  // ---------- 2. CONTROLE POR VOZ CONTÍNUO (SEM TECLADO) ----------
  const interpretarComandoVoz = useCallback((fraseBruta: string) => {
    const f = fraseBruta.trim().toLowerCase()
    if (!f) return

    if (/^(aprovar|aprove|confirmar|validar)$/.test(f) || f.includes('aprovar referência') || f.includes('aprovar aba')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('aprovar')
      return
    }
    if (/^(favoritar|favorito|estrela|salvar)$/.test(f) || f.includes('favoritar aba')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('favoritar')
      return
    }
    if (/^(descartar|remover|ocultar)$/.test(f) || f.includes('descartar aba')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('descartar')
      return
    }
    if (/^(abrir|inspecionar|expandir|tela cheia)$/.test(f) || f.includes('abrir aba') || f.includes('abrir referência')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('abrir')
      return
    }
    if (/^(fechar|feche|voltar|sair|cancelar|esc)$/.test(f) || f.includes('fechar tela') || f.includes('fechar aba')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('fechar')
      return
    }
    if (f.includes('próxima') || f.includes('próximo') || f.includes('passar página') || f.includes('avançar')) {
      fuiAudio.voiceDispatch()
      window.dispatchEvent(new CustomEvent('fui:viewer-slide', { detail: { direcao: 'next' } }))
      return
    }
    if (f.includes('anterior') || f.includes('voltar página') || f.includes('slide anterior')) {
      fuiAudio.voiceDispatch()
      window.dispatchEvent(new CustomEvent('fui:viewer-slide', { detail: { direcao: 'prev' } }))
      return
    }
    if (f.includes('ampliar') || f.includes('mais zoom') || f.includes('aproximar')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('ampliar')
      return
    }
    if (f.includes('reduzir') || f.includes('menos zoom') || f.includes('afastar')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('reduzir')
      return
    }
    if (f.includes('mostrar tudo') || f.includes('enquadrar') || f.includes('visão geral')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('enquadrar')
      return
    }
    if (f.includes('dar vida') || f.includes('gerar vídeo') || f.includes('animar tela')) {
      fuiAudio.voiceDispatch()
      acoesRef.current.comandoVozAcao('video')
      return
    }

    const matchBusca = f.match(/(?:pesquis\w*|busc\w*|procur\w*|encontr\w*|investig\w*|mostr\w*|traga\w*|agente\w*)\s+(?:por\s+|sobre\s+|referências\s+de\s+|imagens\s+de\s+|vídeos\s+de\s+|artigos\s+de\s+)?(.+)/i)
    const termo = (matchBusca ? matchBusca[1] : f.length > 5 ? fraseBruta : '').trim()
    if (termo.length >= 3) {
      fuiAudio.voiceDispatch()
      acoesRef.current.dispararPesquisaAgentes(termo)
    }
  }, [])

  useEffect(() => {
    if (!vozAtiva) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setTranscricao('Navegador sem suporte a Web Speech API (use o Chrome/Edge).')
      setVozAtiva(false)
      return
    }

    let ativo = true
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        const t = r[0].transcript
        if (r.isFinal) {
          setTranscricao(`⚡ "${t.trim()}"`)
          interpretarComandoVoz(t)
        } else {
          interim += t
        }
      }
      if (interim) setTranscricao(`🎙️ ${interim}...`)
    }

    rec.onerror = () => {}
    rec.onend = () => {
      if (ativo) {
        try {
          rec.start()
        } catch {
          // ignora reconexão rápida
        }
      }
    }

    try {
      rec.start()
      setTranscricao('🎙️ ESCUTA ATIVA // Fale sua missão (ArXiv, YouTube, Imagens)...')
    } catch {
      // ignora
    }

    return () => {
      ativo = false
      try {
        rec.stop()
      } catch {
        // ignora
      }
    }
  }, [vozAtiva, interpretarComandoVoz])

  const ultimoAtivoRef = useRef(false)
  useEffect(() => {
    const agoraAtivo = !!telemetria?.ativo
    if (ultimoAtivoRef.current && !agoraAtivo) {
      fuiAudio.grootMaterialize()
    }
    ultimoAtivoRef.current = agoraAtivo
  }, [telemetria?.ativo])

  const [searchQuery, setSearchQuery] = useState('')
  const [gestoSimulado, setGestoSimulado] = useState<{ label: string; desc: string } | null>(null)
  const [modalCorrAberto, setModalCorrAberto] = useState(false)
  const [abaCorr, setAbaCorr] = useState<'agentes' | 'llms' | 'doutrinas' | 'corr' | 'repos'>('repos')
  const [dadosCorr, setDadosCorr] = useState<{
    corr_categorias?: { codigo: string; area: string; foco: string }[]
    modelos_globais?: { id: string; nome: string; origem: string; categoria: string; vram_gpu: string; ram_cpu_q4: string; comando_ollama: string; uso_militar_c4isr: string; favorito?: boolean }[]
    doutrinas_militares?: { codigo: string; titulo: string; descricao: string }[]
    airllm_spec?: { repo: string; principio: string; vram_minima: string; instalacao_opcional: string; codigo_exemplo: string }
    agentes_leves?: { id: string; status: string; cpu_idle: string; gpu_load: string; ram_budget: string; funcao: string }[]
    diagram_design?: { camada: string; regra_visual: string; cor_token: string }[]
    repositorios_estudo?: {
      id: string
      nome?: string
      repo?: string
      url: string
      camada?: string
      camada_fui?: string
      linguagem?: string
      status_integracao?: string
      papel_no_sistema: string
      comando_clone?: string
      clone_cmd?: string
      query_pesquisa: string
    }[]
  } | null>(null)

  const abrirModalCorr = useCallback(
    (abaInicial?: 'agentes' | 'llms' | 'doutrinas' | 'corr' | 'repos') => {
      if (abaInicial) setAbaCorr(abaInicial)
      setModalCorrAberto(true)
      if (!dadosCorr) {
        fetch('/api/corr-militar')
          .then((r) => r.json())
          .then((d) => setDadosCorr(d))
          .catch(() => {})
      }
    },
    [dadosCorr]
  )

  const acionarGestoRapido = (tipo: 'pan' | 'zoom' | 'pinch' | 'reset') => {
    fuiAudio.pinchLock()
    if (tipo === 'pan') {
      acoes.panBy(65, 0)
      setGestoSimulado({ label: '1 MÃO FECHADA', desc: 'Mover Cenário (Pan)' })
    } else if (tipo === 'zoom') {
      acoes.zoomByFactor(1.18)
      setGestoSimulado({ label: '2 MÃOS FECHADAS', desc: 'Ampliar / Reduzir Cena' })
    } else if (tipo === 'pinch') {
      acoes.selecionarNoEm(window.innerWidth / 2, window.innerHeight / 2, false)
      setGestoSimulado({ label: 'PINÇA DETECTADA', desc: 'Clicar / Arrastar Aba' })
    } else {
      acoes.comandoVozAcao('fechar')
      acoes.comandoVozAcao('enquadrar')
      setGestoSimulado({ label: 'GESTO "V"', desc: 'Fechar Tela / Reset' })
    }
  }

  const enviarPesquisaForm = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    fuiAudio.voiceDispatch()
    acoes.dispararPesquisaAgentes(q)
    setSearchQuery('')
  }

  const grootProb = telemetria?.groot_prob ?? 0.951
  const logs = (telemetria?.logs || []).slice(-6)
  const labelGestoAtivo = pinchScaleAtivo
    ? 'MODO: 2H ZOOM'
    : uiR.active
      ? `MODO: ${uiR.modo}`
      : gestoSimulado?.label || 'MODO: OPEN'
  const descGestoAtivo = pinchScaleAtivo
    ? '2 Mãos Ampliando Cena'
    : uiR.active
      ? uiR.hoverId
        ? `Alvo: ${uiR.hoverId}`
        : 'Mão aberta / Rastreando'
      : gestoSimulado?.desc || 'Mão aberta / Rastreando'

  return (
    <>
      {/* Cursores Espaciais Holográficos das Mãos (Movimento 60fps via DOM Ref direto!) */}
      <div
        ref={cursorRRef}
        className={`fui-cursor-mao direita modo-${uiR.modo.toLowerCase()} ${uiR.modo === 'PINCH_CLICK' || pinchScaleAtivo ? 'pinch' : ''} ${uiR.hoverId ? 'alvo' : ''}`}
        style={{ display: uiR.active ? 'block' : 'none' }}
      >
        <div className="fui-cursor-anel" />
        <div className="fui-cursor-mira" />
        <span className="fui-cursor-tag">
          {pinchScaleAtivo
            ? '✊ 2 MÃOS // PUXE P/ AMPLIAR'
            : uiR.modo === 'PEACE_CLOSE'
              ? `✌️ FECHANDO TELA (${uiR.closeBucket * 25}%)`
              : uiR.modo === 'FIST_PAN'
                ? '✊ PUNHO // MOVER CENÁRIO'
                : uiR.modo === 'PINCH_CLICK'
                  ? uiR.hoverId
                    ? `👌 PINÇA // ${uiR.hoverId}`
                    : '👌 PINÇA // CLICK'
                  : viewerAberto
                    ? '📖 PASSE A MÃO ⬅️/➡️ P/ MUDAR PÁG · ✌️ FECHAR'
                    : uiR.hoverId
                      ? `👌 PINCE P/ ABRIR // ${uiR.hoverId}`
                      : 'HAND-R // OPEN'}
        </span>
      </div>

      <div
        ref={cursorLRef}
        className={`fui-cursor-mao esquerda ${uiL.grabbing || pinchScaleAtivo ? 'pinch' : ''}`}
        style={{ display: uiL.active ? 'block' : 'none' }}
      >
        <div className="fui-cursor-anel" />
        <div className="fui-cursor-mira" />
        <span className="fui-cursor-tag">
          {pinchScaleAtivo ? '✊ 2 MÃOS // ZOOM ATIVO' : uiL.grabbing ? '✊ MÃO ESQ // PRONTA' : 'HAND-L // ABERTA'}
        </span>
      </div>

      {/* Vetor Holográfico de Ampliação com as 2 Mãos (Atualizado via DOM Ref a 60fps!) */}
      <svg className="fui-zoom-vetor" style={{ display: pinchScaleAtivo ? 'block' : 'none' }} aria-hidden>
        <line ref={zoomLineRef} x1={0} y1={0} x2={0} y2={0} />
        <circle ref={zoomCircleRef} cx={0} cy={0} r={22} />
        <text
          ref={zoomLabelRef}
          x={0}
          y={0}
          fill="#ff5500"
          fontSize="11"
          fontWeight="700"
          fontFamily="monospace"
          textAnchor="middle"
        >
          2H GRAB ZOOM
        </text>
      </svg>

      {/* PAINEL ESQUERDO LIQUID GLASS + LARANJA FLUORESCENTE (#FF5500) - IDÊNTICO AO FUIAGENTSfront */}
      <aside
        className={`fui-hud-painel liquid-glass-panel ${hudCompacto ? 'compacto' : ''}`}
        style={{ display: isZenMode ? 'none' : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fui-hud-cabecalho">
          <span className="lg-orange-dot" />
          <div className="fui-hud-titulos">
            <strong>FUI AGENTS // COGNITIVE SPATIAL OS</strong>
            <span>ARXIV + YOUTUBE + WEB + GROOT 1</span>
          </div>
          <button
            type="button"
            className="fui-btn-mini"
            title={(audioAtivo ?? somAtivo) ? 'Silenciar sintetizador FUI' : 'Ativar som FUI'}
            onClick={() => {
              const atual = audioAtivo ?? somAtivo
              fuiAudio.muted = atual
              setSomAtivo(!atual)
              onToggleAudio?.()
            }}
          >
            {(audioAtivo ?? somAtivo) ? <Volume2 size={13} color="#ff5500" /> : <VolumeX size={13} />}
          </button>
          <button
            type="button"
            className="fui-btn-mini"
            title={hudCompacto ? 'Expandir console FUI' : 'Minimizar console FUI / Modo Zen'}
            onClick={() => {
              setHudCompacto(!hudCompacto)
              if (hudCompacto && onToggleZenMode) {
                /* mantém sincronizado */
              }
            }}
          >
            {hudCompacto ? <EyeOff size={13} /> : <Eye size={13} color="#ff5500" />}
          </button>
        </div>

        <div className="fui-controles-nui">
          <button
            type="button"
            className={`fui-btn-nui ${camAtiva ? 'ativo' : ''}`}
            onClick={() => setCamAtiva(!camAtiva)}
            title="Ativar controle espacial pelas Mãos (1 Mão Fechada = Mover, 2 Mãos Fechadas Puxando = Ampliar/Zoom)"
          >
            {camAtiva ? <Video size={14} color="#ff5500" /> : <VideoOff size={14} />}
            <span>{camAtiva ? 'MÃOS: ON' : 'LIGAR MÃOS'}</span>
          </button>

          <button
            type="button"
            className={`fui-btn-nui voz ${vozAtiva ? 'ativo' : ''}`}
            onClick={() => setVozAtiva(!vozAtiva)}
            title="Ativar escuta contínua por Voz para comandar agentes e manipular a FUI sem teclado"
          >
            {vozAtiva ? <Mic size={14} color="#ff5500" /> : <MicOff size={14} />}
            <span>{vozAtiva ? 'VOZ: ON' : 'LIGAR VOZ'}</span>
          </button>
        </div>

        {/* Monitor de Câmera (Vídeo ao vivo da Webcam + Esqueleto 60fps sempre visível!) */}
        <div
          className="lg-cam-monitor-box"
          style={{ display: hudCompacto ? 'none' : 'flex', cursor: camAtiva ? 'default' : 'pointer' }}
          onClick={() => {
            if (!camAtiva) setCamAtiva(true)
          }}
          title={camAtiva ? 'Webcam Ativa (60fps)' : 'Clique para ligar a câmera'}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="lg-cam-live-video"
            style={{ display: camAtiva ? 'block' : 'none' }}
          />
          <canvas
            ref={overlayCanvasRef}
            width={320}
            height={112}
            className="lg-cam-skeleton-canvas"
            style={{ display: camAtiva ? 'block' : 'none' }}
          />
          {!camAtiva && (
            <div className="lg-cam-idle-reticle">
              <div className="lg-idle-circle">
                <span className="lg-orange-dot" />
              </div>
            </div>
          )}
          <div className="lg-cam-badge-top">
            <span className="lg-orange-dot" />
            <span>{labelGestoAtivo}</span>
          </div>
          <div className="lg-cam-bar-bottom">
            <span className="branco">{camAtiva ? `CAM ON // ${camStatus}` : 'CAMERA OFF (CLIQUE P/ LIGAR)'}</span>
            <span>{descGestoAtivo}</span>
          </div>
        </div>

        {!hudCompacto && (
          <>

            {/* Linha de Pílulas Interativas de Gestos */}
            <div className="lg-gestos-row">
              <span className="lg-gestos-lbl">GESTOS:</span>
              <button type="button" onClick={() => acionarGestoRapido('pan')} className="lg-gesto-chip">
                ✊ Pan
              </button>
              <button type="button" onClick={() => acionarGestoRapido('zoom')} className="lg-gesto-chip">
                ✊+✊ Zoom
              </button>
              <button type="button" onClick={() => acionarGestoRapido('pinch')} className="lg-gesto-chip">
                👌 Pinça
              </button>
              <button type="button" onClick={() => acionarGestoRapido('reset')} className="lg-gesto-chip">
                ✌ Reset
              </button>
            </div>

            {/* Barra de Calibração Groot-1 em Laranja Fluorescente (#ff5500) */}
            <div className="fui-groot-box">
              <div className="fui-groot-medidor">
                <span className="lg-orange-dot" />
                <span>GROOT 1 CALIBRATION:</span>
                <strong className="alta">{grootProb.toFixed(3)}</strong>
              </div>
              <div className="fui-groot-barra">
                <div className="fui-groot-fill" style={{ width: `${Math.round(grootProb * 100)}%` }} />
              </div>
            </div>

            {/* Campo Híbrido: Digite ou Fale sua pesquisa direto no Console! */}
            <form onSubmit={enviarPesquisaForm} className="lg-search-form">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={vozAtiva ? transcricao : "Diga ou digite: 'Pesquisar arxiv'..."}
                className="lg-search-input"
              />
              <button type="submit" className="lg-search-send" title="Disparar Agentes de Pesquisa">
                <Send size={14} color="#ff5500" />
              </button>
            </form>

            {/* Atalhos Inteligência Multi-Fonte (2x2 Grid como no FUIAGENTSfront) */}
            <div className="fui-missoes">
              <span className="fui-label">INTELIGÊNCIA MULTI-FONTE:</span>
              <div className="fui-missoes-grade">
                <button
                  type="button"
                  className="lg-multi-card"
                  disabled={!!telemetria?.ativo}
                  onClick={() => {
                    fuiAudio.voiceDispatch()
                    acoes.dispararPesquisaAgentes('arxiv 2604.08224 diagramas arquitetura Weights Context Harness Militar')
                  }}
                >
                  <strong className="branco">ArXiv 2604.08224:</strong>
                  <span>Diagramas IA</span>
                </button>

                <button
                  type="button"
                  className="lg-multi-card"
                  disabled={!!telemetria?.ativo}
                  onClick={() => {
                    fuiAudio.voiceDispatch()
                    acoes.dispararPesquisaAgentes('youtube FUI HUD interface reel Territory Studio cockpit')
                  }}
                >
                  <strong className="laranja">YouTube:</strong>
                  <span>FUI Recon HUD</span>
                </button>

                <button
                  type="button"
                  className="lg-multi-card"
                  disabled={!!telemetria?.ativo}
                  onClick={() => {
                    fuiAudio.voiceDispatch()
                    acoes.dispararPesquisaAgentes('NORAD C4ISR command control radar F-35 cockpit display')
                  }}
                >
                  <strong className="branco">Militar:</strong>
                  <span>Command Stack</span>
                </button>

                <button
                  type="button"
                  className="lg-multi-card"
                  disabled={!!telemetria?.ativo}
                  onClick={() => {
                    fuiAudio.voiceDispatch()
                    acoes.dispararPesquisaAgentes('CERN LHC control room particle detector telemetry interface')
                  }}
                >
                  <strong className="laranja">CERN LHC:</strong>
                  <span>Telemetria Web</span>
                </button>
              </div>

              <button type="button" className="lg-airllm-banner" onClick={() => abrirModalCorr('repos')}>
                ECOSSISTEMA GITHUB + AIRLLM + ARXIV CORR (8 REPOS)
              </button>
            </div>

            <div className="lg-logs-wrap">
              <span className="fui-label">LOGS DE EXECUÇÃO EM TEMPO REAL:</span>
              <div className="fui-terminal-logs">
                {logs.length === 0 ? (
                  <div className="fui-log-linha">&gt; SYSTEM READY // AGUARDANDO COMANDO DE VOZ OU GESTO...</div>
                ) : (
                  logs.map((l, i) => (
                    <div key={`${l.ts}-${i}`} className={`fui-log-linha nv-${l.nivel.toLowerCase()}`}>
                      <span className="hora">[{l.hora}]</span> <b>{l.agente}:</b> {l.msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </aside>

      {modalCorrAberto && (
        <div className="fui-modal-corr-backdrop" onClick={() => setModalCorrAberto(false)}>
          <div className="fui-modal-corr" onClick={(e) => e.stopPropagation()}>
            <div className="fui-modal-corr-header">
              <div>
                <strong style={{ color: '#00f0ff', fontSize: 13 }}>
                  MILITARYCON // ECOSSISTEMA GITHUB + AIRLLM + ARXIV CoRR + LLMs SOBERANOS
                </strong>
                <div style={{ fontSize: 10, color: '#8ab8cc', marginTop: 2 }}>
                  reading · openobserve · openpose · mmpose · Taskosaur · gods-eye-view · airllm · diagram-design
                </div>
              </div>
              <button type="button" className="fui-tab-btn ativo" onClick={() => setModalCorrAberto(false)}>
                FECHAR [ESC]
              </button>
            </div>

            <div className="fui-modal-corr-tabs">
              <button type="button" className={`fui-tab-btn ${abaCorr === 'repos' ? 'ativo' : ''}`} onClick={() => setAbaCorr('repos')}>
                1. ECOSSISTEMA GITHUB (8 REPOS DE ESTUDO)
              </button>
              <button type="button" className={`fui-tab-btn ${abaCorr === 'agentes' ? 'ativo' : ''}`} onClick={() => setAbaCorr('agentes')}>
                2. QUAIS AGENTES RODAR (PC LEVE + AIRLLM)
              </button>
              <button type="button" className={`fui-tab-btn ${abaCorr === 'llms' ? 'ativo' : ''}`} onClick={() => setAbaCorr('llms')}>
                3. LLMs SOBERANOS &amp; ABLITERATED (CPU Q4)
              </button>
              <button type="button" className={`fui-tab-btn ${abaCorr === 'doutrinas' ? 'ativo' : ''}`} onClick={() => setAbaCorr('doutrinas')}>
                4. DIAGRAM DESIGN &amp; 5 DOUTRINAS MILITARES
              </button>
              <button type="button" className={`fui-tab-btn ${abaCorr === 'corr' ? 'ativo' : ''}`} onClick={() => setAbaCorr('corr')}>
                5. BANCO ARXIV CoRR (41 CATEGORIAS CS)
              </button>
            </div>

            <div className="fui-modal-corr-body">
              {abaCorr === 'repos' && (
                <div className="fui-grid-cards">
                  {(dadosCorr?.repositorios_estudo || []).map((repo) => (
                    <div key={repo.id} className="fui-info-card" style={{ borderColor: 'rgba(255, 85, 0, 0.45)' }}>
                      <strong style={{ color: '#ff5500' }}>📦 {repo.nome || repo.repo || repo.id}</strong>
                      <span style={{ color: '#00ff9d', fontSize: 10, fontFamily: 'monospace' }}>
                        {repo.camada || repo.camada_fui} · {repo.linguagem || repo.status_integracao || 'ATIVO'}
                      </span>
                      <span>{repo.papel_no_sistema}</span>
                      <code>{repo.comando_clone || repo.clone_cmd}</code>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          className="fui-tab-btn ativo"
                          onClick={() => {
                            setModalCorrAberto(false)
                            fuiAudio.voiceDispatch()
                            acoes.dispararPesquisaAgentes(repo.query_pesquisa)
                          }}
                        >
                          PESQUISAR ARQUITETURA NO CANVAS
                        </button>
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="fui-tab-btn"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                        >
                          ABRIR GITHUB ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {abaCorr === 'agentes' && (
                <>
                  {dadosCorr?.airllm_spec && (
                    <div className="fui-info-card" style={{ borderColor: '#ffd000' }}>
                      <strong style={{ color: '#ffd000' }}>
                        ⚡ MOTOR AIRLLM LAYER-WISE ({dadosCorr.airllm_spec.repo})
                      </strong>
                      <span>{dadosCorr.airllm_spec.principio}</span>
                      <span><b>Requisito Mínimo:</b> {dadosCorr.airllm_spec.vram_minima}</span>
                      <code>{dadosCorr.airllm_spec.codigo_exemplo}</code>
                    </div>
                  )}
                  <div className="fui-grid-cards">
                    {(dadosCorr?.agentes_leves || []).map((ag) => (
                      <div key={ag.id} className="fui-info-card">
                        <strong>{ag.id}</strong>
                        <span style={{ color: '#00ff9d', fontSize: 10 }}>
                          Status: {ag.status} | CPU Idle: {ag.cpu_idle} | GPU: {ag.gpu_load} | RAM: {ag.ram_budget}
                        </span>
                        <span>{ag.funcao}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {abaCorr === 'llms' && (
                <div className="fui-grid-cards">
                  {(dadosCorr?.modelos_globais || []).map((m) => (
                    <div key={m.id} className="fui-info-card" style={m.favorito ? { borderColor: '#ffd000' } : undefined}>
                      <strong>{m.favorito ? '👑 ' : ''}{m.nome} ({m.origem})</strong>
                      <span style={{ color: '#8ceeff', fontSize: 10 }}>
                        {m.categoria} | GPU: {m.vram_gpu} | {m.ram_cpu_q4}
                      </span>
                      <span>{m.uso_militar_c4isr}</span>
                      <code>{m.comando_ollama}</code>
                    </div>
                  ))}
                </div>
              )}

              {abaCorr === 'doutrinas' && (
                <>
                  <div className="fui-grid-cards">
                    {(dadosCorr?.diagram_design || []).map((d) => (
                      <div key={d.camada} className="fui-info-card">
                        <strong>{d.camada}</strong>
                        <span>{d.regra_visual}</span>
                        <code>{d.cor_token}</code>
                      </div>
                    ))}
                  </div>
                  <div className="fui-grid-cards">
                    {(dadosCorr?.doutrinas_militares || []).map((dm) => (
                      <div key={dm.codigo} className="fui-info-card">
                        <strong>[{dm.codigo}] {dm.titulo}</strong>
                        <span>{dm.descricao}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {abaCorr === 'corr' && (
                <div className="fui-grid-cards">
                  {(dadosCorr?.corr_categorias || []).map((cat) => (
                    <div key={cat.codigo} className="fui-info-card">
                      <strong>{cat.codigo} — {cat.area}</strong>
                      <span>{cat.foco}</span>
                      <button
                        type="button"
                        className="fui-tab-btn"
                        onClick={() => {
                          setModalCorrAberto(false)
                          acoes.dispararPesquisaAgentes(`arxiv ${cat.codigo} ${cat.area} diagram architecture`)
                        }}
                      >
                        EXTRAIR DIAGRAMAS ({cat.codigo})
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
})
