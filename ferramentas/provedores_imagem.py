"""Provedores GRATUITOS de imagem para o gerar.py: AI Horde e Cloudflare Workers AI. Só biblioteca padrão.

O gerar.py fala com o OpenRouter (pago por imagem). Aqui ficam os provedores sem custo, escolhidos pelo nome do modelo
(`aihorde/...`, `cloudflare/...`), sem tocar no caminho do OpenRouter. Cada modelo entra no menu do app com preço 0.

  AI Horde   Gratuito, feito por voluntários. A chave anônima (0000000000) funciona, com a menor prioridade na fila. Os prompts
             passam por máquinas de voluntários: não mande nada privado. Pedimos nsfw=false, censor_nsfw=true e shared=false
             (a imagem não vai para dataset). AIHORDE_API_KEY (opcional) sobe a prioridade.
  Cloudflare 10.000 neurons/dia grátis. Precisa de CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID (ambiente, .env na raiz
             ou ~/.env; nunca impressos). O FLUX-schnell só aceita `prompt` e `steps`: a imagem sai quadrada.

Referências (imagens de entrada) não são suportadas por estes provedores: o gerar.py avisa e segue só com o texto.
"""
from __future__ import annotations

import base64
import io
import json
import math
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HORDE = 'https://aihorde.net/api/v2'
UA = 'FUIAgents/3.0 (projeto pessoal; Python urllib)'
ESPERA_MAXIMA = 20 * 60  # segundos na fila do Horde antes de desistir (o FLUX-schnell chegou a ~13 min nas medições)

# 'preco' 0 faz o teto de custo do gerar.py não bloquear; 'gratis' marca o caminho sem OpenRouter.
CATALOGO: dict[str, dict] = {
    'cloudflare/flux-1-schnell': {
        'provedor': 'cloudflare', 'nome': 'FLUX.1 schnell · Cloudflare (grátis)', 'api': '@cf/black-forest-labs/flux-1-schnell',
        'steps': 4, 'paralelo': 3, 'nota': 'rápido, mas sempre quadrado; precisa de conta Cloudflare grátis',
    },
    'aihorde/dreamshaper': {
        'provedor': 'aihorde', 'nome': 'Dreamshaper · AI Horde (grátis)', 'modelos': ['Dreamshaper'],
        'base': 512, 'steps': 25, 'cfg': 7, 'sampler': 'k_euler_a', 'paralelo': 2, 'nota': 'fila curta; voluntários',
    },
    'aihorde/flux-schnell': {
        'provedor': 'aihorde', 'nome': 'FLUX.1 schnell · AI Horde (grátis)', 'modelos': ['Flux.1-Schnell fp8 (Compact)'],
        'base': 1024, 'steps': 6, 'cfg': 1, 'sampler': 'k_euler', 'paralelo': 2, 'nota': 'poucos workers: a fila pode passar de 10 min',
    },
    'aihorde/z-image-turbo': {
        'provedor': 'aihorde', 'nome': 'Z-Image Turbo · AI Horde (grátis)', 'modelos': ['Z-Image-Turbo'],
        'base': 1024, 'steps': 8, 'cfg': 1, 'sampler': 'k_euler', 'paralelo': 2, 'nota': 'fila de uns 3 min; parâmetros ainda não validados',
    },
}
MODELOS_GRATIS = {k: {'nome': v['nome'], 'preco': 0.0, 'gratis': True, 'nota': v['nota']} for k, v in CATALOGO.items()}
ALIASES_GRATIS = {'horde': 'aihorde/dreamshaper', 'horde-flux': 'aihorde/flux-schnell', 'horde-z': 'aihorde/z-image-turbo',
                  'cf': 'cloudflare/flux-1-schnell', 'flux-gratis': 'cloudflare/flux-1-schnell'}


class ProvedorErro(RuntimeError):
    """Falha de um provedor gratuito, com mensagem que dá para mostrar ao usuário."""


class SemCredencial(ProvedorErro):
    """Falta chave/token do provedor."""


def eh_gratis(modelo: str) -> bool:
    return modelo in CATALOGO


