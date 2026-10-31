import { memo, useEffect, useRef } from 'react'

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

const VERTEX_SHADER = `
  attribute float aIndex;
  uniform float uTime;
  uniform float uCount;
  uniform vec2 uResolution;
  uniform vec2 uHandR;
  uniform vec2 uHandL;
  uniform float uPinchR;
  uniform float uPinchL;
  uniform vec2 uHead;
  uniform float uGrootProb;
  uniform float uAgenteAtivo;

  varying vec3 vColor;
  varying float vAlpha;

  float hash(float n) {
    return fract(sin(n * 12.9898) * 43758.5453123);
  }

  void main() {
    float norm = aIndex / uCount;
    float ringGroup = floor( mod(aIndex, 7.0) );
    float baseRadius = 0.12 + (ringGroup / 7.0) * 0.76 + (hash(aIndex) - 0.5) * 0.08;
    float speed = (0.07 + (1.0 - baseRadius) * 0.20) * (mod(ringGroup, 2.0) == 0.0 ? 1.0 : -0.75);
    if (uAgenteAtivo > 0.5) speed *= 2.1;

    float angle = norm * 6.2831853 * 64.0 + uTime * speed;
    float aspect = uResolution.x / max(1.0, uResolution.y);

    float topoWave = sin(angle * 5.0 + uTime * 0.4) * 0.032 + cos(angle * 3.0 - uTime * 0.3) * 0.024;
    vec2 pos = vec2(cos(angle), sin(angle)) * (baseRadius + topoWave);
    pos.x /= max(1.0, aspect * 0.68);

    float curlX = sin(uTime * 0.45 + pos.y * 6.0 + hash(aIndex * 1.3) * 6.28) * 0.024;
    float curlY = cos(uTime * 0.38 + pos.x * 6.0 + hash(aIndex * 2.1) * 6.28) * 0.024;
    pos += vec2(curlX, curlY);

    pos += uHead * (0.04 + baseRadius * 0.06);

    float highlight = 0.0;
    vec2 deltaR = uHandR - pos;
    float distR = length(deltaR);
    if (distR < 0.42) {
      float pull = (1.0 - distR / 0.42);
      float strength = uPinchR > 0.5 ? 0.24 : 0.065;
      pos += normalize(deltaR + vec2(0.0001)) * pull * strength;
      highlight = max(highlight, pull * (0.6 + uPinchR * 0.6));
    }

    vec2 deltaL = uHandL - pos;
    float distL = length(deltaL);
    if (distL < 0.42) {
      float pullL = (1.0 - distL / 0.42);
      float strengthL = uPinchL > 0.5 ? 0.24 : 0.065;
      pos += normalize(deltaL + vec2(0.0001)) * pullL * strengthL;
      highlight = max(highlight, pullL * (0.6 + uPinchL * 0.6));
    }

    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = (hash(aIndex * 3.7) * 2.5 + 1.0) + highlight * 2.8;

    vec3 cyanCore = vec3(0.0, 0.92, 1.0);
    vec3 tacticalBlue = vec3(0.04, 0.44, 0.92);
    vec3 amberTarget = vec3(1.0, 0.62, 0.08);

    vec3 baseCol = mix(tacticalBlue, cyanCore, clamp(uGrootProb, 0.0, 1.0));
    if (mod(aIndex, 19.0) < 1.0) {
      baseCol = mix(baseCol, amberTarget, 0.78);
    }
    if (uPinchR > 0.5 || uPinchL > 0.5) {
      baseCol = mix(baseCol, amberTarget, highlight * 0.9);
    } else if (uAgenteAtivo > 0.5) {
      baseCol = mix(baseCol, vec3(0.2, 1.0, 0.65), sin(uTime * 6.0 + norm * 20.0) * 0.5 + 0.5);
    }

    vColor = baseCol + vec3(highlight * 0.45);
    vAlpha = (0.15 + (1.0 - baseRadius) * 0.32) + highlight * 0.45;
  }
`

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float r = length(c);
    if (r > 0.5) discard;
    float glow = pow(1.0 - r * 2.0, 1.6);
    gl_FragColor = vec4(vColor * glow, vAlpha * glow);
  }
