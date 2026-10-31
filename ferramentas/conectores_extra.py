"""Conectores extras da pesquisa: notícias (RSS), Wikipedia e artigos científicos (OpenAlex, com Crossref de reserva).

Só biblioteca padrão (o cartão de leitura usa Pillow, que o servidor declara no cabeçalho). Cada conector devolve
candidatos no mesmo formato que `agentes_pesquisa` já usa, e NUNCA levanta exceção: uma fonte que cai vira lista vazia
e um aviso no log do servidor. Os feeds vêm do catálogo (dados/fontes.json) e pulam o que o último
`fontes.py verificar` marcou como fora do ar.

Direitos: notícias guardam título, resumo curto, data, fonte e LINK. Não baixam a foto da matéria (é do veículo);
o cartão é desenhado aqui, em texto.
"""
from __future__ import annotations

import html
import json
import re
import sys
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

DADOS = Path(__file__).resolve().parent / 'dados'
UA = 'FUIAgents/3.0 (projeto pessoal de pesquisa; Python urllib)'
MAX_BYTES = 3 * 1024 * 1024
TTL_FEED = 300  # os feeds mudam pouco: 5 min de cache evitam martelar o mesmo servidor a cada missão
SUBTIPOS_TEXTO = ('noticia', 'wiki', 'paper')
ROTULO = {'noticia': 'NOTÍCIA', 'wiki': 'WIKIPEDIA', 'paper': 'ARTIGO', 'grafico': 'GRÁFICO'}
AGENTE = {'noticia': 'AGENT-07 // NEWS-WIRE', 'wiki': 'AGENT-08 // WIKI-SCAN', 'paper': 'AGENT-09 // PAPER-SCAN',
          'grafico': 'AGENT-10 // DATA-VIZ'}
# palavras que dizem "quero notícia", não "sobre o quê": saem do filtro por assunto
PALAVRAS_DE_NOTICIA = frozenset(
    'noticia noticias news urgente urgentes urgent hoje today ultimas ultima latest breaking manchete manchetes '
    'jornal atualidades recentes'.split())
# conteúdo pago que os feeds misturam às matérias (visto: "especial-publicitario" do G1 entrando como notícia)
_PUBLICIDADE = ('publicitario', 'publieditorial', 'patrocinad', 'advertorial', 'sponsored', 'partner-content', 'branded-content')
_PT = frozenset('de do da dos das em no na nos nas para por com sem sobre que uma um os as ao aos e ou'.split())
_CACHE: dict[str, tuple[float, bytes]] = {}
_TRAVA = threading.Lock()
_UTC = timezone.utc


def _aviso(fonte: str, erro: Exception) -> None:
    print(f'[pesquisa] {fonte} falhou: {type(erro).__name__}: {str(erro)[:100]}', file=sys.stderr, flush=True)


def _sem_acento(s: str) -> str:
    return unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()


def escolher_idioma(query: str) -> str:
    """'pt' se a frase parece português (acento ou palavra funcional), senão 'en'."""
    if re.search(r'[ãõçáéíóúâêô]', query.lower()) or any(t in _PT for t in re.findall(r'\w+', query.lower())):
        return 'pt'
    return 'en'


def _get(url: str, timeout: int = 8, ttl: int = 0) -> bytes:
    agora = time.time()
    if ttl:
        with _TRAVA:
            hit = _CACHE.get(url)
        if hit and agora - hit[0] < ttl:
            return hit[1]
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # certificado sempre verificado
        dados = r.read(MAX_BYTES)
    if ttl:
        with _TRAVA:
            _CACHE[url] = (agora, dados)
    return dados


def _texto(s: str, limite: int = 0) -> str:
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))
    s = re.sub(r'\s+', ' ', s).strip()
    if limite and len(s) > limite:
        s = s[:limite].rsplit(' ', 1)[0].rstrip(' ,;:.') + '…'
    return s


def _data(s: str) -> datetime | None:
    s = (s or '').strip()
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=_UTC)


