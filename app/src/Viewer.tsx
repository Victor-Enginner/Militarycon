import { ArrowUp, BookOpen, ChevronLeft, ChevronRight, Clapperboard, ExternalLink, Flame, GitBranchPlus, Hand, Pause, Play, Quote, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, arquivoUrl, dinheiro, rotaFogo, type No, type Pin } from './api'
import { useCanvas } from './ctx'
import { ESTADOS, alternarEstado, estadoDaTecla } from './estados'
import { fuiAudio } from './FuiAudio'

// Player oficial do YouTube (IFrame API): o único jeito de ligar/desligar o som SEM recarregar o vídeo. Antes o botão só mexia
// no <video> local e o iframe era recarregado pedindo `mute=0`, que o navegador bloqueia (som automático).
type YTPlayer = { mute(): void; unMute(): void; isMuted(): boolean; setVolume(v: number): void; destroy(): void }
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}
let apiYT: Promise<void> | null = null
function carregarYT(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (!apiYT) {
    apiYT = new Promise<void>((ok, falhou) => {
      const anterior = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => { anterior?.(); ok() }
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      s.onerror = () => { apiYT = null; falhou(new Error('sem acesso ao youtube.com')) }
      document.head.appendChild(s)
    })
  }
  return apiYT
}

/** A imagem, vídeo, stream YouTube ou artigo ArXiv em tela cheia: operação 1 mão (Gesto ✌️ ou Pinça 👌), comentários e linhagem. */
export function Viewer({ id, fechar, navegar }: { id: string; fechar: () => void; navegar: (id: string) => void }) {
  const { porId, arv, slug, mudar, acao, copiar, novoPedido, pedidoVideo, estado: projeto } = useCanvas()
  const no = porId.get(id) as No
  const [pin, setPin] = useState<Pin | null>(null)
  const ehVideo = no.tipo === 'video'
  const ehYoutube = no.subtipo === 'youtube' && !!(no.youtube_id || no.embed_url)
  const ehArxiv = no.subtipo === 'arxiv'
  const [verPdfArxiv, setVerPdfArxiv] = useState(false)
  // O vídeo SEMPRE sobe mudo (é o único jeito de o navegador deixar tocar sozinho); o som é ligado depois e o estado mostrado
  // é o REAL, conferido no player, nunca o desejado.
  const [somVideo, setSomVideo] = useState(false)
  const [somBloqueado, setSomBloqueado] = useState(false)
  const [falhaYT, setFalhaYT] = useState(false)
  const ytPalcoRef = useRef<HTMLDivElement>(null)
  const ytRef = useRef<YTPlayer | null>(null)
  const silenciouRef = useRef(false)  // o usuário pediu mudo: nada religa o som sozinho
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tempo, setTempo] = useState(0)
  const [rodando, setRodando] = useState(true)
  const [total, setTotal] = useState(0)  // duração real do arquivo (chega no loadedmetadata)
  const duracao = total || no.duracao || 6
  const alternarVideo = () => { const v = videoRef.current; if (v) { if (v.paused) v.play(); else v.pause() } }
  const [texto, setTexto] = useState('')
  const [verPrompt, setVerPrompt] = useState(false)
  const [foco, setFoco] = useState<string | null>(null)
  const entrada = useRef<HTMLTextAreaElement>(null)

  // Deck de slides: prioriza os irmãos do mesmo pedido e concatena os demais slides do projeto para permitir folhear páginas continuamente!
  const irmas = useMemo(() => {
    const pai = arv.pai.get(no.id)
    const doPedido = (pai ? arv.filhos.get(pai) || [] : [no.id]).filter((id) => porId.get(id)?.arquivo)
    const todosComArquivo = projeto.nos.filter((n) => (n.tipo === 'imagem' || n.tipo === 'video' || n.tipo === 'referencia') && n.arquivo).map((n) => n.id)
    const unicos = [...new Set([...doPedido, ...todosComArquivo])]
    return unicos.includes(no.id) ? unicos : [no.id, ...unicos]
  }, [no.id, arv, porId, projeto.nos])
  const i = irmas.indexOf(no.id)
  const [animFlip, setAnimFlip] = useState<'next' | 'prev' | null>(null)
  const [avisoFlip, setAvisoFlip] = useState<string | null>(null)

  const irAnterior = useCallback(() => {
    if (irmas.length <= 1) return
    fuiAudio.hoverTick()
    setAnimFlip('prev')
    const idxAlvo = i > 0 ? i - 1 : irmas.length - 1
    setAvisoFlip(`📖 PÁGINA ${idxAlvo + 1} DE ${irmas.length}`)
    navegar(irmas[idxAlvo])
    window.setTimeout(() => setAnimFlip(null), 320)
    window.setTimeout(() => setAvisoFlip(null), 1100)
  }, [irmas, i, navegar])

  const irProxima = useCallback(() => {
    if (irmas.length <= 1) return
    fuiAudio.hoverTick()
    setAnimFlip('next')
    const idxAlvo = i < irmas.length - 1 ? i + 1 : 0
    setAvisoFlip(`📖 PÁGINA ${idxAlvo + 1} DE ${irmas.length}`)
    navegar(irmas[idxAlvo])
    window.setTimeout(() => setAnimFlip(null), 320)
    window.setTimeout(() => setAvisoFlip(null), 1100)
  }, [irmas, i, navegar])

  // Escuta o gesto de "Passar Página com a Mão" (Swipe Horizontal no Ar) vindo do BiometricNUI
  useEffect(() => {
    const aoPassarPagina = (ev: Event) => {
      const dir = (ev as CustomEvent<{ direcao: 'next' | 'prev' }>).detail?.direcao
      if (dir === 'next') irProxima()
      else if (dir === 'prev') irAnterior()
    }
    window.addEventListener('fui:viewer-slide', aoPassarPagina)
    return () => window.removeEventListener('fui:viewer-slide', aoPassarPagina)
  }, [irProxima, irAnterior])

  // ---- som do vídeo (YouTube e arquivo local) ----
  const ligarSomLocal = useCallback((v: HTMLVideoElement) => {
    v.muted = false
    v.volume = 1
    v.play().then(() => { setSomVideo(true); setSomBloqueado(false) }).catch(() => {
      v.muted = true  // o navegador recusou o som: volta mudo e segue tocando, e avisa
      void v.play().catch(() => { /* já tocando */ })
      setSomVideo(false)
      setSomBloqueado(true)
    })
  }, [])

  const aplicarSom = useCallback((ligar: boolean, doUsuario = true) => {
    if (doUsuario) silenciouRef.current = !ligar
    const v = videoRef.current
    if (v) {
      if (ligar) ligarSomLocal(v)
      else { v.muted = true; setSomVideo(false); setSomBloqueado(false) }
    }
    const p = ytRef.current
    if (p) {
      try { if (ligar) { p.unMute(); p.setVolume(100) } else p.mute() } catch { /* player ainda não está pronto */ }
      if (!ligar) { setSomVideo(false); setSomBloqueado(false) }
      else {
        // confere o estado REAL: se o navegador recusou o som, o botão não pode dizer "ON"
        window.setTimeout(() => {
          try {
            const mudo = !ytRef.current || ytRef.current.isMuted()
            setSomVideo(!mudo)
            setSomBloqueado(mudo)
          } catch { /* destruído */ }
        }, 600)
      }
    }
  }, [ligarSomLocal])

  // cria o player do YouTube mudo; ao ficar pronto, tenta ligar o som (a menos que o usuário tenha pedido mudo)
  useEffect(() => {
    if (!ehYoutube || !no.youtube_id) return
    let cancelado = false
    setFalhaYT(false)
    setSomVideo(false)
    setSomBloqueado(false)
    carregarYT().then(() => {
      const palco = ytPalcoRef.current
      if (cancelado || !palco || !window.YT) return
      palco.replaceChildren()
      const alvo = document.createElement('div')
      palco.appendChild(alvo)
      ytRef.current = new window.YT.Player(alvo, {
        videoId: no.youtube_id,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, mute: 1, rel: 0, controls: 1, playsinline: 1, origin: window.location.origin },
        events: { onReady: () => { if (!cancelado && !silenciouRef.current) aplicarSom(true, false) } },
      })
    }).catch(() => { if (!cancelado) setFalhaYT(true) })
    return () => {
      cancelado = true
      try { ytRef.current?.destroy() } catch { /* já destruído */ }
      ytRef.current = null
    }
  }, [ehYoutube, no.youtube_id, aplicarSom])

  // a 1ª interação REAL do usuário (clique, toque ou tecla) libera o som: o navegador só aceita som depois de um gesto de
  // verdade, e clique sintético (o da mão/pinça) não conta. O próprio botão de som fica de fora para não desfazer o clique dele.
  useEffect(() => {
    if (!ehYoutube && !ehVideo) return
    const aoInteragir = (e: Event) => {
      if (!e.isTrusted || silenciouRef.current) return
      if ((e.target as Element | null)?.closest?.('[data-som]')) return
      aplicarSom(true, false)
    }
    window.addEventListener('pointerdown', aoInteragir, { once: true })
    window.addEventListener('keydown', aoInteragir, { once: true })
    return () => { window.removeEventListener('pointerdown', aoInteragir); window.removeEventListener('keydown', aoInteragir) }
  }, [ehYoutube, ehVideo, no.id, aplicarSom])
  const rotuloSom = somVideo ? 'SOM DO VÍDEO: ON' : somBloqueado ? 'SOM BLOQUEADO: CLIQUE AQUI' : 'SOM DO VÍDEO: MUDO'
  const faixaRef = useRef<HTMLDivElement>(null)
  const pedido = no.tipo === 'imagem' || ehVideo ? porId.get(no.pedido || '') : undefined
  // linhagem: de onde esta imagem (ou vídeo) veio (as entradas do pedido que a gerou) e o que saiu dela (pedidos que a usaram)
  const pais = (pedido?.entradas || []).map((e) => porId.get(e)).filter((n) => n && (n.thumb || n.arquivo)) as No[]
  const filhos = useMemo(() => projeto.nos
    .filter((p) => p.tipo === 'pedido' && (p.entradas || []).includes(no.id))
    .map((p) => ({ p, imgs: (p.saidas || []).map((i) => porId.get(i)).filter((n) => n && (n.thumb || n.arquivo)) as No[] })),
  [projeto.nos, porId, no.id])
  const faixa = useMemo(() => irmas.map((id) => porId.get(id)!), [irmas, porId])
  // a miniatura atual fica sempre à vista
  useEffect(() => {
    faixaRef.current?.querySelector(`[data-id="${no.id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [no.id])
  const estado = no.estado || 'neutra'
  const comentarios = no.comentarios || []
  const pins = comentarios.filter((c) => c.pin)

  useEffect(() => { setPin(null); setTexto(''); setFoco(null) }, [id])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('textarea, input')) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.key === 'Escape') fechar()
      else if (e.key === ' ' && videoRef.current) { e.preventDefault(); alternarVideo() }
      else if (e.key === 'ArrowRight') irProxima()
      else if (e.key === 'ArrowLeft') irAnterior()
      else if ((no.tipo === 'imagem' || no.tipo === 'video') && !e.metaKey && !e.ctrlKey) {
        const e2 = estadoDaTecla(e.key)
        if (e2) mudar(no.id, { estado: alternarEstado(estado, e2) })
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar, irProxima, irAnterior, no, estado, mudar])

  const enviarComentario = async () => {
    if (!texto.trim()) return
    await acao(() => api.comentar(slug, no.id, texto.trim(), pin))
    setTexto('')
    setPin(null)
  }

  const clicarImagem = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()  // clicar na imagem marca um ponto; clicar no fundo volta ao canvas
    const r = e.currentTarget.getBoundingClientRect()
    const p: Pin = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    // no vídeo, o ponto guarda o segundo e pausa ali
    if (ehVideo && videoRef.current) { videoRef.current.pause(); p.t = Math.round(videoRef.current.currentTime * 100) / 100 }
    setPin(p)
    requestAnimationFrame(() => entrada.current?.focus())
  }

  return (
    <div className="viewer" onClick={fechar}>
      <div className="viewer-palco">
        {/* Barra Tática de Operação com 1 Mão (Alvos Grandes para Pinça 👌, Passar Página 📖 ou Gesto ✌️) */}
        <div className="viewer-barra-1mao" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="fui-btn-fechar-1mao" onClick={fechar} title="Fechar tela (Pinça 👌 aqui, Gesto ✌️ ou Esc)">
            <X size={16} /> FECHAR TELA (PINÇA 👌 / GESTO ✌️)
          </button>
          {irmas.length > 1 && (
            <>
              <button type="button" className="fui-btn-nav-1mao" onClick={irAnterior}>
                <ChevronLeft size={15} /> PÁG. ANTERIOR ({i + 1}/{irmas.length})
              </button>
              <button type="button" className="fui-btn-nav-1mao" onClick={irProxima}>
                PRÓXIMA PÁG. <ChevronRight size={15} />
              </button>
              <span className="fui-dica-folhear">
                <Hand size={13} color="#ff5500" /> PASSE A MÃO ⬅️ / ➡️ PARA FOLHEAR SLIDES
              </span>
            </>
          )}
          {(ehVideo || ehYoutube) && (
            <button
              type="button"
              data-som
              className={`fui-btn-nav-1mao ${somVideo ? 'ativo' : ''}`}
              onClick={() => aplicarSom(!somVideo)}
              title={somBloqueado ? 'O navegador bloqueou o som: um clique de mouse ou uma tecla libera' : 'Alternar o som do vídeo'}
            >
              {somVideo ? <Volume2 size={15} /> : <VolumeX size={15} />}
              {rotuloSom}
            </button>
          )}
          {ehArxiv && no.pdf_url && (
            <button type="button" className={`fui-btn-nav-1mao ${verPdfArxiv ? 'ativo' : ''}`} onClick={() => setVerPdfArxiv(!verPdfArxiv)}>
              <BookOpen size={14} /> {verPdfArxiv ? 'VER DOSSIÊ C4ISR' : 'ABRIR PDF ARXIV AO VIVO'}
            </button>
          )}
          {no.fonte_url && (
            <a href={no.fonte_url} target="_blank" rel="noreferrer" className="fui-btn-nav-1mao">
              <ExternalLink size={14} /> FONTE ORIGINAL
            </a>
          )}
        </div>

        <div className="palco-img">
        {avisoFlip && <div className="viewer-toast-flip">{avisoFlip}</div>}
        {irmas.length > 1 && (
          <button type="button" className="nav esq fui-nav-pagina" title="Página Anterior (← ou Passe a Mão para a Direita)" onClick={(e) => { e.stopPropagation(); irAnterior() }}>
            <ChevronLeft size={26} />
          </button>
        )}
        <div className={`viewer-img ${animFlip ? `flip-${animFlip}` : ''}`} onClick={clicarImagem} title="Clique para comentar num ponto · Passe a mão ⬅️/➡️ para mudar de página">
          {ehYoutube ? (
            <div className="fui-embed-palco" ref={ytPalcoRef} onClick={(e) => e.stopPropagation()}>
              {/* com youtube_id o player é montado por carregarYT() dentro deste contêiner (sem filhos do React); sem ele, o
                  embed antigo. Se o script do YouTube não carregar (sem internet), a mensagem abaixo substitui o player. */}
              {falhaYT && <p className="fui-yt-falha">Não consegui carregar o player do YouTube (sem internet?). Use FONTE ORIGINAL.</p>}
              {!no.youtube_id && no.embed_url && (
                <iframe src={no.embed_url} title={no.nome || no.id}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              )}
            </div>
          ) : ehArxiv && verPdfArxiv && no.pdf_url ? (
            <div className="fui-embed-palco" onClick={(e) => e.stopPropagation()}>
              <iframe src={no.pdf_url} title={no.nome || no.id} />
            </div>
          ) : ehVideo ? (
            <video ref={videoRef} src={arquivoUrl(slug, no.arquivo)} autoPlay muted loop playsInline
              onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                e.currentTarget.volume = 1.0
                setTotal(e.currentTarget.duration || 0)
                setSomVideo(false); setSomBloqueado(false)
                if (!silenciouRef.current) ligarSomLocal(e.currentTarget)  // sobe mudo (autoplay) e tenta o som; se recusarem, avisa
              }} onPlay={() => setRodando(true)} onPause={() => setRodando(false)} />
          ) : (
            <img src={arquivoUrl(slug, no.arquivo)} alt={no.nome || no.titulo || no.id} draggable={false} />
          )}
          {!ehYoutube && !(ehArxiv && verPdfArxiv) && pins.filter((c) => !ehVideo || c.pin?.t === undefined || Math.abs((c.pin.t ?? 0) - tempo) < 0.8 || foco === c.id).map((c) => (
            <span key={c.id} className={`pin ${c.autor} ${foco === c.id ? 'foco' : ''}`} style={{ left: `${c.pin!.x * 100}%`, top: `${c.pin!.y * 100}%` }}
              onMouseEnter={() => setFoco(c.id)} onMouseLeave={() => setFoco(null)}>
              <span>{comentarios.indexOf(c) + 1}</span>
            </span>
          ))}
          {pin && <span className="pin novo" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}><span>+</span></span>}
        </div>
        {ehVideo && (
          // controle mínimo: tocar/pausar, som, tempo e a linha do tempo (os pontos comentados aparecem nela)
          <div className="controle-video" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ico" title={rodando ? 'Pausar (espaço)' : 'Tocar (espaço)'}
              onClick={alternarVideo}>
              {rodando ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button type="button" data-som className="ico" title={somVideo ? 'Silenciar vídeo' : somBloqueado ? 'O navegador bloqueou o som: clique para liberar' : 'Ouvir som do vídeo'}
              onClick={() => aplicarSom(!somVideo)}>
              {somVideo ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <span className="tempo">{mmss(tempo)} / {mmss(duracao)}</span>
            <div className="trilha">
              <input type="range" min={0} max={duracao} step={0.01} value={tempo}
                onChange={(e) => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = Number(e.target.value) } }} aria-label="Posição" />
              {pins.filter((c) => c.pin?.t !== undefined).map((c) => (
                <span key={c.id} className="marca-tempo" style={{ left: `${((c.pin!.t ?? 0) / duracao) * 100}%` }} />
              ))}
            </div>
          </div>
        )}
        {irmas.length > 1 && (
          <button type="button" className="nav dir fui-nav-pagina" title="Próxima Página (→ ou Passe a Mão para a Esquerda)" onClick={(e) => { e.stopPropagation(); irProxima() }}>
            <ChevronRight size={26} />
          </button>
        )}
        </div>
        {faixa.length > 1 && (
          // filme estilo Finder: as irmãs (mesmo pedido) — ou, numa referência, as imagens que saíram dela
          <div className="faixa" ref={faixaRef} onClick={(e) => e.stopPropagation()}>
            {faixa.map((n) => (
              <button key={n.id} type="button" data-id={n.id} className={`quadrinho ${n.id === no.id ? 'atual' : ''} es-${n.estado || 'neutra'}`}
                title={`${n.id} ${n.nome || ''}`} onClick={() => navegar(n.id)}>
                <img src={arquivoUrl(slug, n.thumb || n.arquivo)} alt="" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="viewer-lado" onClick={(e) => e.stopPropagation()}>
        <div className="lado-topo">
          <button type="button" className="codigo" title="Copiar código" onClick={() => copiar(no.id)}>{no.id}</button>
          {irmas.length > 1 && <span className="mudo">{i + 1}/{irmas.length}</span>}
          <span className="cresce" />
          <button type="button" className="ico" title="Fechar (Esc)" onClick={fechar}><X size={18} /></button>
        </div>
        {(no.nome || no.titulo) && <h3>{no.nome || no.titulo}</h3>}

        <div className="lado-acoes">
          {(no.tipo === 'imagem' || ehVideo) && ESTADOS.map(({ e, t, I }) => (
            <button key={e} type="button" className={`ico grande ${estado === e ? `on ${e}` : ''}`} title={t}
              onClick={() => mudar(no.id, { estado: alternarEstado(estado, e) })}>
              <I size={18} />
            </button>
          ))}
          <span className="cresce" />
          {projeto.avancos?.[no.id] && (
            <a className="secundario-ico fogo" href={rotaFogo(slug, no.id)} title="Em desenvolvimento: abrir a página desta imagem (vídeos, HTML)">
              <Flame size={15} />
            </a>
          )}
          {!ehVideo && (
            <button type="button" className="secundario-ico" title="Pedido de vídeo a partir desta imagem (dar vida)"
              onClick={async () => { fechar(); await pedidoVideo(no.id) }}>
              <Clapperboard size={15} />
            </button>
          )}
          {!ehVideo && (
            <button type="button" className="primario" title="Novo pedido a partir desta imagem"
              onClick={async () => { fechar(); await novoPedido([no.id]) }}>
              <GitBranchPlus size={15} /> Pedido
            </button>
          )}
        </div>

        {(no.tipo === 'imagem' || ehVideo) && (
          <div className="meta">
            {pedido && <span title="Pedido de origem">{pedido.id}</span>}
            {no.modelo && <span>{no.modelo.split('/')[1]}</span>}
            {no.largura && <span>{no.largura}×{no.altura}</span>}
            {no.custo ? <span>{dinheiro(no.custo)}</span> : null}
            {no.prompt && (
              <button type="button" className={`ico ${verPrompt ? 'on' : ''}`} title="Prompt" onClick={() => setVerPrompt(!verPrompt)}>
                <Quote size={14} />
              </button>
            )}
          </div>
        )}
        {verPrompt && no.prompt && <p className="prompt-texto">{no.prompt}</p>}
        {pedido?.intencao && !verPrompt && <p className="intencao-origem" title="Intenção do pedido">{pedido.intencao}</p>}

        {pais.length > 0 && (
          <section className="linhagem">
            <h4>Veio de</h4>
            <div className="miniaturas">
              {pais.map((n) => (
                <button key={n.id} type="button" className={`mini ${n.tipo}`} title={`${n.id} ${n.nome || n.titulo || ''}`} onClick={() => navegar(n.id)}>
                  <img src={arquivoUrl(slug, n.thumb || n.arquivo)} alt="" /><span>{n.id}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {filhos.length > 0 && (
          <section className="linhagem">
            <h4>Saiu daqui</h4>
            {filhos.map(({ p, imgs }) => (
              <div key={p.id} className="ramo">
                <p title={p.intencao}>{p.intencao || p.id}</p>
                <div className="miniaturas">
                  {imgs.length ? imgs.map((n) => (
                    <button key={n.id} type="button" className={`mini es-${n.estado || 'neutra'}`} title={`${n.id} ${n.nome || ''}`} onClick={() => navegar(n.id)}>
                      <img src={arquivoUrl(slug, n.thumb || n.arquivo)} alt="" /><span>{n.id}</span>
                    </button>
                  )) : <span className="mudo">{p.status === 'rascunho' ? 'rascunho' : p.status === 'concluido' ? 'sem imagens' : 'gerando…'}</span>}
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="comentarios">
          {comentarios.map((c, k) => (
            <div key={c.id} className={`comentario ${c.autor} ${foco === c.id ? 'foco' : ''}`}
              onMouseEnter={() => setFoco(c.id)} onMouseLeave={() => setFoco(null)}>
              {c.pin ? <span className="num">{k + 1}</span> : <span className="num geral" />}
              {c.pin?.t !== undefined && (
                <button type="button" className="tempo-chip" title="Ir para este momento"
                  onClick={() => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = c.pin!.t! } }}>{mmss(c.pin.t)}</button>
              )}
              <p>{c.texto}</p>
              {c.autor === 'voce' && (
                <button type="button" className="ico sutil" title="Apagar" onClick={() => acao(() => api.apagarComentario(slug, no.id, c.id))}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={`comentar ${pin ? 'com-pin' : ''}`}>
          {pin && <button type="button" className="pin-chip" title="Tirar o ponto" onClick={() => setPin(null)}>{pin.t !== undefined ? mmss(pin.t) : '+'} <X size={10} /></button>}
          <textarea ref={entrada} rows={2} value={texto} placeholder={pin ? 'Sobre este ponto…' : 'Comentar…'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarComentario() } }} />
          <button type="button" className="enviar" disabled={!texto.trim()} onClick={enviarComentario} title="Comentar (↵)"><ArrowUp size={15} /></button>
        </div>
      </aside>
    </div>
  )
}

/** Segundos → m:ss (o tempo do vídeo e dos comentários feitos nele). */
function mmss(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
}