`

function compilarShader(gl: WebGLRenderingContext, tipo: number, fonte: string): WebGLShader | null {
  const s = gl.createShader(tipo)
  if (!s) return null
  gl.shaderSource(s, fonte)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s)
    return null
  }
  return s
}

const LINHAS_DATA_STREAM = [
  'SYS [ON] // PROTOCOL ALPHA-000.101.112',
  'TARGET ACQUIRED // N 38°53\'42" W 77°02\'11"',
  'SEC LOC: 1909834763560 // Q-VEHICLE v2.0004',
  'SPATIAL OUTPUT // FREQUENCY [Z] LOCKED',
  'GROOT-1 SYSTEM-ONE // BAYESIAN MATRIX OK',
  'ARXIV.ORG // NEURAL TELEMETRY SYNCED',
  'YOUTUBE STREAM // AUDIO CHANNEL READY',
  'C4ISR RADAR // TOPOGRAPHIC ISOLINES ON',
]

export const FuiWebGL = memo(function FuiWebGL({ grootProb = 0.879, agenteAtivo = false }: { grootProb?: number; agenteAtivo?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ grootProb, agenteAtivo })
  propsRef.current = { grootProb, agenteAtivo }

  // Motor WebGL Leve (6.000 partículas com Throttling Eco-Tático para não pesar o PC!)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = (canvas.getContext('webgl2', { antialias: false, alpha: true, powerPreference: 'low-power' }) ||
                canvas.getContext('webgl', { antialias: false, alpha: true })) as WebGLRenderingContext | null
    if (!gl) return

    const vs = compilarShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compilarShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    const PARTICLE_COUNT = 6000
    const indices = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) indices[i] = i

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    const aIndex = gl.getAttribLocation(prog, 'aIndex')
    gl.enableVertexAttribArray(aIndex)
    gl.vertexAttribPointer(aIndex, 1, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uCount = gl.getUniformLocation(prog, 'uCount')
    const uResolution = gl.getUniformLocation(prog, 'uResolution')
    const uHandR = gl.getUniformLocation(prog, 'uHandR')
    const uHandL = gl.getUniformLocation(prog, 'uHandL')
    const uPinchR = gl.getUniformLocation(prog, 'uPinchR')
    const uPinchL = gl.getUniformLocation(prog, 'uPinchL')
    const uHead = gl.getUniformLocation(prog, 'uHead')
    const uGrootProb = gl.getUniformLocation(prog, 'uGrootProb')
    const uAgenteAtivo = gl.getUniformLocation(prog, 'uAgenteAtivo')

    gl.uniform1f(uCount, PARTICLE_COUNT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)

    const redimensionar = () => {
      canvas.width = Math.floor(window.innerWidth)
      canvas.height = Math.floor(window.innerHeight)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    redimensionar()
    window.addEventListener('resize', redimensionar)

    let raf = 0
    let lastDraw = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const hr = biometriaGlobal.handRight
      const hl = biometriaGlobal.handLeft
      const hd = biometriaGlobal.head
      // Economia inteligente de GPU: 30fps com mão ativa, 12fps em repouso (não pesa nada!)
      const intervalo = hr.active || hl.active || propsRef.current.agenteAtivo ? 32 : 80
      if (now - lastDraw < intervalo) return
      lastDraw = now

      const t = (now - t0) * 0.001
      gl.clearColor(0.0, 0.0, 0.0, 0.0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform1f(uTime, t)
      gl.uniform2f(uResolution, canvas.width, canvas.height)

      gl.uniform2f(uHandR, hr.active ? hr.x : 99.0, hr.active ? hr.y : 99.0)
      gl.uniform2f(uHandL, hl.active ? hl.x : 99.0, hl.active ? hl.y : 99.0)
      gl.uniform1f(uPinchR, hr.active && hr.pinching ? 1.0 : 0.0)
      gl.uniform1f(uPinchL, hl.active && hl.pinching ? 1.0 : 0.0)
      gl.uniform2f(uHead, hd.active ? hd.yaw : 0.0, hd.active ? hd.pitch : 0.0)
      gl.uniform1f(uGrootProb, propsRef.current.grootProb)
      gl.uniform1f(uAgenteAtivo, propsRef.current.agenteAtivo ? 1.0 : 0.0)

      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', redimensionar)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [])

  return (
    <div className="fui-webgl-camada" aria-hidden>
      <canvas ref={canvasRef} className="fui-webgl-canvas" />

      {/* RADAR TOPOGRÁFICO & ORBITAL ORIGINAL (Transparente, mantendo todos os cartões 100% visíveis!) */}
      <svg className="fui-radar-svg" viewBox="0 0 1000 1000">
        <g transform="translate(500, 500)">
          <circle r="445" className="fui-anel lento" strokeDasharray="2 8" />
          <circle r="420" className="fui-anel" strokeDasharray="4 18" opacity="0.45" />
          <circle r="340" className="fui-anel reverso" strokeDasharray="80 40 12 40" />
          <circle r="290" className="fui-anel-ambar" strokeDasharray="180 60 30 60" />
          <circle r="220" className="fui-anel rapido" strokeDasharray="2 10" />
          <circle r="135" className="fui-anel pulso" strokeDasharray="120 180" />

          <path
            className="fui-isolinha"
            d="M-260,-80 C-180,-240 40,-290 190,-180 C310,-90 290,110 170,220 C40,310 -190,260 -270,110 Z"
          />
          <path
            className="fui-isolinha interna"
            d="M-190,-50 C-120,-180 50,-210 140,-120 C220,-40 200,90 110,160 C20,220 -140,180 -195,70 Z"
          />
          <path
            className="fui-isolinha nucleo"
            d="M-110,-20 C-60,-110 40,-120 95,-60 C140,0 120,65 60,105 C0,135 -85,105 -115,35 Z"
          />

          <line x1="-280" y1="190" x2="210" y2="-240" className="fui-vetor-ambar" />
          <line x1="-180" y1="-220" x2="260" y2="160" className="fui-vetor-ciano" />

          <g transform="translate(-145, -95)" className="fui-alvo-orbital">
            <circle r="18" className="fui-alvo-ext" />
            <circle r="4" className="fui-alvo-ponto" />
          </g>
          <g transform="translate(165, 115)" className="fui-alvo-orbital">
            <circle r="22" className="fui-alvo-ext" />
            <circle r="4.5" className="fui-alvo-ponto" />
          </g>
          <g transform="translate(45, -195)" className="fui-alvo-orbital">
            <circle r="14" className="fui-alvo-ext" />
            <circle r="3.5" className="fui-alvo-ponto" />
          </g>

          <line x1="-460" y1="0" x2="-360" y2="0" className="fui-mira" />
          <line x1="360" y1="0" x2="460" y2="0" className="fui-mira" />
          <line x1="0" y1="-460" x2="0" y2="-360" className="fui-mira" />
          <line x1="0" y1="360" x2="0" y2="460" className="fui-mira" />
        </g>
      </svg>

      {/* PAINEL DE TELEMETRIA DIREITO ORIGINAL: MEDIDORES CIRCULARES "Frequency [Z]" & "Pulse [XY]" + DATA STREAM */}
      <div className="fui-telemetria-direita">
        <div className="fui-gauges-duplos">
          <div className="fui-gauge-card">
            <div className="fui-gauge-header">Frequency [ Z ]</div>
            <div className="fui-gauge-sub">SPATIAL OUTPUT // SET 39</div>
            <div className="fui-gauge-anel ambar">
              <span className="fui-gauge-num">59.98</span>
            </div>
          </div>
          <div className="fui-gauge-card">
            <div className="fui-gauge-header">Pulse [ XY ]</div>
            <div className="fui-gauge-sub">SPATIAL OUTPUT // SET 74</div>
            <div className="fui-gauge-anel ciano">
              <span className="fui-gauge-num">69.83</span>
            </div>
          </div>
        </div>
        <div className="fui-datastream-box">
          <div className="fui-datastream-track">
            {LINHAS_DATA_STREAM.map((linha, idx) => (
              <div key={idx} className="fui-datastream-item">{linha}</div>
            ))}
          </div>
        </div>
      </div>

      {/* NOTA: Barra inferior "Fluctuation [X] // AUDIO & HARMONIC WAVEFORM" removida conforme solicitado! */}
      <div className="fui-scanlines" />
    </div>
  )
})