def _cand(subtipo: str, titulo: str, resumo: str, fonte_url: str, fonte_nome: str, **extra) -> dict:
    return {
        'titulo': f'[{ROTULO[subtipo]}] {titulo[:60]}', 'titulo_completo': titulo, 'descricao': resumo, 'resumo': resumo,
        'url': '', 'thumb_url': '', 'fonte_url': fonte_url, 'fonte_nome': fonte_nome,
        'largura': 1280, 'altura': 720, 'midia': 'imagem', 'subtipo': subtipo, 'agente': AGENTE[subtipo], **extra,
    }


# ------------------------------------------------------------------ notícias (RSS / Atom / RDF)
def _local(tag) -> str:
    return tag.rsplit('}', 1)[-1] if isinstance(tag, str) else ''


def parse_feed(conteudo: bytes, limite: int = 80) -> list[dict]:
    """RSS 2.0, RDF (Deutsche Welle) e Atom num formato só: {titulo, link, resumo, data}."""
    itens: list[dict] = []
    for el in ET.fromstring(conteudo).iter():
        if _local(el.tag) not in ('item', 'entry'):
            continue
        c: dict = {}
        for f in el:
            n = _local(f.tag)
            if n == 'title' and 'titulo' not in c:
                c['titulo'] = _texto(''.join(f.itertext()))
            elif n == 'link' and 'link' not in c:
                c['link'] = (f.attrib.get('href') or (f.text or '')).strip()
            elif n in ('thumbnail', 'content', 'enclosure') and f.attrib.get('url') and 'imagem' not in c and (
                    n == 'thumbnail' or f.attrib.get('medium') == 'image' or 'image' in f.attrib.get('type', '')):
                c['imagem'] = f.attrib['url'].strip()  # a imagem que o próprio veículo publica no feed, para exibição
            elif n in ('description', 'summary', 'encoded', 'content') and 'resumo' not in c:
                bruto = ''.join(f.itertext())
                c['resumo'] = _texto(bruto, 380)
                m = re.search(r'<img[^>]+src=["\']([^"\']+)', bruto)
                if m and 'imagem' not in c:
                    c['imagem'] = m.group(1)
            elif n in ('pubDate', 'published', 'updated', 'date') and 'data' not in c:
                c['data'] = _data(''.join(f.itertext()))
        if c.get('titulo') and c.get('link'):
            itens.append(c)
        if len(itens) >= limite:
            break
    return itens