def paralelismo(modelo: str) -> int:
    return CATALOGO[modelo]['paralelo']


def _env(nome: str) -> str | None:
    if os.environ.get(nome):
        return os.environ[nome]
    for arq in (RAIZ / '.env', Path.home() / '.env'):
        if arq.exists():
            for linha in arq.read_text(encoding='utf-8').splitlines():
                if linha.strip().startswith(f'{nome}='):
                    return linha.split('=', 1)[1].strip().strip('"').strip("'") or None
    return None


def _dimensoes(aspecto: str, base: int) -> tuple[int, int]:
    """Largura e altura em múltiplos de 64 com área ~ base², na proporção pedida (o Horde exige múltiplos de 64)."""
    try:
        a, b = (float(x) for x in aspecto.split(':'))
    except ValueError:
        a = b = 1.0
    larg = math.sqrt(base * base * a / b)
    alt = larg * b / a
    arred = lambda v: max(256, min(1024, int(round(v / 64)) * 64))  # noqa: E731
    return arred(larg), arred(alt)


def _para_png(dados: bytes) -> bytes:
    """O Cloudflare devolve JPEG e o Horde WebP; o canvas guarda .png. Sem Pillow, devolve como veio (o navegador abre igual)."""
    try:
        from PIL import Image  # type: ignore
        buf = io.BytesIO()
        Image.open(io.BytesIO(dados)).convert('RGB').save(buf, 'PNG')
        return buf.getvalue()
    except Exception:
        return dados


# ------------------------------------------------------------------ Cloudflare
def _gerar_cloudflare(cfg: dict, prompt: str, aspecto: str, abrir) -> tuple[bytes, dict]:
    token, conta = _env('CLOUDFLARE_API_TOKEN'), _env('CLOUDFLARE_ACCOUNT_ID')
    if not token or not conta:
        raise SemCredencial('Faltam CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID. Crie uma conta grátis em dash.cloudflare.com, '
                            'gere um token com permissão "Workers AI" e ponha as duas linhas no .env na raiz do projeto.')
    corpo = json.dumps({'prompt': prompt[:2048], 'steps': cfg['steps']}).encode()
    req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{conta}/ai/run/{cfg["api"]}', data=corpo, method='POST',
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': UA})
    try:
        with abrir(req, timeout=120) as r:
            tipo, bruto = (r.headers.get('Content-Type') or ''), r.read()
    except urllib.error.HTTPError as e:
        try:
            erros = json.loads(e.read().decode()).get('errors') or []
            msg = '; '.join(str(x.get('message', x)) for x in erros) or e.reason
        except Exception:
            msg = e.reason
        raise ProvedorErro(f'Cloudflare HTTP {e.code}: {str(msg).replace(token, "***")[:240]}') from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise ProvedorErro(f'Não consegui falar com o Cloudflare: {type(e).__name__}') from None
    if tipo.startswith('image/'):
        imagem = bruto
    else:
        j = json.loads(bruto.decode('utf-8', errors='replace'))
        if j.get('success') is False:
            raise ProvedorErro('Cloudflare recusou: ' + '; '.join(str(x.get('message', x)) for x in j.get('errors') or [])[:240])
        b64 = (j.get('result') or {}).get('image') or j.get('image')
        if not b64:
            raise ProvedorErro(f'Cloudflare respondeu sem imagem (campos: {", ".join(sorted(j))[:100]}).')
        imagem = base64.b64decode(b64)
    meta = {'provedor': 'cloudflare'}
    if aspecto not in ('1:1', ''):
        meta['aviso'] = f'o FLUX-schnell do Cloudflare só gera quadrado: o aspecto {aspecto} foi ignorado'
    return _para_png(imagem), meta


