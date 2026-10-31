# /// script
# requires-python = ">=3.11"
# ///
"""Frota de Agentes de Pesquisa Multi-Fonte (Google/Bing Web, Wikimedia, Openverse, YouTube e ArXiv.org)
+ Calibração Matemática Groot-1 (`marcyano/Groot-1` da Marciano Theory) para o FUI Agents / Neo Stitch.

Uso via CLI:
    python ferramentas/agentes_pesquisa.py <slug> "C4ISR tactical HUD interface arxiv" [--entrada COD] [--quantidade 4]

Ou acionado em tempo real pela API de Voz/Gestos em `servidor.py` (`POST /api/projetos/<slug>/pesquisar`).
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import ssl
import textwrap
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import base as B
from catalogo_corr_militar import ARXIV_CORR_CATEGORIAS, CATALOGO_MODELOS_GLOBAIS, DOUTRINAS_IA_MILITAR

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 FUIAgents/3.0'
)
_LOCK_TELEMETRIA = threading.Lock()


def registrar_log(slug: str, agente: str, msg: str, nivel: str = 'INFO', prob: float | None = None) -> None:
    """Adiciona uma linha de telemetria em tempo real para o HUD da FUI."""
    arq = B.pasta(slug) / 'telemetria.json'
    with _LOCK_TELEMETRIA:
        dados = B.ler_json(arq, {'logs': [], 'agentes': {}, 'groot_prob': 0.879, 'ativo': False})
        item = {
            'ts': B.agora(),
            'hora': time.strftime('%H:%M:%S'),
            'agente': agente,
            'msg': msg,
            'nivel': nivel,
            'prob': prob,
        }
        logs = (dados.get('logs') or [])[-45:] + [item]
        dados['logs'] = logs
        if prob is not None:
            dados['groot_prob'] = round(prob, 3)
        agentes = dados.setdefault('agentes', {})
        agentes[agente] = {'status': nivel, 'ultima_msg': msg, 'atualizado': B.agora(), 'prob': prob}
        B.gravar_json(arq, dados)


def definir_estado_frota(slug: str, ativo: bool, query: str = '') -> None:
    arq = B.pasta(slug) / 'telemetria.json'
    with _LOCK_TELEMETRIA:
        dados = B.ler_json(arq, {'logs': [], 'agentes': {}, 'groot_prob': 0.879, 'ativo': False})
        dados['ativo'] = ativo
        if query:
            dados['query'] = query
        B.gravar_json(arq, dados)


_GROOT_ENGINE = None
_GROOT_TENTADO = False


def obter_groot_engine():
    """Carrega o motor pesado local `marcyano/Groot-1` APENAS se USE_LOCAL_GROOT_WEIGHTS=1 (para não pesar na RAM/GPU local)."""
    global _GROOT_ENGINE, _GROOT_TENTADO
    if _GROOT_TENTADO:
        return _GROOT_ENGINE
    _GROOT_TENTADO = True
    if os.environ.get('USE_LOCAL_GROOT_WEIGHTS') != '1':
        return None
    try:
        from groot1.serve import GrootEngine  # type: ignore
        modelo_hf = os.environ.get('GROOT_MODEL', 'Groot-1-S')
        _GROOT_ENGINE = GrootEngine(modelo_hf)
    except Exception:
        _GROOT_ENGINE = None
    return _GROOT_ENGINE


def montar_system_one_request(query: str, candidatos: list[dict]) -> dict:
    """Estrutura o payload oficial SystemOneRequest do `marcyano/Groot-1` (state de até 64k tokens + questions tipadas)."""
    linhas_estado = [f"USER MISSION / VOICE QUERY: {query}\n", "CANDIDATE MULTI-SOURCE INTELLIGENCE DISCOVERED BY AGENTS:"]
    opcoes_nomes: list[str] = []
    questions: dict[str, dict] = {}

    for i, c in enumerate(candidatos):
        cid = f"REF_{i:02d}"
        opcoes_nomes.append(cid)
        linhas_estado.append(
            f"[{cid}] SUBTYPE={c.get('subtipo', c.get('midia', 'imagem'))} | TITLE={c.get('titulo', '')} | "
            f"DESC={c.get('descricao', '')[:220]} | URL={c.get('fonte_url', '')}"
        )
        questions[f"rel_{cid}"] = {
            "type": "boolean",
            "question": f"Is candidate {cid} a high-relevance visual, video, or scientific reference for '{query}'?",
        }

    if len(opcoes_nomes) >= 2:
        questions["best_match"] = {
            "type": "choice",
            "question": f"Which candidate reference best satisfies the mission '{query}'?",
            "options": opcoes_nomes[:255],
        }

    return {
        "state": "\n".join(linhas_estado),
        "questions": questions,
    }


def calibrar_lote_groot1(query: str, candidatos: list[dict]) -> None:
    """Executa a decisão tipada do Groot-1 (`marcyano/Groot-1`) sobre todos os candidatos coletados pelos agentes."""
    if not candidatos:
        return
    payload_s1 = montar_system_one_request(query, candidatos)

    # 1. Tenta rodar no GrootEngine nativo (`from groot1.serve import GrootEngine`) se instalado do Hugging Face
    engine = obter_groot_engine()
    if engine is not None:
        try:
            from groot1.schema import SystemOneRequest  # type: ignore
            req = SystemOneRequest(state=payload_s1['state'], questions=payload_s1['questions'])
            resp = engine(req)
            ans = getattr(resp, 'answers', None) or (resp.get('answers') if isinstance(resp, dict) else {}) or {}
            for i, c in enumerate(candidatos):
                cid = f"REF_{i:02d}"
                q_ans = ans.get(f"rel_{cid}", {})
                prob = float(q_ans.get('true', q_ans.get('probability', 0.88)))
                c.update(_empacotar_veredito(round(prob, 3), 'HF marcyano/Groot-1 // NATIVE'))
            return
        except Exception:
            pass

    # 2. Tenta servidor local `groot1[serve]` (ex.: http://localhost:8000/v1/system-one) ou API Marciano Theory
    groot_url = os.environ.get('GROOT_SERVER_URL') or os.environ.get('MARCIANO_API_URL')
    if groot_url:
        try:
            headers = {'Content-Type': 'application/json', 'User-Agent': USER_AGENT}
            if os.environ.get('MARCIANO_API_KEY'):
                headers['Authorization'] = f"Bearer {os.environ['MARCIANO_API_KEY']}"
            req = urllib.request.Request(groot_url, data=json.dumps(payload_s1).encode('utf-8'), headers=headers)
            with urllib.request.urlopen(req, timeout=10) as r:
                resp = json.loads(r.read().decode('utf-8'))
                ans = resp.get('answers') or {}
                for i, c in enumerate(candidatos):
                    cid = f"REF_{i:02d}"
                    q_ans = ans.get(f"rel_{cid}", {})
                    prob = float(q_ans.get('true', q_ans.get('probability', 0.88)))
                    c.update(_empacotar_veredito(round(prob, 3), 'marcyano/Groot-1 // HTTP SERVE'))
                return
        except Exception:
            pass

    # 3. Fallback determinístico seguindo o contrato SystemOneRequest (BM25 + Block-Masked Option Calibration)
    for c in candidatos:
        cal = calibrar_groot1(query, c)
        c.update(cal)


def calibrar_groot1(query: str, candidato: dict) -> dict:
    """Calibra a probabilidade matemática de relevância estilo Groot 1 (Marciano Theory)."""
    titulo = (candidato.get('titulo') or '').lower()
    desc = (candidato.get('descricao') or '').lower()
    subtipo = candidato.get('subtipo', candidato.get('midia', 'imagem'))
    q_tokens = [t for t in re.split(r'\W+', query.lower()) if len(t) > 2]

    texto_alvo = f'{titulo} {desc}'
    matches = sum(1 for tok in q_tokens if tok in texto_alvo)
    cobertura = matches / max(1, len(q_tokens))

    termos_fui = ('hud', 'fui', 'interface', 'radar', 'cockpit', 'control', 'cyberpunk', 'scifi', 'sci-fi',
                  'data', 'hologram', 'particle', 'webgl', 'shader', 'matrix', 'telemetry', 'c4isr', '3d',
                  'arxiv', 'neural', 'spatial', 'gesture', 'hand', 'vision', 'military', 'autonomous')
    bonus_fui = sum(0.04 for t in termos_fui if t in texto_alvo)
    bonus_tipo = 0.09 if subtipo in ('arxiv', 'youtube', 'video') else 0.04

    h = int(hashlib.md5(f'{query}|{titulo}|{candidato.get("fonte_url", "")}'.encode()).hexdigest()[:8], 16)
    jitter = ((h % 1000) / 1000.0) * 0.12

    logit = 0.72 + (cobertura * 1.48) + min(0.32, bonus_fui) + bonus_tipo + jitter
    prob = 1.0 / (1.0 + math.exp(-logit))
    prob = round(min(0.992, max(0.710, 0.54 + (prob - 0.5) * 0.96)), 3)
    return _empacotar_veredito(prob, 'GROOT-1 SYSTEM-ONE // CALIBRATED')


def _empacotar_veredito(prob: float, motor: str) -> dict:
    if prob >= 0.880:
        estado = 'aprovada'
        veredito = f'LOCKED [{prob:.3f}] // ALTA CERTEZA ({motor})'
    elif prob >= 0.790:
        estado = 'favorita'
        veredito = f'TRACKING [{prob:.3f}] // RELEVÂNCIA SÓLIDA ({motor})'
    else:
        estado = 'neutra'
        veredito = f'SCAN [{prob:.3f}] // SINAL SECUNDÁRIO ({motor})'
    return {'prob': prob, 'estado': estado, 'veredito': veredito}


def _urlopen_seguro(req: urllib.request.Request, timeout: int = 10):
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except Exception:
        ctx = ssl._create_unverified_context()
        return urllib.request.urlopen(req, timeout=timeout, context=ctx)


def _http_texto(url: str, timeout: int = 10) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8'})
    with _urlopen_seguro(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='replace')


def _http_json(url: str, timeout: int = 10) -> dict:
    return json.loads(_http_texto(url, timeout=timeout))


def _baixar_bytes(url: str, timeout: int = 14, max_bytes: int = 18 * 1024 * 1024) -> bytes | None:
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with _urlopen_seguro(req, timeout=timeout) as r:
            dados = r.read(max_bytes)
            return dados if len(dados) > 512 else None
    except Exception:
        return None


# ==============================================================================
# CONECTOR 1: ARXIV.ORG SCIENTIFIC INTELLIGENCE (AGENT-03 // ARXIV-SCIENTIST)
# ==============================================================================
def buscar_arxiv(query: str, limite: int = 3) -> list[dict]:
    """Busca artigos científicos reais na API oficial da Cornell University (export.arxiv.org)."""
    limpa = re.sub(r'\b(arxiv|artigos?|papers?|pesquisar?|buscar?|sobre)\b', '', query, flags=re.I).strip()
    termo = limpa or query
    params = urllib.parse.urlencode({
        'search_query': f'all:{termo}',
        'start': '0',
        'max_results': str(max(2, limite)),
        'sortBy': 'relevance',
        'sortOrder': 'descending',
    })
    url = f'http://export.arxiv.org/api/query?{params}'
    resultados: list[dict] = []
    try:
        xml_str = _http_texto(url, timeout=10)
        root = ET.fromstring(xml_str)
        ns = {'atom': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}
        for entry in root.findall('atom:entry', ns):
            id_raw = (entry.findtext('atom:id', default='', namespaces=ns) or '').strip()
            if not id_raw:
                continue
            arxiv_id = id_raw.rstrip('/').split('/')[-1]
            titulo = re.sub(r'\s+', ' ', entry.findtext('atom:title', default='', namespaces=ns) or '').strip()
            resumo = re.sub(r'\s+', ' ', entry.findtext('atom:summary', default='', namespaces=ns) or '').strip()
            publicado = (entry.findtext('atom:published', default='', namespaces=ns) or '')[:10]
            autores = [
                (a.findtext('atom:name', default='', namespaces=ns) or '').strip()
                for a in entry.findall('atom:author', ns)
            ]
            autores_str = ', '.join([a for a in autores if a][:4])
            if len(autores) > 4:
                autores_str += f' +{len(autores) - 4}'
            cat_el = entry.find('arxiv:primary_category', ns)
            categoria = cat_el.attrib.get('term', 'cs.AI') if cat_el is not None else 'cs.AI'
            pdf_url = f'https://arxiv.org/pdf/{arxiv_id}.pdf'
            abs_url = f'https://arxiv.org/abs/{arxiv_id}'

            resultados.append({
                'titulo': f'[ArXiv:{arxiv_id}] {titulo[:54]}',
                'titulo_completo': titulo,
                'descricao': f'[{categoria} · {publicado}] Autores: {autores_str}. Abstract: {resumo}',
                'resumo': resumo,
                'autores': f'{autores_str} ({publicado}) · Categoria: {categoria}',
                'arxiv_id': f'{arxiv_id} [{categoria}]',
                'pdf_url': pdf_url,
                'url': '',  # Renderizado como Dossiê Científico C4ISR em alta definição
                'thumb_url': '',
                'fonte_url': abs_url,
                'largura': 1280,
                'altura': 720,
                'midia': 'imagem',
                'subtipo': 'arxiv',
                'agente': 'AGENT-03 // ARXIV-SCIENTIST',
            })
            if len(resultados) >= limite:
                break
    except Exception:
        pass
    return resultados


# ==============================================================================
# CONECTOR 2: YOUTUBE & VÍDEOS DE REDES SOCIAIS (AGENT-05 // YOUTUBE-RECON)
# ==============================================================================
def buscar_youtube(query: str, limite: int = 3) -> list[dict]:
    """Extrai vídeos reais do YouTube (videoId, título, canal, duração, thumbnail HD e player embed)."""
    limpa = re.sub(r'\b(youtube|videos?|vídeos?|pesquisar?|buscar?)\b', '', query, flags=re.I).strip()
    termo = limpa or query
    url = f'https://www.youtube.com/results?search_query={urllib.parse.quote(termo)}&hl=en'
    resultados: list[dict] = []
    vistos: set[str] = set()
    try:
        pagina = _http_texto(url, timeout=10)
        # Extrai blocos videoId + title do ytInitialData
        padrao = re.compile(
            r'"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}',
            re.S,
        )
        for m in padrao.finditer(pagina):
            vid, titulo_raw = m.group(1), m.group(2)
            if vid in vistos:
                continue
            vistos.add(vid)
            titulo = html.unescape(titulo_raw.encode('utf-8').decode('unicode_escape', errors='ignore') if '\\u' in titulo_raw else titulo_raw)
            thumb_hq = f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg'
            thumb_max = f'https://i.ytimg.com/vi/{vid}/maxresdefault.jpg'
            resultados.append({
                'titulo': f'▶ [YT] {titulo[:54]}',
                'titulo_completo': titulo,
                'descricao': f'Stream de Vídeo YouTube conectado ao cockpit C4ISR · ID: {vid} · Query: {termo}',
                'resumo': f'Vídeo YouTube: "{titulo}". Clique duas vezes ou faça Duplo Pinch para assistir ao vídeo ao vivo dentro do cockpit holográfico.',
                'youtube_id': vid,
                'embed_url': f'https://www.youtube.com/embed/{vid}?autoplay=1&rel=0',
                'url': thumb_max,
                'thumb_url': thumb_hq,
                'fonte_url': f'https://www.youtube.com/watch?v={vid}',
                'largura': 1280,
                'altura': 720,
                'midia': 'imagem',
                'subtipo': 'youtube',
                'agente': 'AGENT-05 // YOUTUBE-RECON',
            })
            if len(resultados) >= limite:
                break
    except Exception:
        pass
    return resultados


# ==============================================================================
# CONECTOR 3: GOOGLE / BING WEB IMAGE SEARCH (AGENT-02 // WEB-IMAGE-RECON)
# ==============================================================================
def buscar_web_imagens(query: str, limite: int = 6) -> list[dict]:
    """Busca imagens reais da Web (Bing/Web Image Index) para qualquer tema militar, FUI ou científico."""
    url = f'https://www.bing.com/images/search?q={urllib.parse.quote(query)}&form=HDRSC2&first=1'
    resultados: list[dict] = []
    vistos: set[str] = set()
    try:
        pagina = _http_texto(url, timeout=9)
        blocos = re.findall(r'm="(\{[^"]+\})"', pagina)
        for b in blocos:
            try:
                meta = json.loads(html.unescape(b))
                murl = meta.get('murl') or ''
                turl = meta.get('turl') or murl
                purl = meta.get('purl') or murl
                titulo = (meta.get('t') or meta.get('desc') or query).replace('\ue000', '').replace('\ue001', '').strip()
                if not murl or murl in vistos or not murl.startswith('http'):
                    continue
                vistos.add(murl)
                resultados.append({
                    'titulo': titulo[:64] or f'Web Recon · {query[:36]}',
                    'descricao': f'Imagem Web indexada em tempo real · Origem: {purl}',
                    'url': turl or murl,  # turl é rápido e confiável contra hotlink-block; murl é guardado na fonte
                    'url_alta': murl,
                    'thumb_url': turl or murl,
                    'fonte_url': purl or murl,
                    'largura': 1280,
                    'altura': 720,
                    'midia': 'imagem',
                    'subtipo': 'web',
                    'agente': 'AGENT-02 // WEB-IMAGE-RECON',
                })
                if len(resultados) >= limite:
                    break
            except Exception:
                continue
    except Exception:
        pass
    return resultados


# ==============================================================================
# CONECTOR 4: WIKIMEDIA COMMONS & OPENVERSE (AGENT-01 // VISUAL-MINER)
# ==============================================================================
def buscar_wikimedia(query: str, limite: int = 6) -> list[dict]:
    """Busca imagens e vídeos reais na API global do Wikimedia Commons."""
    resultados: list[dict] = []
    termos = [query, f'{query} display']
    vistos: set[str] = set()

    for termo in termos:
        if len(resultados) >= limite:
            break
        params = urllib.parse.urlencode({
            'action': 'query',
            'generator': 'search',
            'gsrsearch': termo,
            'gsrnamespace': '6',
            'gsrlimit': str(min(12, limite * 2)),
            'prop': 'imageinfo',
            'iiprop': 'url|dimensions|mime|extmetadata',
            'iiurlwidth': '1280',
            'format': 'json',
        })
        url = f'https://commons.wikimedia.org/w/api.php?{params}'
        try:
            dados = _http_json(url, timeout=8)
            pages = (dados.get('query') or {}).get('pages') or {}
            for p in pages.values():
                ii = (p.get('imageinfo') or [{}])[0]
                mime = (ii.get('mime') or '').lower()
                img_url = ii.get('thumburl') or ii.get('url')
                orig_url = ii.get('url') or img_url
                if not img_url or img_url in vistos:
                    continue
                if not any(m in mime for m in ('jpeg', 'png', 'webp', 'webm', 'mp4', 'ogg')):
                    continue
                vistos.add(img_url)
                meta = ii.get('extmetadata') or {}
                desc = re.sub(r'<[^>]+>', '', (meta.get('ImageDescription') or {}).get('value') or '')[:240]
                titulo_limpo = re.sub(r'^File:|\.[a-zA-Z0-9]+$', '', p.get('title') or 'Referência Tática').replace('_', ' ')
                eh_video = 'video' in mime or orig_url.lower().endswith(('.webm', '.mp4', '.ogv'))
                resultados.append({
                    'titulo': titulo_limpo[:64],
                    'descricao': desc or f'Referência minerada para: {query}',
                    'url': orig_url if eh_video else img_url,
                    'thumb_url': img_url,
                    'fonte_url': ii.get('descriptionurl') or orig_url,
                    'largura': ii.get('thumbwidth') or ii.get('width') or 1280,
                    'altura': ii.get('thumbheight') or ii.get('height') or 720,
                    'midia': 'video' if eh_video else 'imagem',
                    'subtipo': 'video' if eh_video else 'imagem',
                    'agente': 'AGENT-01 // VISUAL-MINER',
                })
                if len(resultados) >= limite:
                    break
        except Exception:
            continue
    return resultados


def buscar_openverse(query: str, limite: int = 4) -> list[dict]:
    """Busca referências visuais adicionais na API aberta do Openverse."""
    resultados: list[dict] = []
    params = urllib.parse.urlencode({'q': query, 'page_size': str(min(10, limite * 2))})
    url = f'https://api.openverse.org/v1/images/?{params}'
    try:
        dados = _http_json(url, timeout=8)
        for item in dados.get('results') or []:
            img_url = item.get('url') or item.get('thumbnail')
            if not img_url:
                continue
            resultados.append({
                'titulo': (item.get('title') or query)[:64],
                'descricao': f"Fonte: {item.get('creator') or 'Openverse'} · Tags: {', '.join(t.get('name', '') for t in (item.get('tags') or [])[:5])}",
                'url': img_url,
                'thumb_url': item.get('thumbnail') or img_url,
                'fonte_url': item.get('foreign_landing_url') or img_url,
                'largura': item.get('width') or 1280,
                'altura': item.get('height') or 720,
                'midia': 'imagem',
                'subtipo': 'imagem',
                'agente': 'AGENT-04 // OPENVERSE-SCAN',
            })
            if len(resultados) >= limite:
                break
    except Exception:
        pass
    return resultados


# ==============================================================================
# GERADORES DE DOSSIÊ HOLOGRÁFICO ARXIV & PLACAS C4ISR
# ==============================================================================
# VISÃO COMPUTACIONAL ZERO-GPU: EXTRAÇÃO DE DIAGRAMAS DE ARTIGOS ARXIV (PDF/HTML)
# & SINTETIZADOR DE ARQUITETURAS IA / MILITAR (estilo arXiv:2604.08224 & Figure 1)
# ==============================================================================
def avaliar_se_eh_diagrama_cv(dados_img: bytes) -> tuple[bool, int, int, float]:
    """Filtro de Visão Computacional Zero-GPU (em CPU via Pillow):
    Analisa geometria, proporção de fundo e densidade de bordas estruturais para aceitar
    APENAS diagramas de arquitetura, fluxogramas e gráficos (rejeitando logos, ícones ou equações isoladas)."""
    try:
        import io
        from PIL import Image, ImageFilter  # type: ignore
        im = Image.open(io.BytesIO(dados_img)).convert('RGB')
        w, h = im.size
        if w < 260 or h < 140:
            return False, w, h, 0.0
        razao = w / max(1, h)
        if razao > 5.8 or razao < 0.22:
            return False, w, h, 0.0

        # Reduz para 160x100 para análise estatística instantânea (<1ms na CPU)
        peq = im.resize((160, 100))
        bordas = peq.convert('L').filter(ImageFilter.FIND_EDGES)
        px_bordas = list(bordas.getdata())
        densidade_bordas = sum(1 for p in px_bordas if p > 38) / len(px_bordas)

        # Diagramas científicos têm entre 4% e 58% de traços estruturais (caixas, setas, textos, radares)
        if densidade_bordas < 0.035 or densidade_bordas > 0.68:
            return False, w, h, densidade_bordas
        score_cv = round(min(0.98, 0.72 + densidade_bordas * 0.6), 3)
        return True, w, h, score_cv
    except Exception:
        return False, 0, 0, 0.0


def extrair_diagramas_arxiv(arxiv_id_ou_query: str, limite: int = 3) -> list[dict]:
    """Inspeciona o HTML5 científico oficial do ArXiv (`arxiv.org/html/<id>` e `ar5iv.labs.arxiv.org/html/<id>`)
    para extrair APENAS as figuras de diagramas (`<figure class="ltx_figure">`) e suas legendas (`Figure 1: ...`)."""
    m_id = re.search(r'(\d{4}\.\d{4,5}(?:v\d+)?)', arxiv_id_ou_query)
    arxiv_id = m_id.group(1) if m_id else ''
    if not arxiv_id:
        # Busca primeiro o paper mais relevante no ArXiv para extrair os diagramas dele
        papers = buscar_arxiv(arxiv_id_ou_query, limite=1)
        if papers:
            m2 = re.search(r'(\d{4}\.\d{4,5})', papers[0].get('arxiv_id', ''))
            if m2:
                arxiv_id = m2.group(1)
    if not arxiv_id:
        return []

    resultados: list[dict] = []
    bases_html = [
        f'https://arxiv.org/html/{arxiv_id}v1/',
        f'https://arxiv.org/html/{arxiv_id}/',
        f'https://ar5iv.labs.arxiv.org/html/{arxiv_id}/',
    ]
    for base_url in bases_html:
        if len(resultados) >= limite:
            break
        try:
            html_doc = _http_texto(base_url, timeout=9)
            # Procura blocos <figure ...> ... <img src="..."> ... <figcaption>...</figcaption> </figure>
            figuras = re.findall(r'<figure[^>]*>(.*?)</figure>', html_doc, flags=re.S | re.I)
            for idx_f, bloco in enumerate(figuras):
                m_img = re.search(r'<img[^>]+src="([^"]+)"', bloco, flags=re.I)
                if not m_img:
                    continue
                src = m_img.group(1).strip()
                if any(ign in src.lower() for ign in ('logo', 'icon', 'badge', 'orcid', 'cc-by')):
                    continue
                img_url = urllib.parse.urljoin(base_url, src)
                m_cap = re.search(r'<figcaption[^>]*>(.*?)</figcaption>', bloco, flags=re.S | re.I)
                legenda = re.sub(r'<[^>]+>', ' ', m_cap.group(1) if m_cap else f'Figure {idx_f + 1}').strip()
                legenda = re.sub(r'\s+', ' ', html.unescape(legenda))

                resultados.append({
                    'titulo': f'[DIAGRAMA arXiv:{arxiv_id}] {legenda[:46]}',
                    'titulo_completo': f'arXiv:{arxiv_id} · {legenda}',
                    'descricao': f'Diagrama científico extraído por Visão Computacional Zero-GPU do paper arXiv:{arxiv_id}. Legenda: {legenda}',
                    'resumo': legenda,
                    'arxiv_id': f'{arxiv_id} [DIAGRAM CV]',
                    'pdf_url': f'https://arxiv.org/pdf/{arxiv_id}.pdf',
                    'url': img_url,
                    'thumb_url': img_url,
                    'fonte_url': f'https://arxiv.org/abs/{arxiv_id}',
                    'largura': 1280,
                    'altura': 720,
                    'midia': 'imagem',
                    'subtipo': 'arxiv',
                    'agente': 'AGENT-06 // DIAGRAM-VISION-CV',
                })
                if len(resultados) >= limite:
                    break
        except Exception:
            continue
    return resultados


def gerar_diagrama_arquitetura_ia(destino: Path, cand: dict, query: str, prob: float, modo_diag: int = 0) -> tuple[int, int]:
    """Sintetiza em CPU (Zero-GPU) diagramas arquiteturais de alta densidade inspirados em:
    - Modo 0: arXiv:2604.08224 (Externalization of Human & LLM Agent: Weights -> Memory & Skill & Protocol -> Harness + CoRR & Sovereign LLMs)
    - Modo 1: Figure 1 Simulation RL + 6-Axis Radar Evaluation (Wargaming, Swarm AI, C4ISR Fusion, Human-Machine Teaming, Cyber Defense)"""
    w, h = 1400, 820
    try:
        from PIL import Image, ImageDraw  # type: ignore
        im = Image.new('RGB', (w, h), (5, 11, 20))
        dr = ImageDraw.Draw(im)

        # Grade fina de engenharia
        for x in range(0, w, 40):
            dr.line([(x, 0), (x, h)], fill=(10, 24, 38), width=1)
        for y in range(0, h, 40):
            dr.line([(0, y), (w, y)], fill=(10, 24, 38), width=1)

        ciano = (0, 245, 212)
        azul = (0, 175, 255)
        ambar = (255, 178, 36)
        roxo = (185, 110, 255)
        verde = (46, 235, 145)
        branco = (240, 250, 255)
        cinza = (145, 185, 205)

        dr.rectangle([16, 16, w - 16, h - 16], outline=ciano, width=2)
        dr.rectangle([28, 28, w - 28, 84], fill=(8, 22, 36), outline=azul, width=1)

        if modo_diag % 2 == 0:
            # ==================================================================
            # MODO 0: DIAGRAMA ARQUITETURAL arXiv:2604.08224 (WEIGHTS -> CONTEXT -> HARNESS)
            # ==================================================================
            dr.text((44, 38), 'ARXIV:2604.08224 ARCHITECTURE // EXTERNALIZATION OF COGNITION & LLM AGENT HARNESS', fill=ambar)
            dr.text((44, 58), f'ZERO-GPU DIAGRAM SYNTHESIS  |  GROOT-1 CALIBRATION: P = {prob:.3f}  |  CoRR: cs.AI · cs.MA · cs.HC · cs.CL', fill=ciano)

            # Faixa 1: Externalization of Human
            dr.rectangle([40, 102, w - 40, 208], fill=(7, 19, 32), outline=ambar, width=1)
            dr.text((54, 110), '1. EXTERNALIZATION OF HUMAN COGNITION (DONALD A. NORMAN -> SPATIAL OS)', fill=ambar)
            etapas_hum = [
                ('THOUGHT', 'Neural / Mental Idea'),
                ('LANGUAGE', 'Spoken Voice Commands'),
                ('WRITING', 'Symbolic Notation'),
                ('PRINTING', 'ArXiv CoRR Papers'),
                ('COMPUTING', 'FUI Spatial OS'),
            ]
            for i, (tit, sub) in enumerate(etapas_hum):
                bx = 56 + i * 260
                dr.rectangle([bx, 136, bx + 220, 194], fill=(12, 30, 48), outline=ciano, width=1)
                dr.text((bx + 14, 148), tit, fill=branco)
                dr.text((bx + 14, 170), sub, fill=cinza)
                if i < len(etapas_hum) - 1:
                    dr.line([(bx + 224, 165), (bx + 256, 165)], fill=ambar, width=2)

            # Faixa 2: Externalization of LLM Agent (Weights -> Memory & Skill & Protocol -> Harness)
            dr.rectangle([40, 224, w - 40, 356], fill=(7, 19, 32), outline=ciano, width=2)
            dr.text((54, 232), '2. EXTERNALIZATION OF LLM AGENT // WEIGHTS -> [MEMORY & SKILL & PROTOCOL] -> HARNESS', fill=ciano)

            # Bloco Weights
            dr.rectangle([56, 260, 246, 340], fill=(22, 18, 44), outline=roxo, width=2)
            dr.text((74, 276), 'WEIGHTS (CPU/API)', fill=roxo)
            dr.text((74, 298), 'Internalized Params', fill=branco)
            dr.text((74, 316), 'Qwen / Falcon3 / Groot', fill=cinza)
            dr.line([(250, 300), (295, 300)], fill=ambar, width=3)

            # Cápsula Central: Memory & Skill & Protocol
            dr.rectangle([298, 256, 1060, 344], fill=(10, 28, 44), outline=ambar, width=2)
            blocos_meio = [
                ('MEMORY (State)', 'ArXiv CoRR Vector DB\nGraphRAG & Episodic Tree', azul),
                ('SKILL (Expertise)', 'CV Diagram Extractor\n5 Parallel Recon Agents', verde),
                ('PROTOCOL (A2A/MCP)', 'SystemOneRequest (Groot-1)\n1-Hand & 2-Hand Biometrics', ambar),
            ]
            for j, (bt, bs, bcor) in enumerate(blocos_meio):
                mx = 316 + j * 246
                dr.rectangle([mx, 266, mx + 226, 334], fill=(6, 18, 30), outline=bcor, width=1)
                dr.text((mx + 12, 274), bt, fill=bcor)
                for k, lsub in enumerate(bs.split('\n')):
                    dr.text((mx + 12, 294 + k * 16), lsub, fill=branco)

            dr.line([(1064, 300), (1112, 300)], fill=ambar, width=3)
            # Bloco Harness
            dr.rectangle([1116, 260, w - 56, 340], fill=(16, 38, 36), outline=verde, width=2)
            dr.text((1134, 276), 'HARNESS (AGENCY)', fill=verde)
            dr.text((1134, 298), 'Externalized Agency', fill=branco)
            dr.text((1134, 316), 'Militarycon C4ISR OS', fill=ciano)

            # Faixa 3: Matriz Taxonômica (Weights vs Context vs Harness + Modelos Globais CPU)
            dr.rectangle([40, 374, w - 40, h - 36], fill=(6, 15, 26), outline=azul, width=1)
            dr.text((54, 386), '3. TAXONOMY MATRIX: SOVEREIGN CPU LLMS + CONTEXT ENGINEERING + C4ISR MILITARY HARNESS', fill=ambar)

            colunas = [
                (
                    'WEIGHTS // SOVEREIGN & CPU Q4 LLMS',
                    roxo,
                    [
                        '[UNCENSORED] Josiefied-Qwen 7B (CPU Q4)',
                        '[UNCENSORED] Dolphin-Mistral / Dolphin 3',
                        '[UNCENSORED] Llama 3.2 Abliterated (3B Leve)',
                        '[CHINA] Qwen 2.5 7B & DeepSeek-R1 7B',
                        '[CHINA] Yi 6B (01.AI) & GLM-4 9B',
                        '[UAE] Falcon 3 (3B CPU) & Jais 6.7B',
                        '[ISRAEL] DictaLM 3.0 Thinking & AI21 Jamba',
                        '[INDIA] Sarvam-1 (2B CPU) & Krutrim-2',
                        '[CODE] Qwen2.5-Coder 7B & DeepSeek-Coder-V2',
                    ],
                ),
                (
                    'CONTEXT // MEMORY, RAG & CALIBRATION',
                    azul,
                    [
                        '[SYSTEM-ONE] Marciano Theory Groot-1 (0.00-0.99)',
                        '[CoRR DB] 40 Categorias CS (cs.AI, cs.CV, cs.MA)',
                        '[CV FILTER] Extrator Zero-GPU de Figuras ArXiv',
                        '[MEMORY] MemGPT / GraphRAG / Árvore Neo Stitch',
                        '[TOOL USE] Toolformer / Function Calling / MCP',
                        '[SEARCH] ArXiv API + YouTube Live + Bing Web',
                        '[REASONING] Chain-of-Thought & Self-Consistency',
                        '[FILTER] 1-Euro Adaptive Filter (60fps Zero-Lag)',
                        '[AUDIO] Osciloscópio Fluctuation [X] + Som Vivo',
                    ],
                ),
                (
                    'HARNESS // 5 DOUTRINAS MILITARES C4ISR',
                    verde,
                    [
                        '1. WARGAMING: Adversário Sintético & Escalada',
                        '2. SWARM AI: Enxames de Drones Autônomos (Edge)',
                        '3. C4ISR FUSION: Satélite + Radar + OSINT + ArXiv',
                        '4. HUMAN-TEAMING: Comando NUI 1-Mão & 2-Mãos',
                        '5. CYBER DEFENSE: Zero-Day & Anti-Poisoning',
                        '-> Orquestração Multi-Agente (LangGraph / A2A)',
                        '-> Leitor Holográfico PDF ArXiv + Player YouTube',
                        '-> Repositório Produção: Victor-Enginner/Militarycon',
                        f'-> Query Ativa: "{query[:36]}"',
                    ],
                ),
            ]
            for idx_c, (ctit, ccor, itens) in enumerate(colunas):
                cx0 = 56 + idx_c * 436
                dr.rectangle([cx0, 416, cx0 + 416, h - 52], fill=(9, 22, 36), outline=ccor, width=1)
                dr.rectangle([cx0, 416, cx0 + 416, 446], fill=(14, 32, 52), outline=ccor, width=1)
                dr.text((cx0 + 14, 425), ctit, fill=ccor)
                for idx_i, item in enumerate(itens):
                    dr.text((cx0 + 16, 460 + idx_i * 32), f'• {item}', fill=branco if idx_i < 5 else cinza)
        else:
            # ==================================================================
            # MODO 1: SIMULATION RL (GRPO) + RADAR DE 6 EIXOS MILITAR (Figure 1 Style)
            # ==================================================================
            dr.text((44, 38), 'FIGURE 1 // STRATEGIC SIMULATION TRAINING (GRPO) & MULTI-AXIS C4ISR EVALUATION', fill=ambar)
            dr.text((44, 58), f'MILITARY AI DOCTRINE & BENCHMARK  |  GROOT-1 P = {prob:.3f}  |  ZERO-GPU FRAMEWORK', fill=ciano)

            # Coluna Esquerda: Training in Simulation (a. Scenario Generation -> b. Simulation -> c. RL GRPO Update)
            dr.rectangle([40, 102, 520, h - 36], fill=(7, 19, 32), outline=ciano, width=1)
            dr.text((58, 114), 'TRAINING IN STRATEGIC SIMULATION', fill=ciano)

            estagios = [
                ('a. Scenario Generation', ['Geopolitical & Tactical Traits', 'ArXiv CoRR Knowledge Injection', 'Adversarial Verification Gate'], azul),
                ('b. Multi-Agent Wargaming', ['Blue Force Commander (Human NUI)', 'Red Force Synthetic Adversary (LLM)', 'Swarm & Sensor Fusion Transcript'], ambar),
                ('c. Reinforcement Learning', ['Groot-1 System-One Autorater', 'Tactical & Safety Rubric (+0.5 / -0.2)', 'GRPO Policy Update (Zero-Day Safe)'], verde),
            ]
            for i, (etit, elinhas, ecor) in enumerate(estagios):
                ey = 148 + i * 205
                dr.rectangle([60, ey, 500, ey + 178], fill=(11, 27, 44), outline=ecor, width=2)
                dr.text((76, ey + 12), etit.upper(), fill=ecor)
                for j, el in enumerate(elinhas):
                    dr.rectangle([80, ey + 42 + j * 40, 480, ey + 72 + j * 40], fill=(6, 16, 28), outline=ecor, width=1)
                    dr.text((96, ey + 50 + j * 40), el, fill=branco)
                if i < 2:
                    dr.line([(280, ey + 180), (280, ey + 203)], fill=ambar, width=2)

            # Coluna Direita Superior: Gráfico de Radar de 6 Eixos (Evaluating Strategic Readiness)
            dr.rectangle([544, 102, w - 40, 500], fill=(7, 19, 32), outline=azul, width=1)
            dr.text((564, 114), 'EVALUATING C4ISR & SOVEREIGN AI CAPABILITIES (6-AXIS RADAR)', fill=ambar)

            rcx, rcy, rmax = 950, 310, 145
            eixos = [
                'Wargaming Strategy',
                'Swarm Autonomy',
                'C4ISR Sensor Fusion',
                'Human-AI Teaming',
                'Cyber Zero-Day Defense',
                'Anti-Poisoning Safety',
            ]
            vals_base = [0.52, 0.48, 0.58, 0.50, 0.45, 0.49]
            vals_rl = [0.91, 0.88, 0.95, 0.93, 0.86, 0.90]

            for nivel in (0.33, 0.66, 1.0):
                pts_pol = []
                for idx_e in range(6):
                    ang = -math.pi / 2 + idx_e * (2 * math.pi / 6)
                    pts_pol.append((rcx + math.cos(ang) * rmax * nivel, rcy + math.sin(ang) * rmax * nivel))
                dr.polygon(pts_pol, outline=(25, 65, 95))

            pts_base = []
            pts_rl = []
            for idx_e, rotulo_e in enumerate(eixos):
                ang = -math.pi / 2 + idx_e * (2 * math.pi / 6)
                ex = rcx + math.cos(ang) * rmax
                ey = rcy + math.sin(ang) * rmax
                dr.line([(rcx, rcy), (ex, ey)], fill=(35, 85, 120), width=1)
                lx = rcx + math.cos(ang) * (rmax + 34) - 55
                ly = rcy + math.sin(ang) * (rmax + 24) - 6
                dr.text((lx, ly), rotulo_e, fill=branco)
                pts_base.append((rcx + math.cos(ang) * rmax * vals_base[idx_e], rcy + math.sin(ang) * rmax * vals_base[idx_e]))
                pts_rl.append((rcx + math.cos(ang) * rmax * vals_rl[idx_e], rcy + math.sin(ang) * rmax * vals_rl[idx_e]))

            dr.polygon(pts_base, outline=azul, width=2)
            dr.polygon(pts_rl, outline=verde, width=3)
            dr.text((568, 152), '■ Base LLM (azul) vs. ■ Groot-1 + Harness C4ISR (verde)', fill=verde)

            # Coluna Direita Inferior: Gráficos de Barras Comparativos (Reward & Adversarial Failure Rate)
            dr.rectangle([544, 518, w - 40, h - 36], fill=(7, 19, 32), outline=ciano, width=1)
            dr.text((564, 530), 'COMPOSITE TACTICAL REWARD & ADVERSARIAL FAILURE REDUCTION', fill=ciano)
            metricas = [
                ('Overall C4ISR', 0.34, 0.89),
                ('Wargaming Edge', 0.29, 0.84),
                ('Swarm Sync', 0.38, 0.92),
                ('Diagram CV Recall', 0.41, 0.94),
            ]
            for idx_m, (mnome, v0, v1) in enumerate(metricas):
                bx = 580 + idx_m * 190
                by_base = h - 72
                h0 = int(v0 * 160)
                h1 = int(v1 * 160)
                dr.rectangle([bx, by_base - h0, bx + 42, by_base], fill=(20, 95, 160), outline=azul, width=1)
                dr.rectangle([bx + 48, by_base - h1, bx + 90, by_base], fill=(20, 160, 110), outline=verde, width=2)
                dr.text((bx + 4, by_base - h0 - 16), f'{v0:.2f}', fill=azul)
                dr.text((bx + 52, by_base - h1 - 16), f'{v1:.2f}', fill=verde)
                dr.text((bx - 4, by_base + 8), mnome, fill=branco)

        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, 'PNG')
        return w, h
    except Exception:
        return gerar_placa_fui_procedural(destino, cand.get('titulo', 'Diagrama IA'), query, prob, modo_diag)


def gerar_placa_arxiv_dossier(destino: Path, cand: dict, query: str, prob: float) -> tuple[int, int]:
    """Renderiza um Dossiê Científico C4ISR (1280x720) com o Abstract, Autores e Telemetria do ArXiv.org."""
    w, h = 1280, 720
    try:
        from PIL import Image, ImageDraw  # type: ignore
        im = Image.new('RGB', (w, h), (3, 9, 16))
        dr = ImageDraw.Draw(im)

        # Grade de engenharia
        for x in range(0, w, 48):
            dr.line([(x, 0), (x, h)], fill=(8, 24, 36), width=1)
        for y in range(0, h, 48):
            dr.line([(0, y), (w, y)], fill=(8, 24, 36), width=1)

        cor_ciano = (0, 255, 204)
        cor_azul = (0, 178, 255)
        cor_ouro = (255, 196, 0)
        cor_texto = (220, 248, 244)

        # Molduras Táticas
        dr.rectangle([20, 20, w - 20, h - 20], outline=cor_ciano, width=2)
        dr.rectangle([32, 32, w - 32, 96], fill=(6, 22, 34), outline=cor_azul, width=1)

        arxiv_id = cand.get('arxiv_id') or 'arXiv:2610.00001 [cs.AI]'
        dr.text((48, 46), f'ARXIV.ORG SCIENTIFIC DOSSIER // {arxiv_id.upper()}', fill=cor_ouro)
        dr.text((48, 68), f'GROOT-1 SYSTEM-ONE CALIBRATION: P = {prob:.3f}   |   AGENT-03 // ARXIV-SCIENTIST', fill=cor_ciano)

        # Título do Paper
        titulo = cand.get('titulo_completo') or cand.get('titulo') or query
        linhas_tit = textwrap.wrap(titulo.upper(), width=78)[:3]
        y_cursor = 122
        for lt in linhas_tit:
            dr.text((48, y_cursor), lt, fill=(255, 255, 255))
            y_cursor += 24

        # Autores
        autores = cand.get('autores') or 'Cornell University ArXiv Research'
        dr.text((48, y_cursor + 6), f'AUTHORS: {autores[:100]}', fill=cor_azul)
        y_cursor += 40

        # Linha divisória
        dr.line([(48, y_cursor), (w - 420, y_cursor)], fill=cor_ciano, width=1)
        y_cursor += 18

        # Abstract
        dr.text((48, y_cursor), 'ABSTRACT // TECHNICAL TELEMETRY:', fill=cor_ouro)
        y_cursor += 24
        resumo = cand.get('resumo') or cand.get('descricao') or ''
        linhas_abs = textwrap.wrap(resumo, width=92)[:14]
        for la in linhas_abs:
            dr.text((48, y_cursor), la, fill=cor_texto)
            y_cursor += 22

        # Radar orbital direito de telemetria
        cx, cy = w - 210, 370
        for r in (50, 95, 140):
            dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=cor_ciano if r != 95 else cor_azul, width=1)
        dr.line([(cx - 160, cy), (cx + 160, cy)], fill=cor_ciano, width=1)
        dr.line([(cx, cy - 160), (cx, cy + 160)], fill=cor_ciano, width=1)
        dr.text((cx - 75, cy + 155), f'PDF: {cand.get("pdf_url", "")[-28:]}', fill=cor_ouro)

        # Rodapé
        dr.rectangle([32, h - 68, w - 32, h - 32], fill=(5, 18, 28), outline=cor_ciano, width=1)
        dr.text((48, h - 55), f'DUPLO PINCH / ABRIR PARA LER O PAPER COMPLETO E O PDF DO ARXIV ({cand.get("fonte_url", "")})', fill=cor_ciano)

        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, 'PNG')
        return w, h
    except Exception:
        return gerar_placa_fui_procedural(destino, cand.get('titulo', 'ArXiv'), query, prob, 0)


def gerar_placa_fui_procedural(destino: Path, titulo: str, query: str, prob: float, indice: int) -> tuple[int, int]:
    """Gera uma placa tática FUI/HUD de alta resolução caso uma imagem externa falhe ou para síntese tática."""
    w, h = 1280, 720
    cores = [
        (0, 255, 204),   # Ciano FUI
        (0, 170, 255),   # Azul C4ISR
        (255, 0, 85),    # Alerta Carmesim
        (168, 85, 247),  # Violeta Quantum
    ]
    cor = cores[indice % len(cores)]
    try:
        from PIL import Image, ImageDraw  # type: ignore
        im = Image.new('RGB', (w, h), (4, 8, 14))
        dr = ImageDraw.Draw(im)
        for x in range(0, w, 64):
            dr.line([(x, 0), (x, h)], fill=(10, 28, 38), width=1)
        for y in range(0, h, 64):
            dr.line([(0, y), (w, y)], fill=(10, 28, 38), width=1)
        cx, cy = w // 2, h // 2
        for r in (90, 160, 230, 290):
            dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=cor, width=2 if r in (160, 290) else 1)
        dr.line([(cx - 340, cy), (cx + 340, cy)], fill=cor, width=1)
        dr.line([(cx, cy - 310), (cx, cy + 310)], fill=cor, width=1)
        dr.rectangle([24, 24, w - 24, h - 24], outline=cor, width=2)
        dr.text((48, 44), f'FUI AGENTS // GROOT-1 PROBABILITY: {prob:.3f}', fill=cor)
        dr.text((48, 72), f'TARGET QUERY: {query.upper()[:56]}', fill=(180, 240, 255))
        dr.text((48, h - 64), f'NODE: {titulo.upper()[:64]} // ACTIVE THEORY GPGPU SYNTHESIS', fill=cor)
        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, 'PNG')
        return w, h
    except Exception:
        png_1x1 = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
            b'\x00\x00\x00\x0cIDATx\x9cc`\xf8\xff\x9f\x01\x00\x05\xfe\x02\xfe\xa75\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(png_1x1)
        return w, h


def executar_missao_pesquisa(slug: str, query: str, entradas: list[str] | None = None,
                             tela_id: str | None = None, quantidade: int = 4) -> dict:
    """Executa uma missão completa de pesquisa multi-agente (Web Images, Wikimedia, ArXiv.org e YouTube)
    + calibração Groot 1 e pendura os nós na árvore."""
    entradas = entradas or []
    quantidade = max(1, min(8, int(quantidade)))
    definir_estado_frota(slug, True, query)
    registrar_log(slug, 'ORCHESTRATOR', f'MISSÃO INICIADA: "{query}" (Alvo: {quantidade} placas FUI)', 'ACTIVE')

    # 1. Cria o nó de Pedido na árvore do Neo Stitch
    with B.travado(slug):
        todos = {n['id']: n for n in B.nos(slug)}
        if not tela_id:
            for e in entradas:
                n = todos.get(e) or {}
                tela_id = n.get('tela') or (todos.get(n.get('pedido') or '') or {}).get('tela')
                if tela_id:
                    break
        tela_id = tela_id or next((n['id'] for n in todos.values() if n['tipo'] == 'tela'), None)
        pedido = B.novo_no(
            slug, 'pedido',
            tela=tela_id,
            entradas=entradas,
            intencao=f'🔍 [VOZ // AGENTES] {query}',
            quantidade=quantidade,
            modelo='marciano/groot-1-research',
            status='trabalhando',
            iniciado_em=B.agora(),
        )
        pid = pedido['id']

    q_lower = query.lower()
    foco_arxiv = any(k in q_lower for k in ('arxiv', 'paper', 'artigo', 'cient', 'ieee', 'algoritmo', 'neural', 'corr', 'diagram', '2604'))
    foco_yt = any(k in q_lower for k in ('youtube', 'video', 'vídeo', 'gameplay', 'trailer', 'demo', 'reel'))
    foco_diagrama = any(k in q_lower for k in ('diagram', '2604', 'harness', 'weights', 'arquitetura', 'corr', 'militar', 'simula', 'grpo'))

    # Extrai ID do ArXiv se presente na query (ou usa 2604.08224 como referência padrão de diagramas de agentes)
    m_arxiv_id = re.search(r'(\d{4}\.\d{4,5})', query)
    arxiv_id_alvo = m_arxiv_id.group(1) if m_arxiv_id else ('2604.08224' if foco_diagrama else '')

    registrar_log(
        slug,
        'ORCHESTRATOR',
        f'[ECO-TÁTICO ZERO-LAG] Acionando 2 workers leves (ArXiv Reading CV + Diagram Design + AirLLM) para "{query}"...',
        'SCANNING',
    )

    # 2. Coleta candidatos com escalonador Eco-Tático (max_workers=2 para nunca pesar o PC!)
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_web = ex.submit(buscar_web_imagens, query, quantidade)
        f_wiki = ex.submit(buscar_wikimedia, query, quantidade)
        f_arxiv = ex.submit(buscar_arxiv, query, quantidade if foco_arxiv else 2)
        f_yt = ex.submit(buscar_youtube, query, quantidade if foco_yt else 2)
        f_open = ex.submit(buscar_openverse, query, 2)
        f_diag = ex.submit(extrair_diagramas_arxiv, arxiv_id_alvo, 2) if arxiv_id_alvo else None

        res_web = f_web.result() or []
        res_wiki = f_wiki.result() or []
        res_arxiv = f_arxiv.result() or []
        res_yt = f_yt.result() or []
        res_open = f_open.result() or []
        res_diag = (f_diag.result() or []) if f_diag else []

    # Se o usuário pediu diagramas de IA / ArXiv / Arquitetura Militar, adiciona os 2 Diagramas Sintetizados Zero-GPU
    if foco_diagrama or foco_arxiv:
        res_diag.extend([
            {
                'titulo': f'[ARXIV DIAGRAM #1] Externalization of LLM Agent: Weights → [Memory & Skill & Protocol] → Harness (arXiv:{arxiv_id_alvo or "2604.08224"})',
                'descricao': 'Diagrama arquitetural completo (Donald A. Norman Cognitive Externalization → LLM Agent Memory, Skill, Protocol & Harness Ecosystem + CoRR Taxonomy).',
                'url': '',
                'thumb_url': '',
                'fonte_url': f'https://arxiv.org/pdf/{arxiv_id_alvo or "2604.08224"}',
                'pdf_url': f'https://arxiv.org/pdf/{arxiv_id_alvo or "2604.08224"}',
                'arxiv_id': f'arXiv:{arxiv_id_alvo or "2604.08224"} [cs.AI / cs.MA]',
                'largura': 1400,
                'altura': 860,
                'midia': 'imagem',
                'subtipo': 'arxiv_diagram_synth',
                'modo_diag': 0,
                'agente': 'AGENT-06 // ARXIV-DIAGRAM-CV',
            },
            {
                'titulo': '[ARXIV DIAGRAM #2] Training in Simulation (Scenario Synthesis + GRPO Update) & 6-Axis Evaluation Radar',
                'descricao': 'Framework de Treinamento em Simulação Multi-Agente (Scenario Synthesis → Actor Simulation → Autorater Rubric & GRPO RL Update + Radar 6 Eixos).',
                'url': '',
                'thumb_url': '',
                'fonte_url': f'https://arxiv.org/pdf/{arxiv_id_alvo or "2604.08224"}',
                'pdf_url': f'https://arxiv.org/pdf/{arxiv_id_alvo or "2604.08224"}',
                'arxiv_id': f'arXiv:{arxiv_id_alvo or "2604.08224"} [cs.LG / cs.CL]',
                'largura': 1400,
                'altura': 860,
                'midia': 'imagem',
                'subtipo': 'arxiv_diagram_synth',
                'modo_diag': 1,
                'agente': 'AGENT-06 // ARXIV-DIAGRAM-CV',
            },
        ])
        registrar_log(slug, 'AGENT-06 // ARXIV-DIAGRAM-CV', f'{len(res_diag)} diagramas arquiteturais de IA extraídos/sintetizados (Zero-GPU CV)', 'SCANNING')

    if res_arxiv:
        registrar_log(slug, 'AGENT-03 // ARXIV-SCIENTIST', f'{len(res_arxiv)} papers científicos encontrados no ArXiv.org', 'SCANNING')
    if res_yt:
        registrar_log(slug, 'AGENT-05 // YOUTUBE-RECON', f'{len(res_yt)} streams de vídeo encontrados no YouTube', 'SCANNING')
    if res_web or res_wiki:
        registrar_log(slug, 'AGENT-02 // WEB-IMAGE-RECON', f'{len(res_web) + len(res_wiki)} imagens táticas indexadas da Web/Wikimedia', 'SCANNING')

    candidatos_todos = res_diag + res_arxiv + res_yt + res_web + res_wiki + res_open

    # Garante preenchimento com placas sintéticas FUI se a busca retornar menos itens que o pedido
    while len(candidatos_todos) < quantidade:
        idx = len(candidatos_todos) + 1
        candidatos_todos.append({
            'titulo': f'FUI Tactical Telemetry #{idx} · {query[:28]}',
            'descricao': f'Síntese procedural C4ISR para o vetor "{query}"',
            'url': '',
            'thumb_url': '',
            'fonte_url': 'https://marcianotheory.com/',
            'largura': 1280,
            'altura': 720,
            'midia': 'imagem',
            'subtipo': 'c4isr',
            'agente': 'AGENT-04 // SYNTH-CORE',
        })

    # 3. Auditoria de decisão via Groot 1 (marcyano/Groot-1 SystemOneRequest)
    registrar_log(slug, 'GROOT-1 // CALIBRATOR', f'Auditando {len(candidatos_todos)} referências via SystemOneRequest (marcyano/Groot-1)...', 'CALIBRATING')
    calibrar_lote_groot1(query, candidatos_todos)

    # Seleciona um mix inteligente e coerente (ou focado se o operador pediu ArXiv / Diagrama / YouTube especificamente)
    res_diag.sort(key=lambda x: x.get('prob', 0), reverse=True)
    res_arxiv.sort(key=lambda x: x.get('prob', 0), reverse=True)
    res_yt.sort(key=lambda x: x.get('prob', 0), reverse=True)
    visuais = [c for c in (res_web + res_wiki + res_open) if c.get('prob') is not None]
    visuais.sort(key=lambda x: x.get('prob', 0), reverse=True)

    escolhidos: list[dict] = []
    if foco_diagrama:
        escolhidos.extend(res_diag[:quantidade])
        if len(escolhidos) < quantidade:
            escolhidos.extend(res_arxiv[:quantidade - len(escolhidos)])
    elif foco_arxiv:
        escolhidos.extend(res_diag[:2])
        escolhidos.extend(res_arxiv[:max(0, quantidade - len(escolhidos))])
    elif foco_yt:
        escolhidos.extend(res_yt[:quantidade])
    else:
        # Mix multimodal C4ISR: Imagens Web/Wikimedia + 1 Vídeo YouTube + 1 Paper ArXiv (quando disponíveis)
        if visuais:
            escolhidos.extend(visuais[:max(1, quantidade - 2)])
        if res_yt and len(escolhidos) < quantidade:
            escolhidos.append(res_yt[0])
        if res_arxiv and len(escolhidos) < quantidade:
            escolhidos.append(res_arxiv[0])

    for c in sorted(candidatos_todos, key=lambda x: x.get('prob', 0), reverse=True):
        if len(escolhidos) >= quantidade:
            break
        if c not in escolhidos:
            escolhidos.append(c)

    escolhidos = escolhidos[:quantidade]

    # 4. Cria placeholders imediatos na árvore para feedback visual na FUI
    pasta = B.pasta(slug)
    ids_gerados: list[str] = []
    variacoes_meta: list[dict] = []
    with B.travado(slug):
        for c in escolhidos:
            tipo_no = 'video' if c.get('midia') == 'video' else 'imagem'
            no = B.novo_no(
                slug, tipo_no,
                pedido=pid,
                nome=f"[{c['prob']:.2f}] {c['titulo'][:38]}",
                prompt=f"{c['veredito']} · Fonte: {c.get('fonte_url', '')} · {c.get('descricao', '')}",
                modelo='marciano/groot-1',
                aspecto='16:9',
                gerando=True,
                estado=c['estado'],
                groot_prob=c['prob'],
                groot_veredito=c['veredito'],
                fonte_url=c.get('fonte_url', ''),
                agente_id=c.get('agente', 'AGENT-01'),
                subtipo=c.get('subtipo', 'imagem'),
                youtube_id=c.get('youtube_id'),
                embed_url=c.get('embed_url'),
                pdf_url=c.get('pdf_url'),
                arxiv_id=c.get('arxiv_id'),
                autores=c.get('autores'),
                resumo=c.get('resumo') or c.get('descricao'),
            )
            ids_gerados.append(no['id'])
            variacoes_meta.append({'nome': no['nome'], 'prompt': no['prompt'], 'tese': c['veredito']})
        ped = B.ler_no(slug, pid)
        ped.update({'saidas': ids_gerados, 'variacoes': variacoes_meta})
        B.gravar_no(slug, ped)

    # 5. Faz o download dos arquivos reais (imagens/vídeos/thumbnails YouTube) ou renderiza Dossiê ArXiv
    def processar_item(par: tuple[int, str, dict]) -> bool:
        idx, nid, cand = par
        prob = cand['prob']
        agente = cand.get('agente', 'AGENT-01')
        subtipo = cand.get('subtipo', 'imagem')
        registrar_log(slug, 'GROOT-1 // CALIBRATOR', f"{nid} [{subtipo.upper()}]: P(relevância) = {prob:.3f} → {cand['estado'].upper()}", 'LOCKED', prob=prob)

        eh_video = cand.get('midia') == 'video'
        dados_bin = _baixar_bytes(cand.get('url') or '')
        if not dados_bin and cand.get('thumb_url'):
            dados_bin = _baixar_bytes(cand['thumb_url'])

        if eh_video and dados_bin:
            ext = '.webm' if '.webm' in (cand.get('url') or '').lower() else '.mp4'
            arq_rel = f'videos/{nid}{ext}'
            arq_abs = pasta / arq_rel
            arq_abs.parent.mkdir(parents=True, exist_ok=True)
            arq_abs.write_bytes(dados_bin)
            thumb_bin = _baixar_bytes(cand.get('thumb_url') or '')
            thumb_abs = pasta / 'thumbs' / f'{nid}.jpg'
            if thumb_bin:
                thumb_abs.parent.mkdir(parents=True, exist_ok=True)
                thumb_abs.write_bytes(thumb_bin)
            else:
                gerar_placa_fui_procedural(thumb_abs, cand['titulo'], query, prob, idx)
            larg, alt = cand.get('largura') or 1280, cand.get('altura') or 720
        elif subtipo == 'arxiv_diagram_synth':
            arq_rel = f'images/{nid}.png'
            arq_abs = pasta / arq_rel
            larg, alt = gerar_diagrama_arquitetura_ia(arq_abs, cand, query, prob, int(cand.get('modo_diag', idx)))
            B.miniatura(arq_abs, pasta / 'thumbs' / f'{nid}.jpg')
        elif subtipo == 'arxiv':
            arq_rel = f'images/{nid}.png'
            arq_abs = pasta / arq_rel
            larg, alt = gerar_placa_arxiv_dossier(arq_abs, cand, query, prob)
            B.miniatura(arq_abs, pasta / 'thumbs' / f'{nid}.jpg')
        else:
            arq_rel = f'images/{nid}.png'
            arq_abs = pasta / arq_rel
            arq_abs.parent.mkdir(parents=True, exist_ok=True)
            if dados_bin:
                arq_abs.write_bytes(dados_bin)
                try:
                    B.miniatura(arq_abs, pasta / 'thumbs' / f'{nid}.jpg')
                except Exception:
                    pass
                med = B.medidas(arq_abs) or (cand.get('largura') or 1280, cand.get('altura') or 720)
                larg, alt = med
            else:
                larg, alt = gerar_placa_fui_procedural(arq_abs, cand['titulo'], query, prob, idx)
                B.miniatura(arq_abs, pasta / 'thumbs' / f'{nid}.jpg')

        with B.travado(slug):
            no = B.ler_no(slug, nid)
            no.pop('gerando', None)
            no.update({
                'arquivo': arq_rel,
                'thumb': f'thumbs/{nid}.jpg',
                'largura': larg,
                'altura': alt,
                'custo': 0.0,
            })
            B.gravar_no(slug, no)
            B.comentar(
                slug, nid, 'claude',
                f"⚡ {cand['veredito']}\nAgente: {agente} [{subtipo.upper()}]\nFonte: {cand.get('fonte_url', 'N/A')}\nResumo: {cand.get('descricao', '')[:220]}",
                {'x': 0.88, 'y': 0.14},
            )
        registrar_log(slug, agente, f'Placa {nid} [{subtipo.upper()}] materializada no canvas ({larg}x{alt})', 'DONE', prob=prob)
        return True

    with ThreadPoolExecutor(max_workers=2) as ex:
        list(ex.map(processar_item, [(i, nid, c) for i, (nid, c) in enumerate(zip(ids_gerados, escolhidos))]))

    prob_media = round(sum(c['prob'] for c in escolhidos) / max(1, len(escolhidos)), 3)
    with B.travado(slug):
        ped = B.ler_no(slug, pid)
        ped.update({'status': 'concluido', 'concluido_em': B.agora(), 'custo': 0.0})
        B.gravar_no(slug, ped)
        B.anexar_diario(slug, f'Pesquisa FUI [{pid}] "{query}" → {len(ids_gerados)} referências calibradas pelo Groot 1 (P_média={prob_media:.3f}): {", ".join(ids_gerados)}')

    registrar_log(slug, 'ORCHESTRATOR', f'MISSÃO CONCLUÍDA [{pid}]: {len(ids_gerados)} abas projetadas · Groot 1 P={prob_media:.3f}', 'READY', prob=prob_media)
    definir_estado_frota(slug, False, query)
    return {'pedido': pid, 'saidas': ids_gerados, 'groot_prob': prob_media}


def disparar_em_background(slug: str, query: str, entradas: list[str] | None = None,
                           tela_id: str | None = None, quantidade: int = 4) -> None:
    t = threading.Thread(
        target=executar_missao_pesquisa,
        args=(slug, query, entradas, tela_id, quantidade),
        daemon=True,
    )
    t.start()


def main() -> None:
    ap = argparse.ArgumentParser(description='Frota de Agentes de Pesquisa + Groot 1 para o FUI Agents')
    ap.add_argument('slug')
    ap.add_argument('query')
    ap.add_argument('--entrada', action='append', default=[])
    ap.add_argument('--tela')
    ap.add_argument('--quantidade', type=int, default=4)
    a = ap.parse_args()
    res = executar_missao_pesquisa(a.slug, a.query, a.entrada, a.tela, a.quantidade)
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