def feeds_do_catalogo() -> list[dict]:
    fontes = json.loads((DADOS / 'fontes.json').read_text(encoding='utf-8'))['fontes']
    try:
        status = json.loads((DADOS / 'fontes_status.json').read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        status = {}
    return [f for f in fontes if f['cat'] == 'noticias' and f['acesso'] == 'rss' and f.get('api')
            and status.get(f['id'], {}).get('estado', 'ok') == 'ok']


def buscar_noticias(kw: list[str], limite: int = 3, *, baixar=_get, feeds: list[dict] | None = None) -> list[dict]:
    """Notícias dos feeds do catálogo. Com assunto, só as que o citam (título pesa 2, resumo 1). Sem assunto
    ('notícias urgentes'), as mais recentes. No máximo uma por veículo na 1ª rodada, para variar a fonte."""
    try:
        termos = [t for t in map(_sem_acento, kw) if t and t not in PALAVRAS_DE_NOTICIA]
        feeds = feeds if feeds is not None else feeds_do_catalogo()

        def ler(f: dict) -> tuple[dict, list[dict]]:
            try:
                return f, parse_feed(baixar(f['api'], timeout=8, ttl=TTL_FEED))
            except Exception as e:  # uma fonte que cai não derruba as outras
                _aviso(f['id'], e)
                return f, []

        with ThreadPoolExecutor(max_workers=5) as ex:
            lidos = list(ex.map(ler, feeds))
        piso = datetime.min.replace(tzinfo=_UTC)
        pontuados = []
        for f, itens in lidos:
            for it in itens:
                if any(p in _sem_acento(it['link'] + ' ' + it['titulo']) for p in _PUBLICIDADE):
                    continue  # propaganda não é notícia
                t, r = _sem_acento(it['titulo']), _sem_acento(it.get('resumo', ''))
                pontos = sum(2 for x in termos if x in t) + sum(1 for x in termos if x in r)
                if termos and not pontos:
                    continue
                pontuados.append((pontos, it.get('data') or piso, f, it))
        pontuados.sort(key=lambda x: (x[0], x[1]), reverse=True)
        escolhidos, vistos, resto = [], set(), []
        for p in pontuados:
            (resto if p[2]['id'] in vistos else escolhidos).append(p)
            vistos.add(p[2]['id'])
        saida = []
        for pontos, data, f, it in (escolhidos + resto)[:limite]:
            quando = data.strftime('%d/%m/%Y') if data != piso else ''
            saida.append(_cand('noticia', it['titulo'], it.get('resumo') or it['titulo'], it['link'], f['nome'].split(' (')[0],
                               publicado=quando, imagem_url=it.get('imagem', '')))
        return saida
    except Exception as e:
        _aviso('noticias', e)
        return []


# ------------------------------------------------------------------ Wikipedia
def buscar_wikipedia(kw: list[str], limite: int = 2, idioma: str = 'en', *, baixar=_get) -> list[dict]:
    termo = ' '.join(kw).strip()
    if not termo:
        return []
    for lang in dict.fromkeys([idioma, 'en' if idioma != 'en' else 'pt']):
        try:
            p = urllib.parse.urlencode({
                'action': 'query', 'generator': 'search', 'gsrsearch': termo, 'gsrlimit': str(limite), 'prop': 'extracts|info|pageimages',
                'exintro': '1', 'explaintext': '1', 'exsentences': '3', 'exlimit': 'max', 'inprop': 'url',
                'piprop': 'thumbnail', 'pithumbsize': '900', 'format': 'json'})
            dados = json.loads(baixar(f'https://{lang}.wikipedia.org/w/api.php?{p}', timeout=8).decode('utf-8'))
            paginas = sorted(((dados.get('query') or {}).get('pages') or {}).values(), key=lambda x: x.get('index', 99))
            saida = [_cand('wiki', pg['title'], _texto(pg.get('extract', ''), 380) or pg['title'], pg.get('fullurl', ''),
                           f'Wikipedia ({lang})', imagem_url=(pg.get('thumbnail') or {}).get('source', ''))
                     for pg in paginas if pg.get('title') and pg.get('fullurl')]
            if saida:
                return saida[:limite]
        except Exception as e:
            _aviso(f'wikipedia-{lang}', e)
    return []


# ------------------------------------------------------------------ artigos científicos
def _resumo_openalex(indice: dict | None) -> str:
    if not indice:
        return ''
    palavras: dict[int, str] = {}
    for palavra, posicoes in indice.items():
        for pos in posicoes:
            palavras[pos] = palavra
    return ' '.join(palavras[i] for i in sorted(palavras))


def _autores(lista: list[str]) -> str:
    lista = [a for a in lista if a]
    return ', '.join(lista[:3]) + (f' +{len(lista) - 3}' if len(lista) > 3 else '')


def buscar_papers(kw: list[str], limite: int = 2, *, baixar=_get) -> list[dict]:
    termo = ' '.join(kw).strip()
    if not termo:
        return []
    try:  # 1) OpenAlex
        sel = 'id,title,publication_year,doi,primary_location,authorships,abstract_inverted_index'
        dados = json.loads(baixar(f'https://api.openalex.org/works?search={urllib.parse.quote(termo)}&per-page={limite}&select={sel}',
                                  timeout=8).decode('utf-8'))
        saida = []
        for w in dados.get('results') or []:
            if not w.get('title'):
                continue
            loc = w.get('primary_location') or {}
            venue = ((loc.get('source') or {}).get('display_name')) or 'OpenAlex'
            autores = _autores([((a.get('author') or {}).get('display_name')) for a in w.get('authorships') or []])
            ano = w.get('publication_year')
            link = w.get('doi') or loc.get('landing_page_url') or w.get('id') or ''
            resumo = f'{autores} ({ano}) · {venue}. ' + _texto(_resumo_openalex(w.get('abstract_inverted_index')), 300)
            saida.append(_cand('paper', w['title'], resumo.strip(), link, venue, autores=autores, publicado=str(ano or '')))
        if saida:
            return saida[:limite]
    except Exception as e:
        _aviso('openalex', e)
    try:  # 2) Crossref, se o OpenAlex falhar ou vier vazio
        dados = json.loads(baixar('https://api.crossref.org/works?' + urllib.parse.urlencode({
            'query': termo, 'rows': str(limite), 'select': 'DOI,title,author,issued,container-title,URL,abstract'}),
            timeout=8).decode('utf-8'))
        saida = []
        for w in (dados.get('message') or {}).get('items') or []:
            if not w.get('title'):
                continue
            venue = (w.get('container-title') or ['Crossref'])[0]
            autores = _autores([f"{a.get('given', '')} {a.get('family', '')}".strip() for a in w.get('author') or []])
            ano = ((w.get('issued') or {}).get('date-parts') or [[None]])[0][0]
            resumo = f'{autores} ({ano}) · {venue}. ' + _texto(w.get('abstract', ''), 300)
            saida.append(_cand('paper', w['title'][0], resumo.strip(), w.get('URL') or f"https://doi.org/{w.get('DOI', '')}",
                               venue, autores=autores, publicado=str(ano or '')))
        return saida[:limite]
    except Exception as e:
        _aviso('crossref', e)
        return []


# ------------------------------------------------------------------ gráfico real: publicações por ano
def buscar_grafico(kw: list[str], *, baixar=_get) -> list[dict]:
    """Quantas obras por ano citam o assunto (OpenAlex, `group_by=publication_year`). É dado de verdade da busca,
    não um desenho fixo. Só com assunto: 'notícias urgentes' sozinho não tem o que medir."""
    termos = [t for t in kw if _sem_acento(t) not in PALAVRAS_DE_NOTICIA]
    if not termos:
        return []
    termo = ' '.join(termos)
    try:
        dados = json.loads(baixar('https://api.openalex.org/works?' + urllib.parse.urlencode(
            {'search': termo, 'group_by': 'publication_year'}), timeout=8).decode('utf-8'))
        atual = datetime.now().year
        serie = sorted((int(g['key']), int(g['count'])) for g in dados.get('group_by') or []
                       if str(g.get('key', '')).isdigit() and atual - 15 <= int(g['key']) <= atual)
        total = sum(c for _, c in serie)
        if len(serie) < 3 or not total:
            return []
        pico = max(serie, key=lambda g: g[1])
        resumo = (f'{total:,} obras citam "{termo}" entre {serie[0][0]} e {serie[-1][0]}; '
                  f'o pico foi em {pico[0]} ({pico[1]:,}). {atual} está em andamento.').replace(',', '.')
        return [_cand('grafico', f'Publicações por ano: {termo}', resumo,
                      f'https://openalex.org/works?search={urllib.parse.quote(termo)}', 'OpenAlex',
                      serie=serie, termo=termo, publicado=str(atual))]
    except Exception as e:
        _aviso('openalex-grafico', e)
        return []


def _curto(n: int) -> str:
    """Rótulo curto e na mesma escala em todo o gráfico: 950, 7,9 mil, 62,6 mil, 1,2 mi."""
    if n >= 1_000_000:
        return f'{n / 1_000_000:.1f} mi'.replace('.', ',')
    return f'{n / 1000:.1f} mil'.replace('.', ',') if n >= 1000 else str(n)


def gerar_grafico(destino: Path, cand: dict, prob: float) -> tuple[int, int]:
    """Barras por ano, 1280x720, pensado para o tamanho de miniatura do canvas (~170 px): título grande e poucos
    números (só o pico e o ano mais recente). Levanta se faltar Pillow (quem chama registra e usa o cartão procedural)."""
    from PIL import Image, ImageDraw  # type: ignore
    w, h = 1280, 720
    serie: list[tuple[int, int]] = cand['serie']
    atual = datetime.now().year
    cor, cor_parcial = (255, 85, 0), (140, 70, 30)
    im = Image.new('RGB', (w, h), (13, 14, 18))
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, 14, h], fill=cor)
    x, largura = 64, w - 64 - 56
    dr.text((x, 40), f'GRÁFICO · {cand.get("fonte_nome", "")}'.upper(), font=_fonte(30, True), fill=cor)
    fonte_t, linhas = _ajustar(dr, cand.get('termo') and f'Publicações por ano: {cand["termo"]}' or cand['titulo'], largura, 2, (76, 64, 54))
    y = 90
    for linha in linhas:
        dr.text((x, y), linha, font=fonte_t, fill=(245, 245, 247))
        y += fonte_t.size + 10
    gx0, gy0, gx1, gy1 = 70, max(y + 30, 250), w - 56, h - 90
    topo = max(c for _, c in serie)
    for i in range(4):
        gy = gy1 - (gy1 - gy0) * i / 3
        dr.line([(gx0, gy), (gx1, gy)], fill=(34, 36, 44), width=2)
    pico = max(serie, key=lambda g: g[1])[0]
    passo = (gx1 - gx0) / len(serie)
    for i, (ano, cont) in enumerate(serie):
        bx0, bx1 = gx0 + i * passo + passo * 0.14, gx0 + (i + 1) * passo - passo * 0.14
        by0 = gy1 - (gy1 - gy0) * cont / topo
        dr.rectangle([bx0, by0, bx1, gy1], fill=cor_parcial if ano == atual else cor)
        if ano == atual:  # ano em andamento: contorno, para ninguém ler como queda
            dr.rectangle([bx0, by0, bx1, gy1], outline=cor, width=3)
        if ano in (pico, serie[-1][0]):
            rot = _curto(cont)
            dr.text(((bx0 + bx1) / 2 - dr.textlength(rot, font=_fonte(30, True)) / 2, by0 - 40), rot, font=_fonte(30, True), fill=(245, 245, 247))
        if i % 2 == 0 or i == len(serie) - 1:
            lab = f"{str(ano)[2:]}{'*' if ano == atual else ''}"
            dr.text(((bx0 + bx1) / 2 - dr.textlength(lab, font=_fonte(26)) / 2, gy1 + 12), lab, font=_fonte(26), fill=(190, 192, 200))
    dr.text((x, h - 46), '* ano em andamento (incompleto)', font=_fonte(22), fill=(130, 133, 142))
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, 'PNG')
    return w, h


