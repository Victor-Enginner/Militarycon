# /// script
# requires-python = ">=3.11"
# ///
"""Perguntar ao Google: Gemini com Grounding with Google Search, na camada gratuita.

Só biblioteca padrão. A chave GEMINI_API_KEY vem do ambiente, de .env na raiz ou de ~/.env (nunca é impressa nem gravada).

Termos do Google (ai.google.dev/gemini-api/terms): o resultado só pode ser mostrado a quem fez a pergunta, junto das
Search Suggestions, e não pode ser guardado, indexado nem usado para treinar. Por isso este módulo NÃO grava nada além de
um contador diário de uso (para não estourar a cota gratuita); a resposta vai direto para a tela e some.

Formato da API: documentação oficial do grounding (Interactions API), POST /v1beta/interactions.
Teste à mão (precisa da chave):  uv run ferramentas/google_gemini.py "o que é a arquitetura Harness em agentes de IA?"
"""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
# 2.5 Flash: 500 consultas/dia grátis na camada gratuita (página de preços do Gemini). Troque com GEMINI_MODEL.
MODELO_PADRAO = 'gemini-2.5-flash'
LIMITE_DIARIO = 450  # folga de 50 sobre os 500 grátis
MAX_PERGUNTA = 500
RAIZ = Path(__file__).resolve().parent.parent
ARQ_USO = Path(__file__).resolve().parent / 'dados' / 'gemini_uso.json'
_TRAVA = threading.Lock()


class SemChave(RuntimeError):
    """Falta GEMINI_API_KEY."""


class LimiteDiario(RuntimeError):
    """A cota diária local acabou."""


class FalhaGoogle(RuntimeError):
    """O Google recusou ou respondeu algo que não entendemos."""


def ler_env(nome: str) -> str | None:
    if os.environ.get(nome):
        return os.environ[nome]
    for env in (RAIZ / '.env', Path.home() / '.env'):
        if env.exists():
            for linha in env.read_text(encoding='utf-8').splitlines():
                if linha.strip().startswith(f'{nome}='):
                    return linha.split('=', 1)[1].strip().strip('"').strip("'") or None
    return None


def _gastar_cota() -> int:
    """Conta a consulta de hoje e devolve quantas ainda restam. Só um número por dia: nunca o conteúdo."""
    hoje = date.today().isoformat()
    with _TRAVA:
        try:
            uso = json.loads(ARQ_USO.read_text(encoding='utf-8'))
        except (FileNotFoundError, ValueError):
            uso = {}
        n = uso.get('n', 0) if uso.get('dia') == hoje else 0
        if n >= LIMITE_DIARIO:
            raise LimiteDiario(f'Limite diário local de {LIMITE_DIARIO} consultas ao Google atingido. Volta amanhã.')
        ARQ_USO.parent.mkdir(parents=True, exist_ok=True)
        ARQ_USO.write_text(json.dumps({'dia': hoje, 'n': n + 1}), encoding='utf-8')
        return LIMITE_DIARIO - (n + 1)


def _achar(obj, chave: str):
    """Primeiro valor de `chave` em qualquer profundidade (o formato dos passos varia entre modelos)."""
    if isinstance(obj, dict):
        if chave in obj:
            return obj[chave]
        for v in obj.values():
            r = _achar(v, chave)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _achar(v, chave)
            if r is not None:
                return r
    return None