# ------------------------------------------------------------------ AI Horde
def _horde(abrir, metodo: str, caminho: str, corpo: dict | None = None, tentativas: int = 4, dormir=time.sleep):
    chave = _env('AIHORDE_API_KEY') or '0000000000'
    for n in range(tentativas):
        req = urllib.request.Request(HORDE + caminho, method=metodo, data=json.dumps(corpo).encode() if corpo is not None else None,
                                     headers={'apikey': chave, 'Client-Agent': 'FUIAgents:3.0:unknown', 'Content-Type': 'application/json',
                                              'User-Agent': UA})
        try:
            with abrir(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode()).get('message') or e.reason
            except Exception:
                msg = e.reason
            if e.code == 429 and n < tentativas - 1:  # muitos pedidos ao mesmo tempo: espera e tenta de novo
                dormir(5 * (n + 1))
                continue
            raise ProvedorErro(f'AI Horde HTTP {e.code}: {str(msg).replace(chave, "***")[:240]}') from None
        except (urllib.error.URLError, TimeoutError) as e:
            raise ProvedorErro(f'Não consegui falar com o AI Horde: {type(e).__name__}') from None
    raise ProvedorErro('AI Horde recusou por excesso de pedidos (429).')


def _gerar_horde(cfg: dict, prompt: str, aspecto: str, abrir, dormir, agora) -> tuple[bytes, dict]:
    larg, alt = _dimensoes(aspecto, cfg['base'])
    corpo = {'prompt': prompt[:1000], 'models': cfg['modelos'], 'nsfw': False, 'censor_nsfw': True, 'r2': True, 'shared': False,
             'params': {'width': larg, 'height': alt, 'steps': cfg['steps'], 'cfg_scale': cfg['cfg'], 'sampler_name': cfg['sampler'], 'n': 1}}
    rid = _horde(abrir, 'POST', '/generate/async', corpo, dormir=dormir)['id']
    t0 = agora()

    def cancelar() -> None:
        try:
            _horde(abrir, 'DELETE', f'/generate/status/{rid}', tentativas=1, dormir=dormir)
        except ProvedorErro:
            pass

    while True:
        st = _horde(abrir, 'GET', f'/generate/check/{rid}', dormir=dormir)
        if st.get('faulted'):
            raise ProvedorErro('o AI Horde marcou o pedido como falho (erro interno do serviço)')
        if st.get('is_possible') is False:
            cancelar()
            raise ProvedorErro(f'nenhum worker do AI Horde está online para {cfg["modelos"][0]} agora; tente outro modelo')
        if st.get('done'):
            break
        if agora() - t0 > ESPERA_MAXIMA:
            cancelar()
            raise ProvedorErro(f'a fila do AI Horde passou de {ESPERA_MAXIMA // 60} min para {cfg["modelos"][0]}; tente outro modelo')
        dormir(min(10, max(2, (st.get('wait_time') or 8) / 5)))
    gens = [g for g in _horde(abrir, 'GET', f'/generate/status/{rid}', dormir=dormir).get('generations') or [] if not g.get('censored')]
    if not gens or not gens[0].get('img'):
        raise ProvedorErro('o worker do AI Horde censurou a imagem ou não devolveu nada')
    img = gens[0]['img']
    if img.startswith('http'):
        try:
            with abrir(urllib.request.Request(img, headers={'User-Agent': UA}), timeout=60) as r:
                dados = r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            raise ProvedorErro(f'não consegui baixar a imagem pronta do AI Horde: {type(e).__name__}') from None
    else:
        dados = base64.b64decode(img)
    return _para_png(dados), {'provedor': 'aihorde', 'worker_modelo': gens[0].get('model'), 'segundos_na_fila': round(agora() - t0, 1)}


def gerar(modelo: str, prompt: str, aspecto: str = '1:1', *, abrir=urllib.request.urlopen, dormir=time.sleep, agora=time.time) -> tuple[bytes, dict]:
    """Devolve (PNG, metadados). Levanta ProvedorErro (ou SemCredencial) com mensagem pronta para o usuário."""
    cfg = CATALOGO[modelo]
    if not (prompt or '').strip():
        raise ProvedorErro('prompt vazio')
    if cfg['provedor'] == 'cloudflare':
        return _gerar_cloudflare(cfg, prompt, aspecto, abrir)
    return _gerar_horde(cfg, prompt, aspecto, abrir, dormir, agora)
