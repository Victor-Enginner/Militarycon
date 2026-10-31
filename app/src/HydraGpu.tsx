import { memo, useEffect, useRef } from 'react'
import { biometriaGlobal } from './FuiWebGL'

/**
 * MOTOR HYDRA // FBO PING-PONG EM WEBGL2
 * -----------------------------------------------------------------------------
 * Tradução direta da arquitetura da engine Hydra (Active Theory) para WebGL2 puro,
 * sem dependências: a posição de cada partícula vive como RGBA32F dentro de uma
 * textura de dados (Framebuffer Object) e o loop é um fragment shader que lê a
 * textura A e escreve a textura B (ping-pong). A CPU nunca toca nas posições.
 *
 *  - Simulação: força elástica para a posição de origem (Point Cloud da cidade) +
 *    Curl Noise (campo rotacional, sem divergência, imita fluido) + repulsão da mão.
 *  - Renderização: gl.POINTS com esfera impostora calculada no fragment shader
 *    (normal derivada de gl_PointCoord), difusa + especular + fresnel.
 *  - Adaptive GPU tiering: mede o custo por frame e reduz/aumenta a textura de
 *    dados (96² → 384² partículas) para manter o frame rate em PCs modestos.
 */

export type StatusHydra = 'iniciando' | 'ok' | 'sem-webgl2' | 'sem-float' | 'erro'

const VERT_QUAD = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAG_SIM = `#version 300 es
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uHome;
uniform float uTempo;
uniform vec3 uPonteiro;
uniform float uRepulsao;

in vec2 vUv;
out vec4 saida;

// Potencial vetorial barato: o rotacional dele (curl) é um campo de fluido.
vec3 potencial(vec3 p) {
  return vec3(
    sin(p.y * 1.7 + uTempo * 0.50) + sin(p.z * 2.3 - uTempo * 0.35),
    cos(p.z * 1.9 + uTempo * 0.42) + sin(p.x * 2.1 + uTempo * 0.22),
    sin(p.x * 1.5 - uTempo * 0.60) + cos(p.y * 2.5 + uTempo * 0.31)
  );
}

// Rotacional por diferenças finitas centrais: div(curl) = 0 por construção.
vec3 rotacional(vec3 p) {
  const float e = 0.06;
  vec3 pxp = potencial(p + vec3(e, 0.0, 0.0));
  vec3 pxm = potencial(p - vec3(e, 0.0, 0.0));
  vec3 pyp = potencial(p + vec3(0.0, e, 0.0));
  vec3 pym = potencial(p - vec3(0.0, e, 0.0));
  vec3 pzp = potencial(p + vec3(0.0, 0.0, e));
  vec3 pzm = potencial(p - vec3(0.0, 0.0, e));
  float cx = (pzp.y - pzm.y) - (pyp.z - pym.z);
  float cy = (pxp.z - pxm.z) - (pzp.x - pzm.x);
  float cz = (pyp.x - pym.x) - (pxp.y - pxm.y);
  return vec3(cx, cy, cz) / (2.0 * e);
}

void main() {
  vec4 atual = texture(uPos, vUv);
  vec4 casa = texture(uHome, vUv);
  vec3 pos = atual.xyz;

  // 1. Mola de retorno: a partícula sempre volta para a arquitetura de origem.
  vec3 forca = (casa.xyz - pos) * 0.085;

  // 2. Turbulência orgânica contínua (curl noise de 3 oitavas).
  vec3 p = pos * 0.70 + vec3(0.0, 0.0, uTempo * 0.06);
  forca += rotacional(p) * 0.030;
  forca += rotacional(p * 2.3 + 11.0) * 0.010;
  forca += rotacional(p * 4.7 - 5.0) * 0.004;

  // 3. Repulsão da mão / mouse no espaço 3D.
  vec3 aoPonteiro = pos - uPonteiro;
  float d = length(aoPonteiro);
  if (d < 0.95 && d > 0.0001) {
    forca += (aoPonteiro / d) * (0.95 - d) * uRepulsao;
  }

  pos += forca;
  saida = vec4(pos, casa.w);
}`