def interpretar(resposta: dict) -> dict:
    """Extrai texto, fontes, consultas e Search Suggestions da resposta. Tolerante: ignora o que não reconhece."""
    textos: list[str] = []
    fontes: dict[str, str] = {}
    consultas: list[str] = []
    sugestoes = ''

    for passo in resposta.get('steps') or []:
        tipo = passo.get('type')
        if tipo == 'google_search_call':
            consultas += [q for q in ((passo.get('arguments') or {}).get('queries') or []) if isinstance(q, str)]
        elif tipo == 'google_search_result':
            s = _achar(passo, 'search_suggestions')
            if isinstance(s, str) and s:
                sugestoes = s
        elif tipo == 'model_output':
            for bloco in passo.get('content') or []:
                if isinstance(bloco, dict) and isinstance(bloco.get('text'), str):
                    textos.append(bloco['text'])
                    for a in bloco.get('annotations') or []:
                        if isinstance(a, dict) and a.get('url'):
                            fontes.setdefault(a['url'], a.get('title') or a['url'])

    # formato alternativo (generateContent), por garantia
    if not textos:
        for cand in resposta.get('candidates') or []:
            for parte in (cand.get('content') or {}).get('parts') or []:
                if isinstance(parte.get('text'), str):
                    textos.append(parte['text'])
            meta = cand.get('groundingMetadata') or {}
            consultas += [q for q in meta.get('webSearchQueries') or [] if isinstance(q, str)]
            for ch in meta.get('groundingChunks') or []:
                w = ch.get('web') or {}
                if w.get('uri'):
                    fontes.setdefault(w['uri'], w.get('title') or w['uri'])
            sugestoes = sugestoes or (meta.get('searchEntryPoint') or {}).get('renderedContent') or ''

    texto = '\n\n'.join(t.strip() for t in textos if t.strip())
    if not texto:
        raise FalhaGoogle(f'Resposta sem texto (campos: {", ".join(sorted(resposta))[:120]}).')
    return {
        'texto': texto,
        'fontes': [{'titulo': t, 'url': u} for u, t in fontes.items()][:8],
        'consultas': consultas[:6],
        'sugestoes_html': sugestoes,
    }


def perguntar(pergunta: str, *, abrir=urllib.request.urlopen) -> dict:
    pergunta = (pergunta or '').strip()
    if not pergunta:
        raise ValueError('Escreva a pergunta para o Google.')
    if len(pergunta) > MAX_PERGUNTA:
        raise ValueError(f'Pergunta longa demais ({len(pergunta)} > {MAX_PERGUNTA} caracteres).')
    chave = ler_env('GEMINI_API_KEY')
    if not chave:
        raise SemChave('Falta a chave GEMINI_API_KEY. Crie uma grátis no Google AI Studio (aistudio.google.com) '
                       'e ponha no arquivo .env na raiz do projeto: GEMINI_API_KEY=sua_chave')
    modelo = ler_env('GEMINI_MODEL') or MODELO_PADRAO
    restantes = _gastar_cota()
    corpo = json.dumps({'model': modelo, 'input': pergunta, 'tools': [{'type': 'google_search'}]}).encode('utf-8')
    req = urllib.request.Request(URL, data=corpo, method='POST', headers={
        'x-goog-api-key': chave, 'Content-Type': 'application/json', 'User-Agent': 'FUIAgents/3.0 (projeto pessoal)'})
    try:
        with abrir(req, timeout=60) as r:
            resposta = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            msg = (json.loads(e.read().decode('utf-8')).get('error') or {}).get('message') or e.reason
        except Exception:
            msg = e.reason
        msg = str(msg).replace(chave, '***')[:240]
        dica = f' Se o modelo não aceita a busca grátis, tente GEMINI_MODEL={MODELO_PADRAO}.' if e.code in (400, 403, 404, 429) else ''
        raise FalhaGoogle(f'Google respondeu {e.code}: {msg}.{dica}') from None
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise FalhaGoogle(f'Não consegui falar com o Google: {type(e).__name__}.') from None
    r = interpretar(resposta)
    r.update({'modelo': modelo, 'restantes_hoje': restantes})
    return r


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('uso: uv run ferramentas/google_gemini.py "pergunta"')
    try:
        res = perguntar(' '.join(sys.argv[1:]))
    except (SemChave, LimiteDiario, FalhaGoogle, ValueError) as e:
        sys.exit(f'ERRO: {e}')
    print(res['texto'])
    print('\nFontes:')
    for f in res['fontes']:
        print(f'- {f["titulo"]}: {f["url"]}')
    print(f'\n[{res["modelo"]} · restam {res["restantes_hoje"]} consultas hoje]')
