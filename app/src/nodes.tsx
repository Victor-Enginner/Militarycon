import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import {
  AppWindow, ArrowUp, Box, Check, ChevronDown, ExternalLink, Globe, LayoutDashboard, Link2, LoaderCircle, Maximize2, MessageCircle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clapperboard, Flame, Minus, Play, Plus, Quote, Radar, RotateCw, Smartphone, Sparkles, Star, Trash2, TriangleAlert, Volume2, VolumeX, X, Archive,
} from 'lucide-react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, arquivoUrl, dinheiro, rotaFogo, urlModelo, type ModeloVideo, type No } from './api'
import { useCanvas } from './ctx'
import { ESTADOS, alternarEstado } from './estados'
import { LARG, descendentes, ehPonto, medidaImagem, ocultosSob, razaoDe } from './layout'

export type NoRF = Node<{ no: No }>

const ICONE_TIPO = { site: Globe, app: Smartphone, dashboard: LayoutDashboard, webapp: AppWindow }

function Alcas({ entrada = true, saida = true }: { entrada?: boolean; saida?: boolean }) {
  return (
    <>
      {entrada && <Handle type="target" position={Position.Left} className="alca" />}
      {saida && <Handle type="source" position={Position.Right} className="alca" />}
    </>
  )
}

function Botao({ titulo, onClick, children, className = '', disabled }: {
  titulo: string; onClick: (e: React.MouseEvent) => void; children: ReactNode; className?: string; disabled?: boolean
}) {
  return (
    <button type="button" className={`ico nodrag ${className}`} title={titulo} aria-label={titulo} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(e) }} onDoubleClick={(e) => e.stopPropagation()}>
      {children}
    </button>
  )
}

/** O botão do galho, à direita do nó: recolhe/expande tudo o que saiu dele (mostra +N quando fechado). */
function Galho({ no }: { no: No }) {
  const { arv, alternar } = useCanvas()
  const n = descendentes(arv, no.id)
  const ocultos = ocultosSob(arv, no)
  if (!n) return null
  return (
    <button type="button" className={`galho nodrag ${ocultos ? 'fechado' : ''}`}
      title={ocultos ? `Mostrar ${ocultos} nós escondidos` : 'Recolher este galho'}
      onClick={(e) => { e.stopPropagation(); alternar(no.id) }} onDoubleClick={(e) => e.stopPropagation()}>
      {ocultos ? <><span>{ocultos}</span><ChevronRight size={14} /></> : <ChevronLeft size={14} />}
    </button>
  )
}