# ------------------------------------------------------------------ cartão de leitura (Pillow)
_COR = {'noticia': (255, 85, 0), 'wiki': (120, 180, 255), 'paper': (255, 196, 0)}


def _fonte(tamanho: int, negrito: bool = False):
    from PIL import ImageFont  # type: ignore
    for nome in (('arialbd.ttf', 'DejaVuSans-Bold.ttf') if negrito else ('arial.ttf', 'DejaVuSans.ttf')):
        try:
            return ImageFont.truetype(nome, tamanho)
        except OSError:
            continue
    return ImageFont.load_default(size=tamanho)


def _quebrar(dr, texto: str, fonte, largura: int, max_linhas: int) -> list[str]:
    linhas, atual = [], ''
    for palavra in texto.split():
        teste = f'{atual} {palavra}'.strip()
        if dr.textlength(teste, font=fonte) <= largura:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    if len(linhas) > max_linhas:
        linhas = linhas[:max_linhas]
        linhas[-1] = linhas[-1].rstrip(' ,;:.') + '…'
    return linhas


def _ajustar(dr, texto: str, largura: int, max_linhas: int, tamanhos: tuple[int, ...]):
    """Maior corpo de letra em que o título cabe sem cortar; no menor, corta com reticências."""
    for t in tamanhos:
        f = _fonte(t, True)
        linhas = _quebrar(dr, texto, f, largura, max_linhas + 1)
        if len(linhas) <= max_linhas and not linhas[-1].endswith('…'):
            return f, linhas
    f = _fonte(tamanhos[-1], True)
    return f, _quebrar(dr, texto, f, largura, max_linhas)


