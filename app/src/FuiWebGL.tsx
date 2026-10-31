import { memo } from 'react'

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
  audioEnergy: 0.0,
}

/**
 * Background Tático "COMMAND THE STACK" (Inspirado em https://airforceaircade.com/ - U.S. Air Force)
 * Renderizado em SVG Vetorial Puro com ZERO loops de WebGL/Canvas (0% GPU/CPU em repouso para não pesar o PC!).
 * Exibe as 3 camadas aeroespaciais isométricas:
 *   1. TOP STACK (E-3 AWACS / Vigilância Orbital & Topografia)
 *   2. MIDDLE STACK (Multi-Role Air-to-Air & Air-to-Ground: TOI + AIRCRAFT)
 *   3. BOTTOM STACK (Base Terrestre / CV-22 / Bússola Azimutal 270°–330°)
 */
export const FuiWebGL = memo(function FuiWebGL(_props: { grootProb?: number; agenteAtivo?: boolean }) {
  return (
    <div className="fui-webgl-camada airforce-stack-bg" aria-hidden>
      {/* CABEÇALHO SUPERIOR CENTRAL: COMMAND THE STACK */}
      <div className="af-command-header">
        <span className="af-sub">U.S. AIR FORCE // C4ISR SPATIAL ARCHITECTURE</span>
        <strong className="af-title">COMMAND THE STACK</strong>
      </div>

      {/* DIAGRAMA ISOMÉTRICO DE 3 CAMADAS (TOP / MIDDLE / BOTTOM STACK) - ZERO GPU LOAD */}
      <svg className="af-stack-svg" viewBox="0 0 1400 920" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="afDiscGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0c2838" stopOpacity="0.65" />
            <stop offset="72%" stopColor="#091d2b" stopOpacity="0.82" />
            <stop offset="95%" stopColor="#00d8ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
          </radialGradient>
          <radialGradient id="afTerrainGlow" cx="50%" cy="48%" r="52%">
            <stop offset="0%" stopColor="#2a3942" stopOpacity="0.78" />
            <stop offset="65%" stopColor="#12202b" stopOpacity="0.88" />
            <stop offset="94%" stopColor="#00d2ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#041019" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="afCyanRim" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00e1ff" stopOpacity="0.25" />
            <stop offset="25%" stopColor="#70f3ff" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#00c8ff" stopOpacity="0.55" />
            <stop offset="75%" stopColor="#70f3ff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#00e1ff" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* =====================================================================
            3. BOTTOM STACK (CAMADA INFERIOR: TERRENO + CV-22 + BÚSSOLA 270°-330°)
           ===================================================================== */}
        <g transform="translate(560, 745)">
          {/* Base cilíndrica escura e anel azimutal */}
          <ellipse cx="0" cy="36" rx="370" ry="102" fill="#050b11" stroke="rgba(0, 210, 255, 0.35)" strokeWidth="1.5" />
          <ellipse cx="0" cy="14" rx="362" ry="96" fill="url(#afTerrainGlow)" stroke="url(#afCyanRim)" strokeWidth="2.5" />

          {/* Malha de relevo terrestre estilizada (Zero-GPU vector paths) */}
          <path
            d="M-310,10 Q-210,-35 -120,-18 T40,-38 T190,-12 T310,12 Q200,58 0,68 Q-200,58 -310,10 Z"
            fill="rgba(26, 44, 56, 0.55)"
            stroke="rgba(120, 195, 220, 0.28)"
            strokeWidth="1"
          />
          <path
            d="M-240,4 Q-140,-28 -40,-10 T110,-26 T240,6"
            fill="none"
            stroke="rgba(0, 225, 255, 0.25)"
            strokeWidth="1"
            strokeDasharray="6 4"
          />

          {/* Anel superior do Bottom Stack */}
          <ellipse cx="0" cy="-22" rx="348" ry="86" fill="none" stroke="url(#afCyanRim)" strokeWidth="3" />
          <ellipse cx="0" cy="-22" rx="332" ry="80" fill="none" stroke="rgba(0, 225, 255, 0.32)" strokeWidth="1" strokeDasharray="18 10" />

          {/* Hash marks táticos no aro */}
          <ellipse cx="0" cy="-16" rx="340" ry="83" fill="none" stroke="rgba(0, 225, 255, 0.55)" strokeWidth="6" strokeDasharray="12 16" />

          {/* Rótulo central do aro */}
          <text x="0" y="-32" fill="#8ceeff" fontSize="13" fontWeight="700" letterSpacing="3" textAnchor="middle" opacity="0.88">
            BOTTOM STACK
          </text>

          {/* Marcações de Bússola Azimutal (270 .. 280 .. 290 .. 300 .. 310 .. 320 .. 330) */}
          {[
            { ang: '270', x: -245, y: 66 },
            { ang: '280', x: -168, y: 80 },
            { ang: '290', x: -86, y: 89 },
            { ang: '300', x: 0, y: 92 },
            { ang: '310', x: 86, y: 89 },
            { ang: '320', x: 168, y: 80 },
            { ang: '330', x: 245, y: 66 },
          ].map((b) => (
            <g key={b.ang} transform={`translate(${b.x}, ${b.y})`}>
              <line x1="0" y1="-10" x2="0" y2="-2" stroke="#7ce8ff" strokeWidth="1.5" />
              <text x="0" y="10" fill="#a8ecff" fontSize="10" fontFamily="monospace" textAnchor="middle">
                {b.ang}
              </text>
            </g>
          ))}

          {/* Ícone CV-22 à esquerda no Bottom Stack */}
          <g transform="translate(-215, -36)">
            <line x1="0" y1="0" x2="0" y2="54" stroke="#00e1ff" strokeWidth="2" />
            <polygon points="0,-18 -14,6 0,0 14,6" fill="rgba(0, 225, 255, 0.25)" stroke="#00e1ff" strokeWidth="1.8" />
            <text x="0" y="18" fill="#8ceeff" fontSize="10" fontFamily="monospace" textAnchor="middle">
              CV-22
            </text>
          </g>
        </g>

        {/* =====================================================================
            2. MIDDLE STACK (CAMADA INTERMEDIÁRIA: MULTI-ROLE / TOI / AIRCRAFT)
           ===================================================================== */}
        <g transform="translate(560, 470)">
          <ellipse cx="0" cy="0" rx="348" ry="88" fill="url(#afDiscGlow)" stroke="url(#afCyanRim)" strokeWidth="3" />
          <ellipse cx="0" cy="6" rx="334" ry="82" fill="none" stroke="rgba(0, 225, 255, 0.5)" strokeWidth="6" strokeDasharray="14 14" />
          <ellipse cx="0" cy="0" rx="295" ry="72" fill="none" stroke="rgba(0, 225, 255, 0.22)" strokeWidth="1" />

          <text x="0" y="54" fill="#8ceeff" fontSize="13" fontWeight="700" letterSpacing="3" textAnchor="middle" opacity="0.88">
            MIDDLE STACK
          </text>

          {/* Alvo Esquerdo: TOI (Diamante Amarelo + Feixe Vertical até o Bottom Stack) */}
          <g transform="translate(-145, 8)">
            <line x1="0" y1="12" x2="0" y2="265" stroke="#ffd000" strokeWidth="2" opacity="0.9" />
            <polygon points="0,-16 13,0 0,16 -13,0" fill="rgba(255, 208, 0, 0.18)" stroke="#ffd000" strokeWidth="2" />
            <text x="0" y="30" fill="#ffd000" fontSize="10" fontFamily="monospace" textAnchor="middle">
              TOI
            </text>
          </g>

          {/* Alvo Central-Esquerdo: AIRCRAFT (Delta Coral/Vermelho + Feixe Vertical até o Bottom Stack) */}
          <g transform="translate(-85, 16)">
            <line x1="0" y1="12" x2="0" y2="255" stroke="#ff5e3a" strokeWidth="2" opacity="0.9" />
            <polygon points="0,-16 -14,10 0,3 14,10" fill="rgba(255, 94, 58, 0.22)" stroke="#ff5e3a" strokeWidth="2" />
            <text x="0" y="26" fill="#ff7b5c" fontSize="10" fontFamily="monospace" textAnchor="middle">
              AIRCRAFT
            </text>
          </g>

          {/* Alvo Direito: TOI (Diamante Amarelo + Feixe Vertical até o Bottom Stack) */}
          <g transform="translate(65, 6)">
            <line x1="0" y1="12" x2="0" y2="268" stroke="#ffd000" strokeWidth="2" opacity="0.9" />
            <polygon points="0,-16 13,0 0,16 -13,0" fill="rgba(255, 208, 0, 0.18)" stroke="#ffd000" strokeWidth="2" />
            <text x="0" y="30" fill="#ffd000" fontSize="10" fontFamily="monospace" textAnchor="middle">
              TOI
            </text>
          </g>
        </g>

        {/* =====================================================================
            1. TOP STACK (CAMADA SUPERIOR: ALTA ALTITUDE / E-3 AWACS / TOPOGRAFIA)
           ===================================================================== */}
        <g transform="translate(560, 195)">
          <ellipse cx="0" cy="0" rx="355" ry="108" fill="url(#afDiscGlow)" stroke="url(#afCyanRim)" strokeWidth="3.2" />
          <ellipse cx="0" cy="5" rx="340" ry="102" fill="none" stroke="rgba(0, 225, 255, 0.45)" strokeWidth="5" strokeDasharray="16 18" />

          {/* Isolinhas Topográficas Internas do Top Stack (Leves e Puramente Vetoriais) */}
          <path
            d="M-250,-20 C-180,-75 40,-85 180,-45 C270,-15 260,45 150,72 C20,92 -170,75 -250,25 Z"
            fill="none"
            stroke="rgba(130, 220, 255, 0.22)"
            strokeWidth="1.1"
          />
          <path
            d="M-170,-10 C-110,-52 30,-58 125,-28 C190,-5 170,35 95,52 C10,65 -120,52 -170,15 Z"
            fill="none"
            stroke="rgba(130, 220, 255, 0.28)"
            strokeWidth="1"
          />
          <line x1="-240" y1="-55" x2="240" y2="55" stroke="rgba(0, 225, 255, 0.18)" strokeWidth="1" />
          <line x1="-220" y1="60" x2="220" y2="-60" stroke="rgba(0, 225, 255, 0.18)" strokeWidth="1" />

          <text x="0" y="92" fill="#8ceeff" fontSize="13" fontWeight="700" letterSpacing="3" textAnchor="middle" opacity="0.92">
            TOP STACK
          </text>

          {/* E-3 AWACS no Top Stack projetando feixe azul-ciano até o solo (Bottom Stack) */}
          <g transform="translate(-45, -18)">
            <line x1="0" y1="12" x2="0" y2="572" stroke="#00c8ff" strokeWidth="2.4" opacity="0.95" />
            <ellipse cx="0" cy="2" rx="52" ry="18" fill="none" stroke="rgba(0, 200, 255, 0.45)" strokeWidth="1.2" />
            <ellipse cx="0" cy="2" rx="28" ry="10" fill="none" stroke="rgba(0, 200, 255, 0.65)" strokeWidth="1.2" />
            <polygon points="0,-16 -13,8 0,2 13,8" fill="rgba(0, 200, 255, 0.35)" stroke="#00e1ff" strokeWidth="2" />
            <text x="0" y="16" fill="#7ce8ff" fontSize="10" fontFamily="monospace" textAnchor="middle">
              E-3
            </text>
          </g>
        </g>

        {/* =====================================================================
            PAINÉIS TÁTICOS DIREITOS ("TOP STACK", "MIDDLE STACK", "BOTTOM STACK")
            Estilo AirForceAircade.com + Linhas Conectoras
           ===================================================================== */}
        {/* Conector & Card TOP STACK */}
        <g transform="translate(970, 115)">
          <line x1="-60" y1="65" x2="0" y2="65" stroke="rgba(0, 225, 255, 0.45)" strokeWidth="1.2" />
          <polygon
            points="0,0 365,0 380,15 380,125 15,125 0,110"
            fill="rgba(10, 18, 26, 0.76)"
            stroke="rgba(120, 210, 235, 0.45)"
            strokeWidth="1.2"
          />
          <text x="24" y="32" fill="#ffffff" fontSize="13" fontWeight="700" letterSpacing="3" fontFamily="monospace">
            TOP STACK // HIGH VANTAGE
          </text>
          <text x="24" y="58" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            A higher vantage point enables Airmen &amp; AI Agents
          </text>
          <text x="24" y="76" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            in this stack to provide vital intelligence (ArXiv
          </text>
          <text x="24" y="94" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            CoRR &amp; C4ISR) to lower execution stacks.
          </text>
        </g>

        {/* Conector & Card MIDDLE STACK */}
        <g transform="translate(970, 395)">
          <line x1="-60" y1="65" x2="0" y2="65" stroke="rgba(0, 225, 255, 0.45)" strokeWidth="1.2" />
          <polygon
            points="0,0 365,0 380,15 380,125 15,125 0,110"
            fill="rgba(10, 18, 26, 0.76)"
            stroke="rgba(120, 210, 235, 0.45)"
            strokeWidth="1.2"
          />
          <text x="24" y="32" fill="#ffffff" fontSize="13" fontWeight="700" letterSpacing="3" fontFamily="monospace">
            MIDDLE STACK // MULTI-ROLE
          </text>
          <text x="24" y="58" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            Middle ground means multi-role orchestration.
          </text>
          <text x="24" y="76" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            AirLLM Layer-Wise Agents + Groot-1 Calibration
          </text>
          <text x="24" y="94" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            fused for zero-lag tactical decision-making.
          </text>
        </g>

        {/* Conector & Card BOTTOM STACK */}
        <g transform="translate(970, 675)">
          <line x1="-60" y1="65" x2="0" y2="65" stroke="rgba(0, 225, 255, 0.45)" strokeWidth="1.2" />
          <polygon
            points="0,0 365,0 380,15 380,125 15,125 0,110"
            fill="rgba(10, 18, 26, 0.76)"
            stroke="rgba(120, 210, 235, 0.45)"
            strokeWidth="1.2"
          />
          <text x="24" y="32" fill="#ffffff" fontSize="13" fontWeight="700" letterSpacing="3" fontFamily="monospace">
            BOTTOM STACK // EXECUTION
          </text>
          <text x="24" y="58" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            Responsible for ground-truth extraction: Diagram
          </text>
          <text x="24" y="76" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            Design synthesis, PDF figure CV &amp; local CPU
          </text>
          <text x="24" y="94" fill="#b0cad8" fontSize="11.5" fontFamily="monospace">
            execution with 0% background GPU overhead.
          </text>
        </g>
      </svg>
    </div>
  )
})