/** Recolher/expandir o galho, para as barras de ação do nó (some quando o nó não tem filhos). */
function BotaoGalho({ no }: { no: No }) {
  const { arv, alternar } = useCanvas()
  const n = descendentes(arv, no.id)
  const ocultos = ocultosSob(arv, no)
  if (!n) return null
  return (
    <Botao titulo={ocultos ? `Mostrar o bloco (${ocultos} nós escondidos)` : `Ocultar o bloco (${n} nós)`} className={ocultos ? 'on' : ''}
      onClick={() => alternar(no.id)}>
      {ocultos ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
    </Botao>
  )
}

function Codigo({ id }: { id: string }) {
  const { copiar } = useCanvas()
  return (
    <button type="button" className="codigo nodrag" title="Copiar código para citar no chat"
      onClick={(e) => { e.stopPropagation(); copiar(id) }}>
      {id}
    </button>
  )
}

// ---------- Brief ----------

export const BriefNode = memo(function BriefNode({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { estado, mudar, acao, slug, painel, novoPedido, novaTela, enviar } = useCanvas()
  const Icone = ICONE_TIPO[estado.projeto.tipo] || AppWindow
  const texto = estado.brief.replace(/^#.*\n/, '').replace(/^>.*$/gm, '').replace(/\*\*|__|`/g, '').replace(/^\s*[-*]\s+/gm, '· ').replace(/\n{2,}/g, '\n').trim()
  const dirs = no.direcoes || []
  const ativas = dirs.filter((d) => d.ativa)
  const telas = estado.nos.filter((n) => n.tipo === 'tela')
  const ocupado = no.status === 'enviado' || no.status === 'trabalhando'
  const inicio = useRef({ x: 0, y: 0 })  // clique sem arrastar abre o brief; arrastar move o nó

  const gerar = async () => {
    const p = await novoPedido([], telas[0]?.id, {
      variacoes: ativas.map((d) => ({ nome: d.nome, tese: d.tese })),
      intencao: `Exploração divergente: ${ativas.map((d) => d.nome).join(' · ')}`,
      quantidade: ativas.length,
    })
    if (p) await enviar(p.id)
  }

  return (
    <div className={`no brief ${selected ? 'sel' : ''}`} style={{ width: LARG.brief }}>
      <div className="brief-topo">
        <span className="tipo-ico" title={estado.projeto.tipo}><Icone size={16} /></span>
        <h2>{estado.projeto.nome}</h2>
        <Codigo id={no.id} />
      </div>
      <button type="button" className={`brief-texto ${texto ? '' : 'vazio'}`} title="Editar o brief (arraste para mover)"
        onPointerDown={(e) => { inicio.current = { x: e.clientX, y: e.clientY } }}
        onClick={(e) => { if (Math.hypot(e.clientX - inicio.current.x, e.clientY - inicio.current.y) < 4) painel('brief') }}>
        {texto || 'Descreva o projeto…'}
      </button>
      {dirs.length > 0 && (
        <div className="direcoes nodrag">
          {dirs.map((d, i) => (
            <button key={d.nome + i} type="button" className={`chip ${d.ativa ? 'on' : ''}`} title={d.tese}
              onClick={() => mudar(no.id, { direcoes: dirs.map((x, j) => (j === i ? { ...x, ativa: !x.ativa } : x)) })}>
              {d.nome}
            </button>
          ))}
        </div>
      )}
      <div className="brief-acoes">
        {ocupado ? (
          <span className="status-claude"><LoaderCircle size={14} className="gira" /> Claude</span>
        ) : dirs.length ? (
          <>
            <Botao titulo="Propor outras direções" onClick={() => acao(() => api.enviar(slug, no.id))}><RotateCw size={15} /></Botao>
            <button type="button" className="primario nodrag" disabled={!ativas.length} onClick={gerar}
              title={`Gerar uma imagem por direção (${ativas.length})`}>
              <Sparkles size={15} /> {ativas.length}
            </button>
          </>
        ) : (
          <button type="button" className="primario nodrag" disabled={!texto} onClick={() => acao(() => api.enviar(slug, no.id))}
            title="O Claude propõe direções de estilo a partir do brief">
            <Sparkles size={15} /> Direções
          </button>
        )}
      </div>
      <Botao titulo="Nova tela" className="mais-lateral" onClick={novaTela}>
        <Plus size={16} />
      </Botao>
      <Galho no={no} />
      <Alcas entrada={false} />
    </div>
  )
})

// ---------- Tela ----------

export const TelaNode = memo(function TelaNode({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { estado, mudar, novoPedido } = useCanvas()
  const [editando, setEditando] = useState(false)
  const Icone = ICONE_TIPO[estado.projeto.tipo] || AppWindow
  return (
    <div className={`no tela ${selected ? 'sel' : ''}`} style={{ width: LARG.tela }} onDoubleClick={() => setEditando(true)}>
      <Icone size={15} className="tela-ico" />
      {editando ? (
        <input className="nodrag tela-input" autoFocus defaultValue={no.titulo}
          onBlur={(e) => { setEditando(false); if (e.target.value.trim()) mudar(no.id, { titulo: e.target.value.trim() }) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }} />
      ) : (
        <span className="tela-nome" title="Duplo clique para renomear">{no.titulo}</span>
      )}
      <Botao titulo="Novo pedido nesta tela" className="mais" onClick={() => novoPedido([], no.id)}><Plus size={15} /></Botao>
      <Galho no={no} />
      <Alcas />
    </div>
  )
})

// ---------- Pedido ----------

function Entradas({ no, editavel }: { no: No; editavel: boolean }) {
  const { porId, slug, mudar, abrir } = useCanvas()
  const ent = (no.entradas || []).map((e) => porId.get(e)).filter(Boolean) as No[]
  if (!ent.length) return null
  return (
    <div className="entradas">
      {ent.map((e) => (
        <div key={e.id} className={`entrada ${e.tipo}`} title={e.nome || e.titulo || e.id}>
          <img src={arquivoUrl(slug, e.thumb || e.arquivo)} alt="" draggable={false} onDoubleClick={() => abrir(e.id)} />
          {editavel && (
            <button type="button" className="tira nodrag" title="Tirar do pedido"
              onClick={() => mudar(no.id, { entradas: (no.entradas || []).filter((x) => x !== e.id) })}>
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Seletor({ valor, opcoes, titulo, onChange }: {
  valor: string; opcoes: { v: string; r: string }[]; titulo: string; onChange: (v: string) => void
}) {
  const atual = opcoes.find((o) => o.v === valor)
  return (
    <label className="seletor nodrag" title={titulo}>
      <span>{atual?.r || valor}</span>
      <ChevronDown size={12} />
      <select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={titulo}>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}
      </select>
    </label>
  )
}

/** Pedido: card inteiro — ou, no modo "pontos", o concluído vira um ponto na linha que abre o card no hover/clique. */
export const PedidoNode = memo(function PedidoNode(props: NodeProps<NoRF>) {
  const { pontos } = useCanvas()
  return pontos && ehPonto(props.data.no) ? <PedidoPonto {...props} /> : <PedidoCheio {...props} />
})

function PedidoCheio({ id, data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { slug, estado, mudar, apagar, acao, enviar, focar, limparFoco } = useCanvas()
  const rascunho = no.status === 'rascunho'
  const [texto, setTexto] = useState(no.intencao || '')
  const ref = useRef<HTMLTextAreaElement>(null)
  const tempo = useRef<number>(0)

  useEffect(() => { if (document.activeElement !== ref.current) setTexto(no.intencao || '') }, [no.intencao])
  useEffect(() => {
    // o React Flow deixa o nó invisível até medi-lo: tenta o foco até pegar
    if (focar !== id) return
    let n = 0
    const t = window.setInterval(() => {
      ref.current?.focus()
      if (document.activeElement === ref.current || ++n > 30) { window.clearInterval(t); limparFoco() }
    }, 40)
    return () => window.clearInterval(t)
  }, [focar, id, limparFoco])
  useEffect(() => {
    const t = ref.current
    if (t) { t.style.height = '0px'; t.style.height = `${Math.min(220, t.scrollHeight)}px` }
  }, [texto])

  const salvar = (v: string) => {
    window.clearTimeout(tempo.current)
    tempo.current = window.setTimeout(() => mudar(no.id, { intencao: v }), 500)
  }
  const disparar = async () => {
    window.clearTimeout(tempo.current)
    if (texto !== no.intencao) await mudar(no.id, { intencao: texto })
    await enviar(no.id)
  }
  const video = no.midia === 'video'
  const podeEnviar = video ? !!(no.modelos || []).length && !!(no.entradas || []).length
    : !!(texto.trim() || (no.entradas || []).length || (no.variacoes || []).length)
  const modelos = Object.entries(estado.modelos).map(([v, m]) => ({ v, r: m.nome }))
  const qtd = no.quantidade || 3
  const variacoes = no.variacoes || []
  // comum aos rascunhos de imagem e de vídeo: o campo da intenção e o fim da barra (literal · apagar · enviar)
  const campo = (placeholder: string) => (
    <textarea ref={ref} className="nodrag nowheel intencao" value={texto} rows={2} placeholder={placeholder}
      onChange={(e) => { setTexto(e.target.value); salvar(e.target.value) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && podeEnviar) disparar() }} />
  )
  const fimBarra = (dicaLiteral: string, estimativa?: ReactNode) => (
    <>
      <Botao titulo={no.literal ? 'Literal: vai exatamente o seu texto' : `${dicaLiteral} (clique para literal)`}
        className={`literal ${no.literal ? 'on' : ''}`} onClick={() => mudar(no.id, { literal: !no.literal })}>
        <Quote size={14} />
      </Botao>
      <span className="cresce" />
      {estimativa}
      {!video && (
        <Botao
          titulo="Delegar para a Frota de Agentes de Pesquisa Web + Calibração Groot 1"
          className="fui-btn-pesquisa"
          disabled={!texto.trim()}
          onClick={async () => {
            if (!texto.trim()) return
            await acao(() => api.pesquisar(slug, { query: texto.trim(), entradas: no.entradas, tela: no.tela || undefined, quantidade: qtd }))
            await apagar(no.id)
          }}
        >
          <Radar size={14} />
        </Botao>
      )}
      <Botao titulo="Apagar rascunho (⌘Z desfaz)" className="sutil" onClick={() => apagar(no.id)}><Trash2 size={14} /></Botao>
      <button type="button" className="enviar nodrag" disabled={!podeEnviar} onClick={disparar} title="Enviar ao Claude (⌘↵)">
        <ArrowUp size={16} />
      </button>
    </>
  )

  return (
    <div className={`no pedido st-${no.status} ${video ? 'pedido-video' : ''} ${selected ? 'sel' : ''}`} style={{ width: LARG.pedido }}>
      {video && <span className="selo-midia" title="Pedido de vídeo"><Clapperboard size={12} /> vídeo</span>}
      <Entradas no={no} editavel={rascunho} />
      {rascunho && video ? (
        <>
          {campo('Como a tela ganha vida? (o que se mexe, o que acende…)')}
          <ModelosVideo no={no} />
          <div className="pedido-barra">
            <Seletor titulo="Duração" valor={String(no.duracao || 6)} onChange={(v) => mudar(no.id, { duracao: Number(v) })}
              opcoes={[4, 5, 6, 8, 10].map((d) => ({ v: String(d), r: `${d}s` }))} />
            <Seletor titulo="Resolução" valor={no.resolucao === '1080p' ? '1080p' : '720p'} onChange={(v) => mudar(no.id, { resolucao: v })}
              opcoes={[{ v: '720p', r: '720p' }, { v: '1080p', r: '1080p' }]} />
            {fimBarra('O Claude reescreve como prompt de vídeo, com a interface protegida',
              <span className="estimativa" title="Estimativa (sem áudio)">≈ {dinheiro(custoVideo(no, estado.modelos_video))}</span>)}
          </div>
        </>
      ) : rascunho ? (
        <>
          {variacoes.length > 0 && (
            <div className="direcoes">{variacoes.map((v) => <span key={v.nome} className="chip on" title={v.tese}>{v.nome}</span>)}</div>
          )}
          {campo((no.entradas || []).length ? 'O que mudar?' : 'O que você quer ver?')}
          <div className="pedido-barra">
            <div className="passo nodrag" title="Quantas imagens">
              <button type="button" onClick={() => mudar(no.id, { quantidade: Math.max(1, qtd - 1) })} aria-label="menos"><Minus size={12} /></button>
              <span>{qtd}</span>
              <button type="button" onClick={() => mudar(no.id, { quantidade: Math.min(12, qtd + 1) })} aria-label="mais"><Plus size={12} /></button>
            </div>
            <Seletor titulo="Formato" valor={no.aspecto || '16:9'} onChange={(v) => mudar(no.id, { aspecto: v })}
              opcoes={estado.aspectos.map((a) => ({ v: a, r: a }))} />
            <Seletor titulo="Modelo" valor={no.modelo || ''} onChange={(v) => mudar(no.id, { modelo: v })} opcoes={modelos} />
            {fimBarra('O Claude reescreve como prompt completo')}
          </div>
        </>
      ) : <PedidoLido no={no} />}
      <Codigo id={no.id} />
      <Galho no={no} />
      <Alcas />
    </div>
  )
}

/** O pedido já enviado: a intenção, o status e os prompts usados (no card inteiro e no card que abre do ponto). */
function PedidoLido({ no }: { no: No }) {
  const { enviar } = useCanvas()
  const [verPrompt, setVerPrompt] = useState(false)
  const prompts = (no.variacoes || []).filter((v) => v.prompt)
  return (
    <>
      {no.intencao && <p className="intencao-lida">{no.intencao}</p>}
      {verPrompt && (
        <div className="prompts nodrag nowheel">
          {prompts.length ? prompts.map((v, i) => (
            <div key={i}>{v.nome && <b>{v.nome}</b>}<p>{v.prompt}</p></div>
          )) : <p className="mudo">Sem prompt registrado.</p>}
        </div>
      )}
      <div className="pedido-barra lida">
        <StatusPedido no={no} />
        <span className="cresce" />
        {no.legado && <span className="selo" title="Importado: gerado antes do Neo Stitch"><Archive size={12} /></span>}
        {(prompts.length > 0 || no.status === 'concluido') && (
          <Botao titulo={verPrompt ? 'Esconder prompts' : 'Ver os prompts usados'} className={verPrompt ? 'on' : ''} onClick={() => setVerPrompt(!verPrompt)}>
            <Quote size={14} />
          </Botao>
        )}
        {no.status === 'erro' && (
          <Botao titulo="Tentar de novo" onClick={() => enviar(no.id)}><RotateCw size={14} /></Botao>
        )}
        <BotaoGalho no={no} />
      </div>
    </>
  )
}

/** O pedido concluído como um ponto na linha entre a imagem de origem e as que saíram dele.
 *  Mouse em cima abre o card por cima do canvas; clicar deixa aberto (outro clique fecha). */
function PedidoPonto({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { arv } = useCanvas()
  const [fixo, setFixo] = useState(false)
  const [sobre, setSobre] = useState(false)
  const fechar = useRef(0)
  const entra = () => { window.clearTimeout(fechar.current); setSobre(true) }
  const sai = () => { fechar.current = window.setTimeout(() => setSobre(false), 160) }
  const aberto = fixo || sobre
  const video = no.midia === 'video'
  return (
    <div className={`no pedido-ponto ${video ? 'video' : ''} ${aberto ? 'aberto' : ''} ${selected ? 'sel' : ''}`}
      onMouseEnter={entra} onMouseLeave={sai}>
      <button type="button" className="ponto nodrag" title={no.intencao || no.id} aria-expanded={aberto}
        onClick={(e) => { e.stopPropagation(); setFixo(!fixo) }} onDoubleClick={(e) => e.stopPropagation()}>
        {video ? <Clapperboard size={11} /> : <Sparkles size={11} />}
      </button>
      {aberto && (
        <div className="pedido-pop" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className={`no pedido st-${no.status} ${video ? 'pedido-video' : ''}`} style={{ width: LARG.pedido }}>
            {video && <span className="selo-midia" title="Pedido de vídeo"><Clapperboard size={12} /> vídeo</span>}
            <Entradas no={no} editavel={false} />
            <PedidoLido no={no} />
            <Codigo id={no.id} />
          </div>
        </div>
      )}
      {ocultosSob(arv, no) > 0 && <Galho no={no} />}
      <Alcas />
    </div>
  )
}
/** Estimativa do pedido de vídeo: o custo medido de 6 s de cada modelo, proporcional à duração que ele de fato faz
 *  (a suportada mais próxima: os Hailuo não descem de 5 s) · 1080p ≈ ×1,6. */
function custoVideo(no: No, cat: Record<string, ModeloVideo>) {
  const fator = no.resolucao === '1080p' ? 1.6 : 1
  const pedida = no.duracao || 6
  return (no.modelos || []).reduce((s, id) => {
    const m = cat[id]
    if (!m) return s + 0.1 * pedida
    const dur = m.duracoes?.length ? m.duracoes.reduce((a, b) => (Math.abs(b - pedida) < Math.abs(a - pedida) ? b : a)) : pedida
    return s + (m.custo_6s ? m.custo_6s / 6 : m.preco_s) * dur * fator
  }, 0)
}

/** Os modelos de vídeo do pedido: chips (clique tira) + seletor para adicionar (com o custo de 6 s). */
function ModelosVideo({ no }: { no: No }) {
  const { estado, mudar } = useCanvas()
  const cat = estado.modelos_video || {}
  const marcados = no.modelos || []
  const resto = Object.entries(cat).filter(([id]) => !marcados.includes(id))
  return (
    <div className="modelos-video nodrag">
      {marcados.map((m) => (
        <button key={m} type="button" className="chip on" title={`${m} · ~${dinheiro(cat[m]?.custo_6s || 0)} por 6 s${cat[m]?.ranking ? ` · ${cat[m].ranking}` : ''}${cat[m]?.teste ? ` · teste: ${cat[m].teste}` : ''} — clique para tirar`}
          onClick={() => mudar(no.id, { modelos: marcados.filter((x) => x !== m) })}>
          {cat[m]?.nome || m} <X size={10} />
        </button>
      ))}
      <label className="chip mais-modelo" title="Adicionar um modelo">
        <Plus size={11} /> modelo
        <select value="" onChange={(e) => e.target.value && mudar(no.id, { modelos: [...marcados, e.target.value] })} aria-label="Adicionar modelo">
          <option value="">Adicionar…</option>
          {resto.map(([id, m]) => <option key={id} value={id}>{m.nome} · {dinheiro(m.custo_6s)}/6s{m.nota ? ` · ${m.nota}` : ''}</option>)}
        </select>
      </label>
    </div>
  )
}

function StatusPedido({ no }: { no: No }) {
  if (no.status === 'enviado') return <span className="status fila" title="Na fila do Claude"><span className="pulso" /> fila</span>
  if (no.status === 'trabalhando') return <span className="status" title="O Claude está gerando"><LoaderCircle size={14} className="gira" /></span>
  if (no.status === 'erro') return <span className="status erro" title={no.erro}><TriangleAlert size={14} /> {no.erro?.slice(0, 40)}</span>
  return (
    <span className="status ok" title={`${(no.saidas || []).length} imagens`}>
      <Check size={14} /> {(no.saidas || []).length} {no.custo ? `· ${dinheiro(no.custo)}` : ''}
    </span>
  )
}

// ---------- Imagem e referência ----------

/** Os botões favorita/aprovada/descartada da barra de ações de uma imagem ou vídeo. */
function BotoesEstado({ no }: { no: No }) {
  const { mudar } = useCanvas()
  const estado = no.estado || 'neutra'
  return (
    <>
      {ESTADOS.map(({ e, t, I }) => (
        <Botao key={e} titulo={t} className={estado === e ? `on ${e}` : ''} onClick={() => mudar(no.id, { estado: alternarEstado(estado, e) })}>
          <I size={14} />
        </Botao>
      ))}
    </>
  )
}

export const ImagemNode = memo(function ImagemNode({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { slug, abrir } = useCanvas()
  const [ytTocando, setYtTocando] = useState(false)
  const { w, h } = medidaImagem(no)
  const estado = no.estado || 'neutra'
  const n = no.comentarios?.length || 0
  return (
    <div className={`no imagem es-${estado} ${selected ? 'sel' : ''}`} style={{ width: w }} onDoubleClick={() => abrir(no.id)}>
      <div className="quadro" style={{ height: no.gerando || no.erro ? Math.round(w / razaoDe(no.aspecto)) : h }}>
        {no.gerando ? (
          <div className="brilho" title="Gerando…" />
        ) : no.erro ? (
          <div className="falhou" title={no.erro}><TriangleAlert size={18} /></div>
        ) : ytTocando && no.subtipo === 'youtube' && (no.youtube_id || no.embed_url) ? (
          <iframe
            className="nodrag"
            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'auto' }}
            src={no.youtube_id ? `https://www.youtube.com/embed/${no.youtube_id}?autoplay=1&mute=0&rel=0` : no.embed_url}
            title={no.nome || no.id}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <img src={arquivoUrl(slug, no.thumb || no.arquivo)} alt={no.nome || no.id} draggable={false} />
        )}
        {estado === 'favorita' && <span className="marca fav"><Star size={11} fill="currentColor" /></span>}
        {estado === 'aprovada' && <span className="marca ok"><Check size={12} strokeWidth={3} /></span>}
        {no.groot_prob != null && (
          <span className={`selo-groot ${no.groot_prob >= 0.85 ? 'alta' : ''}`} title={no.groot_veredito || 'Calibração Groot 1'}>
            G1 · {no.groot_prob.toFixed(3)}
          </span>
        )}
        {no.subtipo === 'youtube' && (
          <button
            type="button"
            className="selo-subtipo youtube nodrag"
            title={ytTocando ? 'Parar vídeo na aba' : 'Tocar vídeo com som direto nesta aba!'}
            onClick={(e) => { e.stopPropagation(); setYtTocando(!ytTocando) }}
          >
            {ytTocando ? <Volume2 size={10} /> : <Play size={10} fill="currentColor" />}
            {ytTocando ? 'TOCANDO COM SOM (PARAR)' : 'OUVIR VÍDEO AQUI'}
          </button>
        )}
        {no.subtipo === 'arxiv' && (
          <button
            type="button"
            className="selo-subtipo arxiv nodrag"
            title="Abrir Dossiê Científico e PDF ArXiv.org"
            onClick={(e) => { e.stopPropagation(); abrir(no.id) }}
          >
            📄 {no.arxiv_id || 'ARXIV PAPER'}
          </button>
        )}
        {(no.subtipo === 'noticia' || no.subtipo === 'wiki' || no.subtipo === 'paper' || no.subtipo === 'grafico') && no.fonte_url && (
          // item de texto: o selo leva à matéria original (a gente guarda título, resumo e link, não a foto do veículo)
          <a
            href={no.fonte_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`selo-subtipo texto ${no.subtipo} nodrag`}
            title={`Abrir a fonte original: ${no.fonte_nome ?? no.fonte_url}`}
            onClick={(e) => e.stopPropagation()}
          >
            {no.subtipo === 'noticia' ? 'NOTÍCIA' : no.subtipo === 'wiki' ? 'WIKIPEDIA' : no.subtipo === 'grafico' ? 'GRÁFICO' : 'ARTIGO'}
            {no.fonte_nome ? ` · ${no.fonte_nome.slice(0, 22)}` : ''} ↗
          </a>
        )}
        {!no.gerando && (
          <div className="acoes">
            <Botao titulo="Abrir em Tela Cheia com Som (Duplo Pinch)" onClick={() => abrir(no.id)}>
              <Maximize2 size={13} />
            </Botao>
            {no.fonte_url && (
              <a
                href={no.fonte_url}
                target="_blank"
                rel="noreferrer"
                className="ico nodrag"
                title={`Abrir referência original: ${no.fonte_url}`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={13} />
              </a>
            )}
            <BotoesEstado no={no} />
            <BotaoGalho no={no} />
          </div>
        )}
        <div className="rodape">
          <Codigo id={no.id} />
          {no.nome && <span className="nome">{no.nome}</span>}
          <span className="cresce" />
          {n > 0 && <span className="bolha" title={`${n} comentário(s)`}><MessageCircle size={11} /> {n}</span>}
          {!no.gerando && no.arquivo && (
            <button
              type="button"
              className="fui-btn-abrir-card nodrag"
              title="Abrir aba em Tela Cheia com Som (Pinça 👌 aqui)"
              onClick={(e) => { e.stopPropagation(); abrir(no.id) }}
            >
              <Maximize2 size={10} /> ABRIR
            </button>
          )}
        </div>
        <SeloVideos no={no} />
      </div>
      <Galho no={no} />
      <Alcas />
    </div>
  )
})

/** Imagem que avançou (virou vídeo/HTML): selo de fogo no canto — abre a página de desenvolvimento dela. */
function SeloVideos({ no }: { no: No }) {
  const { slug, estado } = useCanvas()
  const a = estado.avancos?.[no.id]
  if (!a) return null
  return (
    <a className="selo-videos fogo nodrag" href={rotaFogo(slug, no.id)}
      title={`Em desenvolvimento: ${a.videos.length} vídeo(s)${a.impl.length ? ` · ${a.impl.length} HTML` : ''} — abrir`}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Flame size={11} /> {a.videos.length || ''}
    </a>
  )
}

export const RefNode = memo(function RefNode({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { slug, abrir, apagar } = useCanvas()
  const { w, h } = medidaImagem(no)
  const n = no.comentarios?.length || 0
  return (
    <div className={`no imagem ref ${selected ? 'sel' : ''}`} style={{ width: w }} onDoubleClick={() => abrir(no.id)}>
      <div className="quadro" style={{ height: h }}>
        <img src={arquivoUrl(slug, no.thumb || no.arquivo)} alt={no.titulo} draggable={false} />
        <span className="marca refm" title="Referência"><Link2 size={12} /></span>
        <div className="acoes">
          <BotaoGalho no={no} />
          <Botao titulo="Apagar (⌘Z desfaz)" onClick={() => apagar(no.id)}><Trash2 size={14} /></Botao>
        </div>
        <div className="rodape">
          <Codigo id={no.id} />
          {no.titulo && <span className="nome">{no.titulo}</span>}
          <span className="cresce" />
          {n > 0 && <span className="bolha"><MessageCircle size={11} /> {n}</span>}
        </div>
      </div>
      <Galho no={no} />
      <Alcas />
    </div>
  )
})

/** Vídeo gerado: mostra um quadro; com o mouse em cima ou clicando em ouvir, toca com ou sem som. */
export const VideoNode = memo(function VideoNode({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { slug, abrir } = useCanvas()
  const [tocando, setTocando] = useState(false)
  const [comSom, setComSom] = useState(false)
  const { w, h } = medidaImagem(no)
  const estado = no.estado || 'neutra'
  const n = no.comentarios?.length || 0
  return (
    <div className={`no imagem video es-${estado} ${selected ? 'sel' : ''}`} style={{ width: w }} onDoubleClick={() => abrir(no.id)}
      onMouseEnter={() => setTocando(true)} onMouseLeave={() => { if (!comSom) setTocando(false) }}>
      <div className="quadro" style={{ height: h }}>
        {no.gerando ? (
          <div className="brilho" title="Gerando vídeo…" />
        ) : no.erro ? (
          <div className="falhou" title={no.erro}><TriangleAlert size={18} /></div>
        ) : (
          <>
            <img src={arquivoUrl(slug, no.thumb || '')} alt={no.nome || no.id} draggable={false} />
            {(tocando || comSom) && no.arquivo && <video src={arquivoUrl(slug, no.arquivo)} autoPlay muted={!comSom} loop playsInline />}
          </>
        )}
        <span className={`marca ${estado === 'aprovada' ? 'ok' : estado === 'favorita' ? 'fav' : 'play'}`}>
          {estado === 'aprovada' ? <Check size={12} strokeWidth={3} /> : estado === 'favorita' ? <Star size={11} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
        </span>
        {no.groot_prob != null && (
          <span className={`selo-groot ${no.groot_prob >= 0.85 ? 'alta' : ''}`} title={no.groot_veredito || 'Calibração Groot 1'}>
            G1 · {no.groot_prob.toFixed(3)}
          </span>
        )}
        {!no.gerando && (
          <div className="acoes">
            <Botao titulo={comSom ? 'Silenciar som do vídeo na aba' : 'Ouvir som do vídeo direto na aba'} className={comSom ? 'on' : ''}
              onClick={() => { const nv = !comSom; setComSom(nv); setTocando(nv) }}>
              {comSom ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </Botao>
            <Botao titulo="Abrir vídeo com som em Tela Cheia" onClick={() => abrir(no.id)}>
              <Maximize2 size={13} />
            </Botao>
            {no.fonte_url && (
              <a
                href={no.fonte_url}
                target="_blank"
                rel="noreferrer"
                className="ico nodrag"
                title={`Abrir referência original: ${no.fonte_url}`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={13} />
              </a>
            )}
            <BotoesEstado no={no} />
          </div>
        )}
        <div className="rodape">
          <Codigo id={no.id} />
          <span className="nome">{no.nome}</span>
          <span className="cresce" />
          {no.custo ? <span className="bolha">{dinheiro(no.custo)}</span> : null}
          {n > 0 && <span className="bolha"><MessageCircle size={11} /> {n}</span>}
          {!no.gerando && no.arquivo && (
            <button
              type="button"
              className="fui-btn-abrir-card nodrag"
              title="Abrir vídeo em Tela Cheia com Som (Pinça 👌 aqui)"
              onClick={(e) => { e.stopPropagation(); abrir(no.id) }}
            >
              <Maximize2 size={10} /> ABRIR
            </button>
          )}
        </div>
      </div>
      <Galho no={no} />
      <Alcas />
    </div>
  )
})

/** Um modelo 3D (imagem → 3D): a capa é um render no ângulo do quadro; dois cliques abrem o visualizador 3D. */
export const ModeloNode = memo(function ModeloNode({ data, selected }: NodeProps<NoRF>) {
  const { no } = data
  const { slug } = useCanvas()
  const { w, h } = medidaImagem(no)
  const estado = no.estado || 'neutra'
  return (
    <div className={`no imagem modelo es-${estado} ${selected ? 'sel' : ''}`} style={{ width: w }}
      onDoubleClick={() => window.open(urlModelo(slug, no), '_blank', 'noreferrer')} title="Dois cliques abrem o modelo em 3D">
      <div className="quadro" style={{ height: h }}>
        <img src={arquivoUrl(slug, no.thumb || '')} alt={no.nome || no.id} draggable={false} />
        <span className={`marca ${estado === 'aprovada' ? 'ok' : 'play'}`}>{estado === 'aprovada' ? <Check size={12} strokeWidth={3} /> : <Box size={11} />}</span>
        <div className="acoes"><BotoesEstado no={no} /></div>
        <div className="rodape">
          <Codigo id={no.id} />
          <span className="nome">{no.nome}</span>
          <span className="cresce" />
          {no.custo ? <span className="bolha">{dinheiro(no.custo)}</span> : null}
        </div>
      </div>
      <Galho no={no} />
      <Alcas />
    </div>
  )
})

export const nodeTypes = { brief: BriefNode, tela: TelaNode, pedido: PedidoNode, imagem: ImagemNode, referencia: RefNode, video: VideoNode, modelo: ModeloNode }