def _baixar_imagem(url: str, baixar):
    """Foto que o próprio feed/verbete publica para exibição. Falhou ou é ícone/logo (<200 px) → None e o cartão sai sem foto."""
    if not url.startswith('http'):
        return None
    try:
        import io

        from PIL import Image  # type: ignore
        im = Image.open(io.BytesIO(baixar(url, timeout=8)))
        im.load()
        return im.convert('RGB') if min(im.size) >= 200 else None
    except Exception as e:
        _aviso('imagem do cartão', e)
        return None


def _cobrir(im, w: int, h: int):
    """Preenche w x h sem distorcer: amplia até cobrir e corta o centro."""
    esc = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * esc)), max(h, round(im.height * esc))))
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def gerar_cartao_leitura(destino: Path, cand: dict, prob: float, *, baixar=_get) -> tuple[int, int]:
    """Cartão 1280x720 feito para o tamanho de miniatura do canvas (~170 px de largura): com foto, ela ocupa o fundo e o
    título vai embaixo em letra grande; sem foto, o título grande sobre fundo escuro. O resumo não entra na imagem
    (não se lê em miniatura): fica no comentário do nó e na tela cheia. Levanta se faltar Pillow."""
    from PIL import Image, ImageDraw  # type: ignore
    w, h = 1280, 720
    cor = _COR.get(cand.get('subtipo'), (255, 85, 0))
    foto = _baixar_imagem(cand.get('imagem_url') or '', baixar)
    if foto:
        im = _cobrir(foto, w, h)
        grad = Image.new('L', (1, h))
        for yy in range(h):
            grad.putpixel((0, yy), 0 if yy < 150 else int(238 * ((yy - 150) / (h - 150)) ** 0.75))
        im = Image.composite(Image.new('RGB', (w, h), (8, 8, 12)), im, grad.resize((w, h)))
    else:
        im = Image.new('RGB', (w, h), (13, 14, 18))
    dr = ImageDraw.Draw(im)
    if not foto:
        dr.rectangle([0, 0, 14, h], fill=cor)
    x, largura = 56, w - 56 - 56
    tipo = ROTULO.get(cand.get('subtipo'), 'FONTE')
    # verbete: a própria fonte já diz "Wikipedia (pt)"; repetir o tipo na etiqueta é ruído
    partes = (cand.get('fonte_nome'), cand.get('publicado')) if cand.get('subtipo') == 'wiki' else (tipo, cand.get('fonte_nome'), cand.get('publicado'))
    rotulo = ' · '.join(p for p in partes if p).upper()
    ft = _fonte(32, True)
    dr.rounded_rectangle([x - 4, 36, x + dr.textlength(rotulo, font=ft) + 24, 36 + 56], radius=10, fill=cor)
    dr.text((x + 8, 44), rotulo, font=ft, fill=(16, 16, 20))
    fonte_t, linhas = _ajustar(dr, cand.get('titulo_completo') or cand['titulo'], largura, 3 if foto else 4, (88, 76, 66, 58))
    passo = fonte_t.size + 12
    y = h - 48 - passo * len(linhas) if foto else 140
    for linha in linhas:
        dr.text((x, y), linha, font=fonte_t, fill=(255, 255, 255))
        y += passo
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, 'PNG')
    return w, h
