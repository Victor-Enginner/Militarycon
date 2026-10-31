import { memo, useEffect, useRef } from 'react'

/**
 * ============================================================================
 * CAMADA DE CÓDIGO — chuva binária → matrix + água no cursor
 * ============================================================================
 * Fica ACIMA do fundo do sistema (vídeo plexus do FuiWebGL) e ABAIXO do palco
 * do React Flow: é atmosfera, não interface. `pointer-events: none`.
 *
 * O que roda aqui, inspirado no que a Active Theory faz em partículas:
 *
 *  · chuva de dígitos em colunas, com cabeça brilhante e cauda que apaga;
 *    alterna entre BINÁRIO (0/1, azul frio) e MATRIX (hex, verde) a cada 9 s;
 *  · lente de água: os dígitos perto do cursor crescem, clareiam e são
 *    empurrados para fora do centro — o mesmo "dedilhar na água" do efeito
 *    de ripple, mas aplicado ao código;
 *  · anéis que se abrem a partir do caminho do cursor (a onda),
 *    e faíscas que saem da velocidade do movimento;
 *  · tudo com física por delta-time, buffers pré-alocados e tiering
 *    adaptativo (se o frame custar caro, a cauda e a densidade encolhem).
 */

const FASE_SEGUNDOS = 9
const CAUDA_MAX = 18
const ESPACO_COLUNA = 18
const RAIO_LENTE = 135
const MAX_ANEIS = 14
const MAX_FAISCAS = 180
const MAX_GLIFOS_LENTE = 420
const CORRENTES = 3
const COMPRIMENTO_CORRENTE = 46

type Anel = { x: number; y: number; raio: number; ativo: boolean }
type Faisca = { x: number; y: number; vx: number; vy: number; vida: number; total: number }

