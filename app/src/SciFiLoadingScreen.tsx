import { Cpu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fuiAudio } from './FuiAudio'

interface SciFiLoadingScreenProps {
  onComplete: () => void
}

const STAGES = [
  'INICIALIZANDO KERNEL ESPACIAL COGNITIVO...',
  'CONECTANDO AO MOTOR LOCAL // http://localhost:8730 ...',
  'CALIBRANDO MATRIZ BAYESIANA GROOT-1 [ 0.952 ]...',
  'SINCRONIZANDO NÓS DE PESQUISA ARXIV E VÍDEO RECON...',
  'ATIVANDO PIPELINE TÁTICO AIRLLM COM ZERO OVERHEAD DE GPU...',
  'ARQUITETURA ESPACIAL PRONTA // TODOS OS SISTEMAS EM OPERAÇÃO',
]

export function SciFiLoadingScreen({ onComplete }: SciFiLoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    fuiAudio.voiceDispatch()
    const startTime = Date.now()
    const duration = 1800 // 1.8s transição cinematográfica rápida

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100))
      setProgress(pct)

      const stage = Math.min(STAGES.length - 1, Math.floor((pct / 100) * STAGES.length))
      setStageIndex(stage)

      if (pct % 20 === 0) {
        fuiAudio.hoverTick()
      }

      if (pct >= 100) {
        clearInterval(interval)
        fuiAudio.pinchLock()
        setTimeout(() => {
          onComplete()
        }, 220)
      }
    }, 35)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <div className="lg-loading-overlay">
      <div className="lg-loading-grid" />
      <div className="lg-loading-rings">
        <div className="lg-ring-1" />
        <div className="lg-ring-2" />
        <div className="lg-ring-3" />
      </div>

      <div className="lg-loading-card liquid-glass-panel">
        <div className="lg-loading-icon">
          <Cpu size={28} color="#ff5500" />
        </div>

        <div className="lg-loading-kicker">
          <span className="lg-orange-dot" />
          <span>FUI C4ISR // DESCOBERTA DE FLUXOS EM PRODUÇÃO</span>
        </div>

        <h1 className="lg-loading-title">CARREGANDO AMBIENTE ESPACIAL</h1>

        <div className="lg-loading-pct">{progress.toString().padStart(3, '0')}%</div>

        <div className="lg-loading-bar-bg">
          <div className="lg-loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="lg-loading-stage">
          <span className="lg-orange-chevron">›</span>
          <span>{STAGES[stageIndex]}</span>
        </div>

        <div className="lg-loading-meta">
          <div>
            <small>MOTOR:</small>
            <strong>NÚCLEO AIRLLM</strong>
          </div>
          <div>
            <small>HOST LOCAL:</small>
            <strong className="laranja">PORTA 8730 OK</strong>
          </div>
          <div>
            <small>GROOT-1:</small>
            <strong>CALIBRADO 0.952</strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            fuiAudio.pinchLock()
            onComplete()
          }}
          className="lg-loading-skip"
        >
          [ PULAR ANIMAÇÃO ]
        </button>
      </div>
    </div>
  )
}