const VERT_PONTO = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aRef;

uniform sampler2D uPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uCamZ;
uniform float uEscalaProjecao;

out float vSemente;
out float vProfundidade;

void main() {
  vec4 dado = texture(uPos, aRef);
  vec3 p = dado.xyz;
  // Corredor infinito: o mundo é dobrado em módulo, a câmera anda.
  // A câmera olha para -z, então o corredor vive em z negativo (à frente).
  p.z = -mod(p.z - uCamZ, 14.0) - 0.6;
  vec4 mv = uView * vec4(p, 1.0);
  float dist = max(1.0, -mv.z);
  gl_Position = uProj * mv;
  // Tamanho em pixels coerente com a projeção: raio de mundo / profundidade.
  gl_PointSize = clamp(uEscalaProjecao * 0.035 / dist, 1.0, 40.0);
  vSemente = dado.w;
  vProfundidade = dist;
}`

const FRAG_PONTO = `#version 300 es
precision highp float;
in float vSemente;
in float vProfundidade;
out vec4 saida;

void main() {
  // Impostor sphere: um ponto quadrado virando esfera 3D iluminada (truque gl_PointCoord).
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(uv, uv);
  if (r2 > 1.0) discard;
  float z = sqrt(1.0 - r2);
  vec3 n = normalize(vec3(uv.x, -uv.y, z));

  vec3 luz = normalize(vec3(-0.55, 0.60, 0.75));
  float dif = max(0.0, dot(n, luz));
  float espec = pow(max(0.0, dot(reflect(-luz, n), vec3(0.0, 0.0, 1.0))), 26.0);
  float fresnel = pow(1.0 - z, 2.6);

  vec3 quente = vec3(1.0, 0.34, 0.05);
  vec3 ouro = vec3(0.93, 0.72, 0.44);
  vec3 cor = mix(quente, ouro, step(0.38, vSemente));

  vec3 rgb = cor * (0.10 + dif * 0.82)
           + vec3(1.0, 0.94, 0.86) * espec * 0.85
           + cor * fresnel * 0.55;

  // Névoa do horizonte (quanto mais longe, mais some no ambiente).
  float nevoa = clamp(vProfundidade / 13.0, 0.0, 1.0);
  rgb *= 1.0 - nevoa * 0.72;

  float alfa = (0.30 + dif * 0.55 + espec) * (1.0 - nevoa * 0.55);
  saida = vec4(rgb, clamp(alfa, 0.0, 1.0));
}`

function compilar(gl: WebGL2RenderingContext, tipo: number, fonte: string): WebGLShader | null {
  const sh = gl.createShader(tipo)
  if (!sh) return null
  gl.shaderSource(sh, fonte)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[HYDRA] falha ao compilar shader:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function programa(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compilar(gl, gl.VERTEX_SHADER, vs)
  const f = compilar(gl, gl.FRAGMENT_SHADER, fs)
  if (!v || !f) return null
  const p = gl.createProgram()
  if (!p) return null
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[HYDRA] falha ao linkar programa:', gl.getProgramInfoLog(p))
    gl.deleteProgram(p)
    return null
  }
  return p
}

function perspectiva(fovGraus: number, aspecto: number, perto: number, longe: number): Float32Array {
  const f = 1 / Math.tan((fovGraus * Math.PI) / 360)
  const nf = 1 / (perto - longe)
  return new Float32Array([
    f / aspecto, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (longe + perto) * nf, -1,
    0, 0, 2 * longe * perto * nf, 0,
  ])
}

function translacao(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ])
}

/** Point Cloud de origem: avenida de partículas + prédios laterais + orbe central. */
function construirCasa(lado: number): Float32Array {
  const total = lado * lado
  const dados = new Float32Array(total * 4)
  for (let i = 0; i < total; i++) {
    const escolha = Math.random()
    let x = 0
    let y = 0
    let z = 0
    if (escolha < 0.46) {
      // chão / avenida
      x = (Math.random() - 0.5) * 5.2
      y = -1.15 + Math.random() * 0.12
      z = Math.random() * 14
    } else if (escolha < 0.82) {
      // fachadas dos prédios dos dois lados
      const ladoRua = Math.random() < 0.5 ? -1 : 1
      x = ladoRua * (1.35 + Math.random() * 1.35)
      y = -1.15 + Math.random() * 3.0
      z = Math.random() * 14
    } else {
      // orbe/anéis suspensos no centro do corredor
      const ang = Math.random() * Math.PI * 2
      const raio = 0.42 + (Math.random() - 0.5) * 0.1
      x = Math.cos(ang) * raio
      y = 0.05 + Math.sin(ang) * raio
      z = 4.6 + Math.sin(ang * 3) * 0.35
    }
    dados[i * 4] = x
    dados[i * 4 + 1] = y
    dados[i * 4 + 2] = z
    dados[i * 4 + 3] = Math.random()
  }
  return dados
}

class MotorHydra {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null = null
  private progSim: WebGLProgram | null = null
  private progPonto: WebGLProgram | null = null
  private texPos: WebGLTexture[] = []
  private texHome: WebGLTexture | null = null
  private fbo: WebGLFramebuffer[] = []
  private vaoVazio: WebGLVertexArrayObject | null = null
  private vaoPonto: WebGLVertexArrayObject | null = null
  private bufRef: WebGLBuffer | null = null

  private lado = 256
  private atual = 0
  private largura = 1
  private altura = 1
  private camZ = 0
  private tempo = 0

  private formato: number = 0
  private tipoDado: number = 0
  private framesMedidos = 0
  private msAcumulado = 0
  private ajustes = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  iniciar(): StatusHydra {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    }) as WebGL2RenderingContext | null
    if (!gl) return 'sem-webgl2'
    this.gl = gl

    if (gl.getExtension('EXT_color_buffer_float')) {
      this.formato = gl.RGBA32F
      this.tipoDado = gl.FLOAT
    } else if (gl.getExtension('EXT_color_buffer_half_float')) {
      this.formato = gl.RGBA16F
      this.tipoDado = gl.HALF_FLOAT
    } else {
      return 'sem-float'
    }

    this.progSim = programa(gl, VERT_QUAD, FRAG_SIM)
    this.progPonto = programa(gl, VERT_PONTO, FRAG_PONTO)
    if (!this.progSim || !this.progPonto) return 'erro'

    this.vaoVazio = gl.createVertexArray()
    this.vaoPonto = gl.createVertexArray()
    if (!this.vaoVazio || !this.vaoPonto) return 'erro'

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.clearColor(0, 0, 0, 0)

    this.lado = this.ladoInicial()
    if (!this.criarDados(this.lado)) return 'erro'
    return 'ok'
  }

  private ladoInicial(): number {
    const nucleos = navigator.hardwareConcurrency || 4
    const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4
    if (memoria <= 2 || nucleos <= 2) return 128
    if (memoria <= 4) return 192
    return 256
  }

  private criarDados(lado: number): boolean {
    const gl = this.gl
    if (!gl) return false
    this.lado = lado
    const total = lado * lado
    const casa = construirCasa(lado)
    const posicao = new Float32Array(casa)

    // --- textura de posição (ping-pong) ---
    this.texPos.forEach((t) => gl.deleteTexture(t))
    this.fbo.forEach((f) => gl.deleteFramebuffer(f))
    this.texPos = []
    this.fbo = []
    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture()
      const fb = gl.createFramebuffer()
      if (!tex || !fb) return false
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, this.formato, lado, lado, 0, gl.RGBA, this.tipoDado, posicao)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      const completo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      if (!completo) return false
      this.texPos.push(tex)
      this.fbo.push(fb)
    }

    // --- textura da posição de origem ---
    if (this.texHome) gl.deleteTexture(this.texHome)
    const texCasa = gl.createTexture()
    if (!texCasa) return false
    gl.bindTexture(gl.TEXTURE_2D, texCasa)
    gl.texImage2D(gl.TEXTURE_2D, 0, this.formato, lado, lado, 0, gl.RGBA, this.tipoDado, casa)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.texHome = texCasa

    // --- buffer de referência (UV de cada partícula na textura de dados) ---
    if (this.bufRef) gl.deleteBuffer(this.bufRef)
    const refs = new Float32Array(total * 2)
    for (let i = 0; i < total; i++) {
      refs[i * 2] = ((i % lado) + 0.5) / lado
      refs[i * 2 + 1] = (Math.floor(i / lado) + 0.5) / lado
    }
    this.bufRef = gl.createBuffer()
    if (!this.bufRef) return false
    gl.bindVertexArray(this.vaoPonto)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufRef)
    gl.bufferData(gl.ARRAY_BUFFER, refs, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)
    this.atual = 0
    this.framesMedidos = 0
    this.msAcumulado = 0
    return true
  }

  redimensionar(largura: number, altura: number, dpr: number) {
    const gl = this.gl
    if (!gl) return
    const w = Math.max(1, Math.floor(largura * dpr))
    const h = Math.max(1, Math.floor(altura * dpr))
    if (w === this.largura && h === this.altura) return
    this.largura = w
    this.altura = h
    this.canvas.width = w
    this.canvas.height = h
    gl.viewport(0, 0, w, h)
  }

  private simular(ponteiroX: number, ponteiroY: number, repulsao: number) {
    const gl = this.gl
    const p = this.progSim
    if (!gl || !p) return

    const mundoX = ((ponteiroX / this.largura) * 2 - 1) * 2.4
    const mundoY = -(((ponteiroY / this.altura) * 2 - 1) * 1.5)
    const alvo = this.atual === 0 ? 1 : 0

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[alvo])
    gl.viewport(0, 0, this.lado, this.lado)
    gl.useProgram(p)
    gl.bindVertexArray(this.vaoVazio)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texPos[this.atual])
    gl.uniform1i(gl.getUniformLocation(p, 'uPos'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.texHome)
    gl.uniform1i(gl.getUniformLocation(p, 'uHome'), 1)

    gl.uniform1f(gl.getUniformLocation(p, 'uTempo'), this.tempo)
    gl.uniform3f(gl.getUniformLocation(p, 'uPonteiro'), mundoX, mundoY, 4.6)
    gl.uniform1f(gl.getUniformLocation(p, 'uRepulsao'), repulsao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    this.atual = alvo
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  passo(dt: number, ponteiroX: number, ponteiroY: number, ponteiroAtivo: boolean) {
    const gl = this.gl
    const p = this.progPonto
    if (!gl || !p) return

    const inicio = performance.now()
    this.tempo += dt
    this.camZ += dt * 1.75
    if (this.camZ > 14) this.camZ -= 14

    this.simular(ponteiroX, ponteiroY, ponteiroAtivo ? 0.32 : 0)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.largura, this.altura)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(p)
    gl.bindVertexArray(this.vaoPonto)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texPos[this.atual])
    gl.uniform1i(gl.getUniformLocation(p, 'uPos'), 0)

    const aspecto = this.largura / Math.max(1, this.altura)
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProj'), false, perspectiva(56, aspecto, 0.1, 60))
    const balancoX = Math.sin(this.tempo * 0.31) * 0.08
    const balancoY = Math.cos(this.tempo * 0.24) * 0.05
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uView'), false, translacao(-balancoX, -balancoY, 0))
    gl.uniform1f(gl.getUniformLocation(p, 'uCamZ'), this.camZ)
    gl.uniform1f(gl.getUniformLocation(p, 'uEscalaProjecao'), this.altura)

    gl.drawArrays(gl.POINTS, 0, this.lado * this.lado)
    gl.bindVertexArray(null)

    // Adaptive GPU tiering: mede o custo de submissão do frame e ajusta a densidade
    // da textura de dados (96² → 384² partículas) para manter a fluidez em PCs fracos.
    this.msAcumulado += performance.now() - inicio
    this.framesMedidos++
    if (this.framesMedidos >= 45) {
      const media = this.msAcumulado / this.framesMedidos
      this.msAcumulado = 0
      this.framesMedidos = 0
      if (this.ajustes < 3) {
        if (media > 15 && this.lado > 96) {
          this.ajustes++
          this.criarDados(Math.max(96, Math.floor(this.lado * 0.68)))
        } else if (media < 6 && this.lado < 384) {
          this.ajustes++
          this.criarDados(Math.min(384, Math.round(this.lado * 1.45)))
        }
      }
    }
  }

  destruir() {
    const gl = this.gl
    if (!gl) return
    this.texPos.forEach((t) => gl.deleteTexture(t))
    this.fbo.forEach((f) => gl.deleteFramebuffer(f))
    if (this.texHome) gl.deleteTexture(this.texHome)
    if (this.bufRef) gl.deleteBuffer(this.bufRef)
    if (this.progSim) gl.deleteProgram(this.progSim)
    if (this.progPonto) gl.deleteProgram(this.progPonto)
    if (this.vaoVazio) gl.deleteVertexArray(this.vaoVazio)
    if (this.vaoPonto) gl.deleteVertexArray(this.vaoPonto)
    this.texPos = []
    this.fbo = []
    this.gl = null
  }

  get contagem() {
    return this.lado * this.lado
  }
}

export const HydraGpuFundo = memo(function HydraGpuFundo({
  ativo,
  opacidade = 1,
  onStatus,
}: {
  ativo: boolean
  opacidade?: number
  onStatus?: (status: StatusHydra, particulas: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const motorRef = useRef<MotorHydra | null>(null)
  const pointerRef = useRef({ x: -1, y: -1, ativo: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!ativo || !canvas) return
    const motor = new MotorHydra(canvas)
    const status = motor.iniciar()
    motorRef.current = status === 'ok' ? motor : null
    onStatus?.(status, motor.contagem)
    if (status !== 'ok') {
      motor.destruir()
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.6)
    const medir = () => motor.redimensionar(window.innerWidth, window.innerHeight, dpr)
    medir()
    window.addEventListener('resize', medir)

    const mover = (e: PointerEvent) => {
      const dprAtual = Math.min(window.devicePixelRatio || 1, 1.6)
      pointerRef.current.x = e.clientX * dprAtual
      pointerRef.current.y = e.clientY * dprAtual
      pointerRef.current.ativo = true
    }
    window.addEventListener('pointermove', mover, { passive: true })

    let raf = 0
    let ultimo = performance.now()
    const laco = (agora: number) => {
      raf = requestAnimationFrame(laco)
      if (document.hidden) {
        ultimo = agora
        return
      }
      const dt = Math.min(0.05, (agora - ultimo) / 1000)
      ultimo = agora

      const mao = biometriaGlobal.handRight
      const dprAtual = Math.min(window.devicePixelRatio || 1, 1.6)
      const ponteiroX = mao.active ? mao.screenX * dprAtual : pointerRef.current.x
      const ponteiroY = mao.active ? mao.screenY * dprAtual : pointerRef.current.y
      const ponteiroAtivo = mao.active || pointerRef.current.ativo

      motor.passo(dt, ponteiroX < 0 ? -9999 : ponteiroX, ponteiroY < 0 ? -9999 : ponteiroY, ponteiroAtivo)
    }
    raf = requestAnimationFrame(laco)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', medir)
      window.removeEventListener('pointermove', mover)
      motor.destruir()
      motorRef.current = null
    }
  }, [ativo, onStatus])

  return (
    <canvas
      ref={canvasRef}
      className="fui-hydra-canvas"
      style={{ opacity: ativo ? opacidade : 0 }}
      aria-hidden
    />
  )
})
