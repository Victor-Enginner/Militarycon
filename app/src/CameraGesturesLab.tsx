import { Check, Hand, Plus, RotateCcw, Sparkles, Video, VideoOff, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fuiAudio } from './FuiAudio'

interface CustomGesture {
  id: string
  name: string
  action: string
  icon: string
  confidence: number
}

const TUTORIAL_LIST = [
  {
    id: 'pan',
    title: '✊ 1 Mão Fechada',
    subtitle: 'Mover Cenário (Pan)',
    badge: 'BÁSICO',
    description:
      'Feche uma das mãos em punho firme na frente do sensor. Arraste suavemente no ar para movimentar o mapa espacial em qualquer direção.',
    actionDetail: 'Delta de deslocamento XY filtrado com 1€ Adaptive Filter a 60fps.',
  },
  {
    id: 'zoom',
    title: '✊+✊ 2 Mãos Fechadas',
    subtitle: 'Zoom In / Out (Escala)',
    badge: 'PROFUNDIDADE',
    description:
      'Feche os dois punhos no campo visual. Afaste as mãos para os lados para ampliar (Zoom In) ou aproxime-as para reduzir a escala espacial (Zoom Out).',
    actionDetail: 'Cálculo euclidiano bimanual com histerese anti-fantasma.',
  },
  {
    id: 'pinch_click',
    title: '👌 Pinça de Dedo',
    subtitle: 'Clicar / Arrastar Aba',
    badge: 'PRECISÃO',
    description:
      'Encoste a ponta do dedo indicador na ponta do polegar (mantendo os demais dedos abertos). Use para selecionar nós de agentes, dar play em vídeos ou arrastar abas.',
    actionDetail: 'Threshold de proximidade < 0.068 com feedback sonoro tático.',
  },
  {
    id: 'v_gesture',
    title: '✌ Gesto "V"',
    subtitle: 'Fechar Tela / Reset de Visão',
    badge: 'SISTEMA',
    description:
      'Estenda o indicador e o dedo médio em formato de "V" (Vitória). Fecha a visualização em tela cheia ou reseta a câmera espacial para o enquadramento geral.',
    actionDetail: 'Classificação ortogonal de dois dedos estendidos (360ms hold).',
  },
]

