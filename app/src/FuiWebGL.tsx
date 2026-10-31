import { ChevronLeft, ChevronRight } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { fuiAudio } from './FuiAudio'

export type EstadoBiometrico = {
  handRight: { x: number; y: number; screenX: number; screenY: number; pinching: boolean; active: boolean; dist: number }
  handLeft: { x: number; y: number; screenX: number; screenY: number; pinching: boolean; active: boolean; dist: number }
  head: { yaw: number; pitch: number; roll: number; active: boolean }
  twoHandZoomDist: number | null
  audioEnergy?: number
}

export const biometriaGlobal: EstadoBiometrico = {
  handRight: { x: 0, y: 0, screenX: -999, screenY: -999, pinching: false, active: false, dist: 1 },
  handLeft: { x: 0, y: 0, screenX: -999, screenY: -999, pinching: false, active: false, dist: 1 },
  head: { yaw: 0, pitch: 0, roll: 0, active: false },
  twoHandZoomDist: null,
  audioEnergy: 0.35,
}

export const VIDEO_PLEXUS_BG =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260514_135830_bb6491d1-9b66-4aec-9722-13b4dfe3fb46.mp4'

export const FuiWebGL = memo(function FuiWebGL({
  modoHero = false,
  zenMode = false,
}: {
  grootProb?: number
  agenteAtivo?: boolean
  modoHero?: boolean
  zenMode?: boolean
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [freqZ, setFreqZ] = useState(59.98)
  const [pulseXY, setPulseXY] = useState(69.83)

  useEffect(() => {
    const interval = setInterval(() => {
      setFreqZ(+(59.5 + Math.random() * 0.9).toFixed(2))
      setPulseXY(+(69.2 + Math.random() * 1.1).toFixed(2))
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  const circ = 2 * Math.PI * 26

  return (
    <>
      <div className="fui-webgl-camada" aria-hidden>
        {/* Vídeo 3D Plexus Incandescente (Decodificação nativa de mídia = 0% carga de Shader 3D!) */}
        <video
          autoPlay
          muted
          loop
          playsInline
          src={VIDEO_PLEXUS_BG}
          className="lg-bg-video"
          style={{ opacity: modoHero ? 1.0 : 0.68 }}
        />

        {/* Anéis de Radar Monocromáticos Sutis no Fundo */}
        {!modoHero && (
          <div className="lg-radar-rings">
            <div className="lg-radar-r1" />
            <div className="lg-radar-r2" />
            <div className="lg-radar-r3" />
          </div>
        )}
      </div>

      {/* Painel Direito Colapsável de Telemetria (Frequência [Z] & Pulso [XY] em Laranja Fluorescente #ff5500) */}
      {!modoHero && !zenMode && (
        <div className={`lg-right-telemetry ${isCollapsed ? 'recolhido' : ''}`}>
          <button
            type="button"
            onClick={() => {
              setIsCollapsed(!isCollapsed)
              fuiAudio.hoverTick()
            }}
            className="lg-telemetry-toggle"
            title={isCollapsed ? 'Expandir Telemetria' : 'Ocultar Telemetria'}
          >
            {isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className="lg-telemetry-card liquid-glass-panel">
            <div className="lg-gauges-row">
              {/* Gauge 1: Frequência [Z] */}
              <div className="lg-gauge-box">
                <span className="lg-gauge-label">
                  Frequência [ Z ]
                  <small>ESPACIAL // CANAL 39</small>
                </span>
                <div className="lg-gauge-svg-wrap">
                  <svg viewBox="0 0 64 64" className="lg-gauge-svg">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#222226" strokeWidth="4" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="#ff5500"
                      strokeWidth="4"
                      strokeDasharray={circ}
                      strokeDashoffset={circ * (1 - freqZ / 100)}
                    />
                  </svg>
                  <strong className="lg-gauge-val">{freqZ}</strong>
                </div>
              </div>

              {/* Gauge 2: Pulso [XY] */}
              <div className="lg-gauge-box">
                <span className="lg-gauge-label">
                  Pulso [ XY ]
                  <small>ESPACIAL // CANAL 74</small>
                </span>
                <div className="lg-gauge-svg-wrap">
                  <svg viewBox="0 0 64 64" className="lg-gauge-svg">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#222226" strokeWidth="4" />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="#ff5500"
                      strokeWidth="4"
                      strokeDasharray={circ}
                      strokeDashoffset={circ * (1 - pulseXY / 100)}
                    />
                  </svg>
                  <strong className="lg-gauge-val">{pulseXY}</strong>
                </div>
              </div>
            </div>

            <div className="lg-protocol-box">
              <div className="laranja-bold">SIS [ATIVO] // PROTOCOLO ALFA-000.101.112</div>
              <div>ALVO ADQUIRIDO // N 38°53&apos;42&quot; O 77°02&apos;11&quot;</div>
              <div className="cinza">LOC SECUNDÁRIA: 1909834763560 // VEÍCULO-Q v2.0004</div>
              <div>SAÍDA ESPACIAL // FREQUÊNCIA [Z] BLOQUEADA</div>
              <div className="branco-bold">SISTEMA-1 GROOT // MATRIZ BAYESIANA OK</div>
              <div className="laranja">ARXIV.ORG // TELEMETRIA NEURAL SINCRONIZADA</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
})