export const FundoBinario = memo(function FundoBinario({
  intensidade = 1,
}: {
  intensidade?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduzido =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 1
    let H = 1
    let dpr = 1
    let nCols = 0

    // --- chuva ---
    let chuvaY = new Float32Array(0)
    let chuvaVel = new Float32Array(0)
    let chuvaSemente = new Float32Array(0)
    let cauda = reduzido ? 8 : CAUDA_MAX

    // --- cursor / água ---
    const ponteiro = {
      alvoX: -999,
      alvoY: -999,
      x: -999,
      y: -999,
      anteriorX: -999,
      anteriorY: -999,
      vx: 0,
      vy: 0,
      ativo: false,
      ultimoAnel: 0,
    }
    const aneis: Anel[] = Array.from({ length: MAX_ANEIS }, () => ({
      x: 0,
      y: 0,
      raio: 0,
      ativo: false,
    }))
    let proximoAnel = 0

    const faiscas: Faisca[] = Array.from({ length: MAX_FAISCAS }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      vida: 0,
      total: 1,
    }))
    let proximaFaisca = 0

    // correntes horizontais: o "binário passando em codificação"
    const correnteY = new Float32Array(CORRENTES)
    const correnteX = new Float32Array(CORRENTES)
    const correnteVel = new Float32Array(CORRENTES)
    const correnteSemente = new Float32Array(CORRENTES)

    // fila de glifos dentro da lente (desenhados num segundo passe, ampliados)
    const lenteX = new Float32Array(MAX_GLIFOS_LENTE)
    const lenteY = new Float32Array(MAX_GLIFOS_LENTE)
    const lenteA = new Float32Array(MAX_GLIFOS_LENTE)
    const lenteG: string[] = new Array(MAX_GLIFOS_LENTE).fill('0')

    // --- medição de custo para o tiering ---
    let msAcumulado = 0
    let framesMedidos = 0
    let qualidade = 1

    const medirTela = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      W = canvas.clientWidth || window.innerWidth
      H = canvas.clientHeight || window.innerHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      nCols = Math.max(1, Math.floor(W / ESPACO_COLUNA))
      chuvaY = new Float32Array(nCols)
      chuvaVel = new Float32Array(nCols)
      chuvaSemente = new Float32Array(nCols)
      for (let c = 0; c < nCols; c++) {
        chuvaY[c] = Math.random() * H
        chuvaVel[c] = 28 + Math.random() * 62
        chuvaSemente[c] = Math.random() * 97
      }

      for (let i = 0; i < CORRENTES; i++) {
        correnteY[i] = (0.2 + 0.6 * ((i + 0.5) / CORRENTES)) * H + Math.random() * 40
        correnteX[i] = Math.random() * W
        correnteVel[i] = 150 + Math.random() * 190
        correnteSemente[i] = Math.random() * 97
      }
    }

    // ---------------------------------------------------------------- eventos
    const aoMover = (e: PointerEvent) => {
      ponteiro.alvoX = e.clientX
      ponteiro.alvoY = e.clientY
      if (!ponteiro.ativo) {
        ponteiro.x = e.clientX
        ponteiro.y = e.clientY
        ponteiro.anteriorX = e.clientX
        ponteiro.anteriorY = e.clientY
        ponteiro.ativo = true
      }
    }
    const aoSair = () => {
      ponteiro.ativo = false
    }
    const aoTocar = (e: PointerEvent) => {
      aoMover(e)
      criarAnel(e.clientX, e.clientY)
    }

    window.addEventListener('pointermove', aoMover, { passive: true })
    window.addEventListener('pointerdown', aoTocar, { passive: true })
    window.addEventListener('pointerleave', aoSair)
    window.addEventListener('resize', medirTela)
    document.addEventListener('mouseleave', aoSair)

    const criarAnel = (x: number, y: number) => {
      const a = aneis[proximoAnel]
      a.x = x
      a.y = y
      a.raio = 0
      a.ativo = true
      proximoAnel = (proximoAnel + 1) % MAX_ANEIS
    }

    const criarFaisca = (x: number, y: number, vx: number, vy: number) => {
      const f = faiscas[proximaFaisca]
      f.x = x
      f.y = y
      f.vx = vx * 0.18 + (Math.random() - 0.5) * 40
      f.vy = vy * 0.18 + (Math.random() - 0.5) * 40
      f.vida = 0
      f.total = 0.5 + Math.random() * 0.7
      proximaFaisca = (proximaFaisca + 1) % MAX_FAISCAS
    }

    medirTela()

    // ------------------------------------------------------------------ loop
    let raf = 0
    let ultimo = performance.now()
    let tempo = 0

    const desenhar = (dt: number) => {
      tempo += dt
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // --- cursor com amortecimento exponencial (independe do frame rate) ---
      const k = 1 - Math.exp(-dt * 11)
      const antesX = ponteiro.x
      const antesY = ponteiro.y
      if (ponteiro.ativo) {
        if (ponteiro.x < -500) {
          ponteiro.x = ponteiro.alvoX
          ponteiro.y = ponteiro.alvoY
        } else {
          ponteiro.x += (ponteiro.alvoX - ponteiro.x) * k
          ponteiro.y += (ponteiro.alvoY - ponteiro.y) * k
        }
      }
      const deslX = ponteiro.x - antesX
      const deslY = ponteiro.y - antesY
      const velocidade = Math.hypot(deslX, deslY) / Math.max(0.001, dt)
      ponteiro.vx = deslX
      ponteiro.vy = deslY

      // --- anéis de água: nascem do caminho percorrido ---
      if (ponteiro.ativo && !reduzido) {
        const percorrido = Math.hypot(ponteiro.x - ponteiro.anteriorX, ponteiro.y - ponteiro.anteriorY)
        if (percorrido > 78 && tempo - ponteiro.ultimoAnel > 0.16) {
          criarAnel(ponteiro.x, ponteiro.y)
          ponteiro.anteriorX = ponteiro.x
          ponteiro.anteriorY = ponteiro.y
          ponteiro.ultimoAnel = tempo
        }
        if (velocidade > 260) {
          criarFaisca(ponteiro.x, ponteiro.y, ponteiro.vx, ponteiro.vy)
          if (velocidade > 900) criarFaisca(ponteiro.x, ponteiro.y, ponteiro.vx, ponteiro.vy)
        }
      }

      const faseMatriz = Math.floor(tempo / FASE_SEGUNDOS) % 2 === 1
      const rampa = faseMatriz ? '0123456789ABCDEF' : '01'
      // tinta (multiply): o fundo é claro — azul profundo no binário, verde no matrix
      const corBase = faseMatriz ? 'rgba(16,104,58,' : 'rgba(26,62,132,'
      const corCabeca = faseMatriz ? 'rgba(6,64,34,' : 'rgba(8,26,72,'
      const giro = Math.floor(tempo * (faseMatriz ? 6 : 9))

      ctx.globalCompositeOperation = 'source-over'
      ctx.textBaseline = 'top'
      // o tiering mexe na CAUDA, nunca no corpo da fonte (senão o texto some)
      const fonteNormal = '600 13px "JetBrains Mono", "Fira Code", Consolas, monospace'
      ctx.font = fonteNormal

      let lenteCount = 0
      const temPonteiro = ponteiro.ativo && ponteiro.x > -500
      const caudaAtual = Math.max(9, Math.round(cauda * qualidade))
      const alfaMestre = 0.95 * intensidade

      // --- chuva ---
      for (let c = 0; c < nCols; c++) {
        const x = c * ESPACO_COLUNA + 4
        const topo = Math.floor(chuvaY[c] / 16)
        const semente = Math.floor(chuvaSemente[c])

        for (let d = 0; d < caudaAtual; d++) {
          const linha = topo - d
          const y = linha * 16
          if (y < -20 || y > H + 20) continue

          let alfa: number
          if (d === 0) alfa = 0.88
          else {
            const forca = 1 - d / caudaAtual
            alfa = forca * forca * 0.52
          }

          // anéis: o que a onda alcança acende
          let brilhoAnel = 0
          if (!reduzido) {
            for (let r = 0; r < MAX_ANEIS; r++) {
              const anel = aneis[r]
              if (!anel.ativo) continue
              const dist = Math.hypot(x - anel.x, y - anel.y)
              const perto = Math.abs(dist - anel.raio)
              if (perto < 30) brilhoAnel += (1 - perto / 30) * (anel.raio < 220 ? 0.4 : 0.18)
            }
          }

          // lente de água: perto do cursor o dígito é empurrado, cresce e clareia
          let desloc = 0
          let naLente = false
          if (temPonteiro) {
            const dx = x - ponteiro.x
            const dy = y - ponteiro.y
            const dist = Math.hypot(dx, dy)
            if (dist < RAIO_LENTE) {
              const forca = 1 - dist / RAIO_LENTE
              desloc = forca * 16
              alfa += forca * 0.55
              naLente = forca > 0.35 && lenteCount < MAX_GLIFOS_LENTE
              if (dist > 0.001 && desloc > 0) {
                const nx = x + (dx / dist) * desloc
                const ny = y + (dy / dist) * desloc
                if (naLente) {
                  lenteX[lenteCount] = nx
                  lenteY[lenteCount] = ny
                  lenteA[lenteCount] = Math.min(1, (alfa + brilhoAnel) * 1.4)
                  lenteG[lenteCount] = rampa[(semente + d * 3 + giro) % rampa.length] || '0'
                  lenteCount++
                }
              }
            }
          }

          if (naLente) continue

          const a = Math.min(1, (alfa + brilhoAnel) * alfaMestre)
          if (a < 0.02) continue
          ctx.fillStyle = (d === 0 || alfa > 0.42 ? corCabeca : corBase) + a.toFixed(3) + ')'
          ctx.fillText(rampa[(semente + d * 3 + giro) % rampa.length], x, y)
        }

        chuvaY[c] += chuvaVel[c] * dt * (faseMatriz ? 1.15 : 0.9)
        if (chuvaY[c] - caudaAtual * 16 > H) {
          chuvaY[c] = -Math.random() * 160
          chuvaVel[c] = 28 + Math.random() * 62
          chuvaSemente[c] = Math.random() * 97
        }
      }

      // --- correntes horizontais (codificação passando) ---
      for (let i = 0; i < CORRENTES; i++) {
        const y = correnteY[i]
        const cabeca = correnteX[i]
        for (let d = 0; d < COMPRIMENTO_CORRENTE; d++) {
          const x = cabeca - d * 9
          if (x < -20) break
          if (x > W + 20) continue
          const forca = 1 - d / COMPRIMENTO_CORRENTE
          const alfa = (d === 0 ? 0.62 : forca * forca * 0.34) * alfaMestre
          if (alfa < 0.02) continue
          const glifo = rampa[(Math.floor(correnteSemente[i]) + d + giro) % rampa.length]
          ctx.fillStyle = (d === 0 ? corCabeca : corBase) + alfa.toFixed(3) + ')'
          ctx.fillText(glifo, x, y)
        }
        correnteX[i] += correnteVel[i] * dt
        if (correnteX[i] - COMPRIMENTO_CORRENTE * 9 > W) {
          correnteX[i] = -Math.random() * 120
          correnteY[i] = (0.15 + Math.random() * 0.7) * H
          correnteVel[i] = 150 + Math.random() * 190
          correnteSemente[i] = Math.random() * 97
        }
      }

      // --- segundo passe: glifos ampliados dentro da lente ---
      if (lenteCount > 0) {
        ctx.font = '700 20px "JetBrains Mono", "Fira Code", Consolas, monospace'
        for (let i = 0; i < lenteCount; i++) {
          const a = Math.min(1, lenteA[i] * alfaMestre)
          if (a < 0.02) continue
          ctx.fillStyle = (faseMatriz ? 'rgba(4,58,30,' : 'rgba(4,18,56,') + a.toFixed(3) + ')'
          ctx.fillText(lenteG[i], lenteX[i], lenteY[i])
        }
        ctx.font = fonteNormal
      }

      // --- anéis de água ---
      if (!reduzido) {
        for (let r = 0; r < MAX_ANEIS; r++) {
          const anel = aneis[r]
          if (!anel.ativo) continue
          anel.raio += 260 * dt
          const alfa = Math.max(0, 1 - anel.raio / 320) * 0.42 * intensidade
          if (alfa <= 0.01) {
            anel.ativo = false
            continue
          }
          ctx.strokeStyle = (faseMatriz ? 'rgba(12,116,64,' : 'rgba(20,52,120,') + alfa.toFixed(3) + ')'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(anel.x, anel.y, anel.raio, 0, Math.PI * 2)
          ctx.stroke()

          ctx.strokeStyle = (faseMatriz ? 'rgba(12,116,64,' : 'rgba(20,52,120,') + (alfa * 0.4).toFixed(3) + ')'
          ctx.beginPath()
          ctx.arc(anel.x, anel.y, Math.max(0, anel.raio - 10), 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // --- faíscas ---
      for (let i = 0; i < MAX_FAISCAS; i++) {
        const f = faiscas[i]
        if (f.total <= 0) continue
        f.vida += dt
        if (f.vida >= f.total) {
          f.total = 0
          continue
        }
        const arrasto = 1 - Math.min(1, dt * 2.4)
        f.vx *= arrasto
        f.vy *= arrasto
        f.x += f.vx * dt
        f.y += f.vy * dt
        const alfa = (1 - f.vida / f.total) * 0.6 * intensidade
        ctx.fillStyle = (faseMatriz ? 'rgba(20,120,68,' : 'rgba(255,85,0,') + alfa.toFixed(3) + ')'
        ctx.fillRect(f.x, f.y, 1.8, 1.8)
      }

      // --- halo macio no cursor (a "lente" em si) ---
      if (temPonteiro && !reduzido) {
        const grad = ctx.createRadialGradient(
          ponteiro.x,
          ponteiro.y,
          0,
          ponteiro.x,
          ponteiro.y,
          RAIO_LENTE * 0.8
        )
        grad.addColorStop(0, faseMatriz ? 'rgba(20,140,80,0.14)' : 'rgba(30,70,150,0.12)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(ponteiro.x, ponteiro.y, RAIO_LENTE * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const laco = (agora: number) => {
      raf = requestAnimationFrame(laco)
      const dt = Math.min(0.05, (agora - ultimo) / 1000)
      ultimo = agora
      if (document.hidden || reduzido) return

      const inicio = performance.now()
      desenhar(dt)

      // tiering: se o frame custar caro, a cauda e a densidade encolhem
      msAcumulado += performance.now() - inicio
      framesMedidos++
      if (framesMedidos >= 90) {
        const media = msAcumulado / framesMedidos
        msAcumulado = 0
        framesMedidos = 0
        // só cede qualidade quando o frame custa de fato caro (12 ms), e volta com folga (< 6 ms)
        if (media > 12 && qualidade > 0.7) qualidade = Math.max(0.7, qualidade - 0.15)
        else if (media < 6 && qualidade < 1) qualidade = Math.min(1, qualidade + 0.15)
        cauda = Math.max(10, Math.round(CAUDA_MAX * qualidade))
      }
    }

    raf = requestAnimationFrame(laco)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', aoMover)
      window.removeEventListener('pointerdown', aoTocar)
      window.removeEventListener('pointerleave', aoSair)
      window.removeEventListener('resize', medirTela)
      document.removeEventListener('mouseleave', aoSair)
    }
  }, [intensidade])

  return <canvas ref={canvasRef} className="fui-binario-canvas" aria-hidden />
})