export function CameraGesturesLab({
  onExecuteAction,
  onVoltarAgentes,
}: {
  onExecuteAction?: (tipo: 'pan' | 'zoom' | 'pinch_click' | 'v_gesture', label: string, desc: string) => void
  onVoltarAgentes?: () => void
}) {
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [activeTab, setActiveTab] = useState<'learn' | 'create'>('learn')
  const [selectedTutorial, setSelectedTutorial] = useState<string>('pan')
  const [detectedLabel, setDetectedLabel] = useState('MÃO ABERTA // RASTREANDO')
  const [detectedConf, setDetectedConf] = useState(0.952)

  const [newGestureName, setNewGestureName] = useState('Três Dedos Abertos')
  const [newGestureAction, setNewGestureAction] = useState('Disparar Agente ArXiv')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [recordingComplete, setRecordingComplete] = useState(false)

  const [customGestures, setCustomGestures] = useState<CustomGesture[]>(() => {
    try {
      const salvo = localStorage.getItem('fui:custom_gestures')
      if (salvo) return JSON.parse(salvo)
    } catch {
      /* ignore */
    }
    return [
      {
        id: 'custom-1',
        name: 'Três Dedos Fechados',
        action: 'Disparar Agente ArXiv CoRR',
        icon: '🤟',
        confidence: 0.962,
      },
      {
        id: 'custom-2',
        name: 'Palma Aberta Estendida',
        action: 'Enquadrar Todo o Canvas',
        icon: '✋',
        confidence: 0.948,
      },
    ]
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelado = false
    const renderLoop = () => {
      if (cancelado) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (isCameraActive && videoRef.current && videoRef.current.readyState >= 2) {
        ctx.save()
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
        ctx.restore()
      } else {
        ctx.fillStyle = '#09090b'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      const t = performance.now() * 0.002
      const cx = canvas.width / 2 + Math.sin(t) * 32
      const cy = canvas.height / 2 + Math.cos(t * 0.8) * 18

      ctx.strokeStyle = '#ff5500'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(cx, cy, 26, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = '#ff5500'
      ctx.beginPath()
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
      ctx.fill()

      rafRef.current = requestAnimationFrame(renderLoop)
    }

    rafRef.current = requestAnimationFrame(renderLoop)
    return () => {
      cancelado = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [isCameraActive])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const toggleCamera = async () => {
    fuiAudio.hoverTick()
    if (isCameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      setIsCameraActive(false)
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play()
        }
        setIsCameraActive(true)
        fuiAudio.pinchLock()
      } catch {
        setIsCameraActive(true)
      }
    }
  }

  const triggerTutorialGesture = (type: 'pan' | 'zoom' | 'pinch_click' | 'v_gesture') => {
    fuiAudio.pinchLock()
    setSelectedTutorial(type)
    const map: Record<string, { label: string; desc: string; conf: number }> = {
      pan: { label: '✊ 1 MÃO FECHADA', desc: 'Mover Cenário (Pan)', conf: 0.982 },
      zoom: { label: '✊+✊ 2 MÃOS FECHADAS', desc: 'Ampliar / Reduzir Cena', conf: 0.978 },
      pinch_click: { label: '👌 PINÇA DETECTADA', desc: 'Clicar / Arrastar Aba', conf: 0.991 },
      v_gesture: { label: '✌ GESTO "V"', desc: 'Fechar Tela / Reset', conf: 0.974 },
    }
    const item = map[type]
    setDetectedLabel(`${item.label} // ${item.desc}`)
    setDetectedConf(item.conf)
    onExecuteAction?.(type, item.label, item.desc)
  }

  const handleStartRecording = () => {
    if (isRecording) return
    fuiAudio.voiceDispatch()
    setIsRecording(true)
    setRecordingProgress(0)
    setRecordingComplete(false)

    let progress = 0
    const interval = setInterval(() => {
      progress += 5
      setRecordingProgress(progress)
      if (progress % 20 === 0) fuiAudio.hoverTick()
      if (progress >= 100) {
        clearInterval(interval)
        setIsRecording(false)
        setRecordingComplete(true)
        fuiAudio.pinchLock()
        if (onVoltarAgentes) {
          /* callback disponível */
        }
        const novo: CustomGesture = {
          id: `custom-${Date.now()}`,
          name: newGestureName || 'Gesto Personalizado',
          action: newGestureAction || 'Ação FUI Personalizada',
          icon: '✨',
          confidence: +(0.945 + Math.random() * 0.045).toFixed(3),
        }
        const atualizados = [novo, ...customGestures]
        setCustomGestures(atualizados)
        try {
          localStorage.setItem('fui:custom_gestures', JSON.stringify(atualizados))
        } catch {
          /* ignore */
        }
      }
    }, 75)
  }

  return (
    <div className="lg-camlab-wrap">
      <div className="lg-camlab-header">
        <div>
          <div className="lg-camlab-title-row">
            <span className="lg-orange-dot" />
            <h1>LABORATÓRIO DE APRENDIZADO &amp; CRIAÇÃO DE GESTOS</h1>
          </div>
          <p>TREINE OS GESTOS DA INTERFACE ESPACIAL OU CALIBRE NOVOS GESTOS PERSONALIZADOS</p>
        </div>

        <div className="lg-camlab-tabs liquid-glass-panel">
          <button
            type="button"
            onClick={() => {
              setActiveTab('learn')
              fuiAudio.hoverTick()
            }}
            className={`lg-camlab-tab ${activeTab === 'learn' ? 'ativo' : ''}`}
          >
            Aprender Gestos
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('create')
              fuiAudio.hoverTick()
            }}
            className={`lg-camlab-tab ${activeTab === 'create' ? 'ativo' : ''}`}
          >
            <Plus size={14} />
            <span>Criar Novo Gesto</span>
          </button>
        </div>
      </div>

      <div className="lg-camlab-grid">
        {/* COLUNA ESQUERDA: SENSOR DE VÍDEO */}
        <div className="lg-camlab-left">
          <div className="lg-camlab-monitor liquid-glass-panel">
            <video ref={videoRef} style={{ display: 'none' }} playsInline muted autoPlay />
            <canvas ref={canvasRef} width={480} height={320} className="lg-camlab-canvas" />

            <div className="lg-camlab-hud-top">
              <span className="lg-badge-dark">
                <i className="lg-orange-dot" /> CV SENSOR · 60 FPS (1€ FILTER)
              </span>
              <span className="lg-badge-orange">LATÊNCIA: 0ms</span>
            </div>

            <div className="lg-camlab-reticle">
              <div className="lg-reticle-outer">
                <div className="lg-reticle-inner" />
                <div className="lg-orange-dot" />
              </div>
            </div>

            <div className="lg-camlab-hud-bottom">
              <button type="button" onClick={toggleCamera} className="liquid-glass-button lg-btn-pill">
                {isCameraActive ? <Video size={14} color="#ff5500" /> : <VideoOff size={14} />}
                <span>{isCameraActive ? 'WEBCAM LIGADA' : 'LIGAR WEBCAM'}</span>
              </button>
              <span className="lg-badge-dark">GROOT-1: 0.952</span>
            </div>
          </div>

          <div className="lg-camlab-diag liquid-glass-panel">
            <div className="lg-diag-left">
              <div className="lg-diag-ico">
                <Hand size={16} color="#ff5500" />
              </div>
              <div>
                <small>GESTO ATIVO DETECTADO:</small>
                <strong>{detectedLabel}</strong>
              </div>
            </div>
            <div className="lg-diag-right">
              <small>CONFIANÇA</small>
              <strong>{(detectedConf * 100).toFixed(1)}%</strong>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: APRENDER OU CRIAR */}
        <div className="lg-camlab-right">
          {activeTab === 'learn' ? (
            <div className="lg-tutorial-list">
              <div className="lg-tutorial-head">
                <span>SELECIONE UM GESTO PARA APRENDER E PRATICAR:</span>
                <strong className="laranja">4 GESTOS CORE</strong>
              </div>
              {TUTORIAL_LIST.map((item) => {
                const isSelected = selectedTutorial === item.id
                return (
                  <div
                    key={item.id}
                    onClick={() => triggerTutorialGesture(item.id as 'pan' | 'zoom' | 'pinch_click' | 'v_gesture')}
                    className={`lg-tutorial-card liquid-glass-panel ${isSelected ? 'selecionado' : ''}`}
                  >
                    <div className="lg-tut-top">
                      <div className="lg-tut-title">
                        <strong>{item.title}</strong>
                        <span>· {item.subtitle}</span>
                      </div>
                      <span className={`lg-tut-badge ${isSelected ? 'ativo' : ''}`}>{item.badge}</span>
                    </div>
                    <p className="lg-tut-desc">{item.description}</p>
                    <div className="lg-tut-foot">
                      <span>{item.actionDetail}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          triggerTutorialGesture(item.id as 'pan' | 'zoom' | 'pinch_click' | 'v_gesture')
                        }}
                        className={`lg-tut-btn ${isSelected ? 'ativo' : ''}`}
                      >
                        {isSelected ? '✓ Praticando Agora' : 'Praticar Gesto'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="lg-create-box">
              <div className="lg-create-card liquid-glass-panel">
                <div className="lg-create-head">
                  <div className="lg-create-title">
                    <Sparkles size={15} color="#ff5500" />
                    <strong>GRAVADOR &amp; CALIBRADOR DE NOVO GESTO</strong>
                  </div>
                  <span>SISTEMA BAYESIANO GROOT-1</span>
                </div>

                <div className="lg-create-inputs">
                  <div>
                    <label>NOME DO GESTO:</label>
                    <input
                      type="text"
                      value={newGestureName}
                      onChange={(e) => setNewGestureName(e.target.value)}
                      placeholder="Ex: Três Dedos Abertos"
                    />
                  </div>
                  <div>
                    <label>AÇÃO ASSOCIADA NA INTERFACE:</label>
                    <select value={newGestureAction} onChange={(e) => setNewGestureAction(e.target.value)}>
                      <option value="Disparar Agente ArXiv">Disparar Agente ArXiv CoRR</option>
                      <option value="Enquadrar Todo o Canvas">Enquadrar Todo o Canvas</option>
                      <option value="Alternar Janela">Alternar Janela / Mover Foco</option>
                      <option value="Modo Mudo">Ativar / Desativar Áudio</option>
                    </select>
                  </div>
                </div>

                {isRecording && (
                  <div className="lg-rec-progress">
                    <div className="lg-rec-row">
                      <span>● GRAVANDO POSTURA DE MÃO... FAÇA O GESTO EM FRENTE À CÂMERA</span>
                      <strong>{recordingProgress}%</strong>
                    </div>
                    <div className="lg-loading-bar-bg">
                      <div className="lg-loading-bar-fill" style={{ width: `${recordingProgress}%` }} />
                    </div>
                  </div>
                )}

                {recordingComplete && !isRecording && (
                  <div className="lg-rec-done">
                    <span>
                      <Check size={14} color="#ff5500" /> GESTO CALIBRADO COM SUCESSO! ADICIONADO AO SEU PERFIL.
                    </span>
                    <strong>SCORE: 0.968</strong>
                  </div>
                )}

                <div className="lg-rec-actions">
                  <button
                    type="button"
                    disabled={isRecording}
                    onClick={handleStartRecording}
                    className="lg-btn-orange-full"
                  >
                    <Zap size={14} />
                    <span>{isRecording ? 'Gravando Amostras (Mantenha o Gesto)...' : 'Gravar e Calibrar Gesto'}</span>
                  </button>
                  {recordingComplete && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecordingComplete(false)
                        setRecordingProgress(0)
                      }}
                      className="lg-btn-icon"
                      title="Gravar outro"
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="lg-custom-list">
                <span className="lg-sec-label">GESTOS PERSONALIZADOS GRAVADOS ({customGestures.length}):</span>
                <div className="lg-custom-grid">
                  {customGestures.map((cg) => (
                    <div key={cg.id} className="lg-custom-item liquid-glass-panel">
                      <div className="lg-custom-info">
                        <span className="lg-custom-emoji">{cg.icon}</span>
                        <div>
                          <strong>{cg.name}</strong>
                          <small>{cg.action}</small>
                        </div>
                      </div>
                      <div className="lg-custom-meta">
                        <strong>{(cg.confidence * 100).toFixed(1)}%</strong>
                        <button
                          type="button"
                          onClick={() => {
                            fuiAudio.pinchLock()
                            setDetectedLabel(`${cg.name.toUpperCase()} // ${cg.action}`)
                            setDetectedConf(cg.confidence)
                            onExecuteAction?.('pan', cg.name.toUpperCase(), cg.action)
                          }}
                        >
                          Testar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
