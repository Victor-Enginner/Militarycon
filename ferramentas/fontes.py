# /// script
# requires-python = ">=3.11"
# ///
"""Catálogo de fontes gratuitas do harness: listar e VERIFICAR o que realmente responde.

    uv run ferramentas/fontes.py listar [--cat noticias] [--chave nao]
    uv run ferramentas/fontes.py verificar [--cat papers] [--id arxiv]

O catálogo (dados/fontes.json) diz o que uma fonte promete; o resultado do teste (dados/fontes_status.json, gerado aqui)
diz o que ela fez hoje. Só biblioteca padrão. Critérios e exclusões: docs/FONTES.md.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore[attr-defined]
except Exception:
    pass

DADOS = Path(__file__).resolve().parent / 'dados'
CATALOGO = DADOS / 'fontes.json'
STATUS = DADOS / 'fontes_status.json'
UA = 'FUIAgents/3.0 (projeto pessoal de pesquisa; Python urllib)'
CONSULTA = 'radar'  # termo neutro para testar as buscas
MAX_BYTES = 3 * 1024 * 1024
ESPERA_ENTRE_PEDIDOS = 0.2
ESPERA_MESMO_HOST = 1.2  # Nominatim e outros pedem no máximo ~1 requisição por segundo


def carregar() -> list[dict]:
    return json.loads(CATALOGO.read_text(encoding='utf-8'))['fontes']


def ler_status() -> dict:
    try:
        return json.loads(STATUS.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return {}


def sondar(f: dict) -> dict:
    """Um pedido por fonte. Estados: ok · formato (respondeu, mas não como o esperado) ·
    bloqueia-robos (401/403: o site vive mas recusa automação) · limite (429) · fora (rede, timeout, 404, 5xx)."""
    alvo = f.get('api') or f['url']
    url = alvo.replace('{q}', urllib.parse.quote_plus(CONSULTA))
    espera = f.get('espera', 'status') if f.get('api') else 'status'
    t0 = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.8,pt-BR;q=0.6'})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            corpo = r.read(MAX_BYTES + 1)
            http = r.status
    except urllib.error.HTTPError as e:
        estado = 'bloqueia-robos' if e.code in (401, 403) else 'limite' if e.code == 429 else 'fora'
        return {'estado': estado, 'http': e.code, 'ms': int((time.time() - t0) * 1000), 'detalhe': str(e.reason)[:60]}
    except Exception as e:
        return {'estado': 'fora', 'http': None, 'ms': int((time.time() - t0) * 1000), 'detalhe': f'{type(e).__name__}: {str(e)[:50]}'}
    ms = int((time.time() - t0) * 1000)
    if espera == 'status' or len(corpo) > MAX_BYTES:
        return {'estado': 'ok', 'http': http, 'ms': ms, 'detalhe': f'{len(corpo)} bytes'}
    try:
        if espera == 'json':
            json.loads(corpo.decode('utf-8', errors='replace'))
        elif espera == 'xml':
            ET.fromstring(corpo)
    except Exception as e:
        return {'estado': 'formato', 'http': http, 'ms': ms, 'detalhe': f'esperava {espera}: {type(e).__name__}'}
    return {'estado': 'ok', 'http': http, 'ms': ms, 'detalhe': f'{espera} válido, {len(corpo)} bytes'}


def filtrar(fontes: list[dict], a: argparse.Namespace) -> list[dict]:
    return [f for f in fontes
            if (not getattr(a, 'cat', None) or f['cat'] == a.cat)
            and (not getattr(a, 'chave', None) or f['chave'] == a.chave)
            and (not getattr(a, 'id', None) or f['id'] == a.id)]


def cmd_listar(a: argparse.Namespace) -> None:
    status = ler_status()
    escolhidas = filtrar(carregar(), a)
    cat = None
    for f in sorted(escolhidas, key=lambda x: (x['cat'], x['id'])):
        if f['cat'] != cat:
            cat = f['cat']
            print(f'\n[{cat}]')
        s = status.get(f['id'], {}).get('estado', 'não testada')
        print(f'  {f["id"]:<18} {f["acesso"]:<7} chave:{f["chave"]:<6} {s:<14} {f["nome"]}')
    print(f'\n{len(escolhidas)} fonte(s)')


def cmd_verificar(a: argparse.Namespace) -> None:
    escolhidas = filtrar(carregar(), a)
    status = ler_status()
    ultimo_host: dict[str, float] = {}
    contagem: dict[str, int] = {}
    cat = None
    for f in sorted(escolhidas, key=lambda x: (x['cat'], x['id'])):
        host = urllib.parse.urlparse(f.get('api') or f['url']).netloc
        folga = ESPERA_MESMO_HOST - (time.time() - ultimo_host.get(host, 0))
        time.sleep(max(ESPERA_ENTRE_PEDIDOS, folga))
        r = sondar(f)
        ultimo_host[host] = time.time()
        r['em'] = datetime.now().isoformat(timespec='seconds')
        status[f['id']] = r
        contagem[r['estado']] = contagem.get(r['estado'], 0) + 1
        if f['cat'] != cat:
            cat = f['cat']
            print(f'\n[{cat}]')
        print(f'  {f["id"]:<18} {r["estado"]:<15} http={str(r["http"]):<5} {r["ms"]:>5} ms  {r["detalhe"]}', flush=True)
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding='utf-8')
    print('\nResumo:', ', '.join(f'{k}={v}' for k, v in sorted(contagem.items())), f'({len(escolhidas)} fontes)')


def main() -> None:
    ap = argparse.ArgumentParser(description='Catálogo de fontes gratuitas do harness')
    sub = ap.add_subparsers(dest='cmd', required=True)
    for nome, fn in (('listar', cmd_listar), ('verificar', cmd_verificar)):
        p = sub.add_parser(nome)
        p.add_argument('--cat')
        p.add_argument('--chave', choices=['nao', 'gratis', 'paga'])
        p.add_argument('--id')
        p.set_defaults(fn=fn)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
