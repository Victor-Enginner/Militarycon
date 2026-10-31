import { useEffect, useState } from 'react'
import { Canvas } from './Canvas'
import { PaginaFogo } from './Fogo'
import { Home } from './Home'

/** #/ abre a Visão Geral (Hero); #/projetos lista, abre e cria sessões (a Home do Neo Stitch);
 *  #/p/<slug> abre Agentes Espaciais; #/p/<slug>/f/<código> abre a página de fogo. */
function rota() {
  const m = location.hash.match(/^#\/p\/([a-z0-9-]+)(?:\/f\/([A-Z]+-\d+))?/)
  if (m) return { slug: m[1], fogo: m[2] || null, aba: 'agents' as const }
  if (location.hash === '#/projetos') return { slug: '', fogo: null, aba: 'projetos' as const }
  if (location.hash === '#/camera') return { slug: 'fui-agents-c4isr', fogo: null, aba: 'camera' as const }
  return { slug: 'fui-agents-c4isr', fogo: null, aba: 'hero' as const }
}

export default function App() {
  const [r, setR] = useState(rota)
  useEffect(() => {
    const mudou = () => setR(rota())
    window.addEventListener('hashchange', mudou)
    return () => window.removeEventListener('hashchange', mudou)
  }, [])
  useEffect(() => {
    document.title = r.fogo
      ? `${r.fogo} · AGENTES FUI`
      : r.aba === 'hero'
        ? 'AGENTES FUI · Cognitive Spatial OS'
        : r.aba === 'projetos'
          ? 'Projetos · AGENTES FUI'
          : `${r.slug} · AGENTES FUI`
  }, [r.slug, r.fogo, r.aba])
  if (r.aba === 'projetos') return <Home />
  if (r.fogo) return <PaginaFogo key={`${r.slug}/${r.fogo}`} slug={r.slug} id={r.fogo} />
  return <Canvas key={r.slug} slug={r.slug} abaInicial={r.aba} />
}
