/**
 * Detector de "passar a página com a mão" do visualizador.
 *
 * Antes havia três detectores soltos (mão aberta, punho, pinça), cada um com o seu limiar, e o principal tinha o guarda do
 * retorno ESCRITO AO CONTRÁRIO: `lastPageFlipDir !== direcao` deixava passar justamente a direção oposta, então a volta da
 * mão virava outra página. Aqui há um só, com três regras:
 *
 *   1. Gesto deliberado: rápido, longo e horizontal (deslocamento >= 20% da largura da tela dentro de 320 ms, mais de
 *      0,9 px/ms, e bem mais horizontal que vertical). Tremor, ajuste de posição e movimento lento não contam.
 *   2. Intervalo mínimo entre duas viradas (600 ms).
 *   3. Armar/desarmar: depois de virar, o detector só volta a valer quando a mão ASSENTA (parada por 200 ms). A volta natural
 *      da mão, que começa logo após o gesto, nunca chega a assentar e portanto não vira página. O mesmo vale ao abrir o
 *      visualizador: a mão ainda em movimento do clique não vira página.
 *
 * Direção: mão indo para a esquerda da tela = próxima página (mesmo mapeamento de antes).
 * Os valores abaixo são o ponto de ajuste: se ainda estiver sensível ou duro, mexa só aqui.
 */
export type Direcao = 'next' | 'prev'

export const AJUSTES = {
  janelaMs: 320,          // quanto do passado o detector enxerga
  amostraMinMs: 90,       // histórico mínimo para medir uma velocidade
  deslocMinPx: 240,       // piso absoluto do deslocamento horizontal...
  deslocMinFracao: 0.2,   // ...ou esta fração da largura da tela (vale o maior)
  horizontalidade: 2.2,   // |dx| precisa passar |dy| por este fator
  velMinPxMs: 0.9,        // ~900 px/s
  intervaloMinMs: 600,    // entre duas viradas (2ª proteção: o desarme até a mão assentar já impede a repetição)
  repousoVelPxMs: 0.25,   // abaixo disto a mão está "parada"
  repousoJanelaMs: 140,   // o repouso é medido numa janela CURTA, senão o fim do gesto contaminava a medida por ~0,3 s
  repousoMs: 200,         // parada por este tempo rearma o detector (pausa total depois do gesto: ~0,35 s)
}

type Amostra = { t: number; x: number; y: number }

export class DetectorFolhear {
  private hist: Amostra[] = []
  private armado = false
  private repousoDesde = 0
  private ultimaVirada = -1e9

  /** Chame a cada quadro com a posição suavizada da mão (px) e o tempo em ms. Devolve a direção só em gesto deliberado. */
  atualizar(x: number, y: number, t: number, largura: number): Direcao | null {
    this.hist.push({ t, x, y })
    while (this.hist.length > 1 && t - this.hist[0].t > AJUSTES.janelaMs) this.hist.shift()
    const a = this.hist[0]
    const dtJ = t - a.t
    if (dtJ < AJUSTES.amostraMinMs) return null
    const dx = x - a.x
    const dy = y - a.y
    const velX = Math.abs(dx) / dtJ

    if (!this.armado) {
      // a mão parada (movimento total pequeno na janela curta) por tempo suficiente rearma o detector
      const ref = this.hist.find((p) => t - p.t <= AJUSTES.repousoJanelaMs) ?? a
      const dtR = t - ref.t
      if (dtR >= AJUSTES.amostraMinMs / 2 && Math.hypot(x - ref.x, y - ref.y) / dtR < AJUSTES.repousoVelPxMs) {
        if (!this.repousoDesde) this.repousoDesde = t
        if (t - this.repousoDesde >= AJUSTES.repousoMs) this.armado = true
      } else {
        this.repousoDesde = 0
      }
      return null
    }

    if (t - this.ultimaVirada < AJUSTES.intervaloMinMs) return null
    const minDx = Math.max(AJUSTES.deslocMinPx, AJUSTES.deslocMinFracao * largura)
    if (Math.abs(dx) >= minDx && Math.abs(dx) > AJUSTES.horizontalidade * Math.abs(dy) && velX >= AJUSTES.velMinPxMs) {
      this.virou(t)
      return dx < 0 ? 'next' : 'prev'
    }
    return null
  }

  /** Os detectores de punho e pinça perguntam antes de virar, para obedecerem ao mesmo bloqueio. */
  podeVirar(t: number): boolean {
    return this.armado && t - this.ultimaVirada >= AJUSTES.intervaloMinMs
  }

  /** Registra uma virada (do gesto aberto ou de outro detector): desarma até a mão assentar. */
  virou(t: number): void {
    this.ultimaVirada = t
    this.armado = false
    this.repousoDesde = 0
    this.hist = []
  }

  /** Visualizador fechado (ou mão perdida): zera tudo. Ao reabrir, só vale depois de a mão assentar. */
  reiniciar(): void {
    this.hist = []
    this.armado = false
    this.repousoDesde = 0
  }
}
