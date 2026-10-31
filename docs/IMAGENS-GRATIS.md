# Imagens grátis no Neo Stitch

O `gerar.py` fala com o OpenRouter, que cobra por imagem. Estes modelos **não usam o OpenRouter**, não pedem
`OPENROUTER_API_KEY` e custam US$ 0. Código: `ferramentas/provedores_imagem.py`.

| Modelo (alias) | Provedor | Como é |
|---|---|---|
| `aihorde/dreamshaper` (`horde`) | AI Horde | 512 px, ~1 a 2 min. **Medido:** 74 s para 512×512 |
| `aihorde/flux-schnell` (`horde-flux`) | AI Horde | FLUX.1 schnell; poucos workers, fila já chegou a ~13 min |
| `aihorde/z-image-turbo` (`horde-z`) | AI Horde | fila de uns 3 min; parâmetros ainda **não validados** |
| `cloudflare/flux-1-schnell` (`cf`, `flux-gratis`) | Cloudflare Workers AI | rápido, **sempre quadrado**; precisa de conta grátis |

```bash
uv run ferramentas/gerar.py GRA-003 --modelo horde --prompt "uma raposa laranja" --aspecto 16:9
uv run ferramentas/gerar.py GRA-003 --modelo cf --prompt "uma raposa laranja"
```

Os modelos também aparecem no menu de modelo dos pedidos do app, com "(grátis)" no nome.

## AI Horde

- Funciona **sem cadastro** (chave anônima `0000000000`), com a menor prioridade na fila. Uma chave gratuita em
  `aihorde.net` sobe a prioridade: ponha `AIHORDE_API_KEY=...` no `.env`.
- É feito por voluntários: **o prompt passa por máquinas de terceiros. Não mande nada privado.**
- Mandamos `nsfw=false`, `censor_nsfw=true` e `shared=false` (a imagem não vai para dataset).
- Se a fila passar de 20 min ou não houver worker online, o pedido é cancelado e o erro sugere outro modelo.

## Cloudflare Workers AI

1. Crie uma conta grátis em `dash.cloudflare.com`.
2. Em *Workers AI*, gere um token de API com permissão de Workers AI e anote o *Account ID*.
3. Ponha no `.env` da raiz (já ignorado pelo git):

```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
```

- Cota grátis: 10.000 neurons/dia. Pelos preços publicados (4,8 neurons por bloco de 512² + 9,6 por passo), uma imagem de
  1024² com 4 passos custa ~58 neurons, ou seja, ~170 imagens por dia. A página de preços **não diz expressamente** que
  modelos de imagem entram no plano grátis: confirme no painel da conta.
- O FLUX-schnell do Cloudflare só aceita `prompt` e `steps`: o aspecto pedido é ignorado e o nó guarda um `aviso`.
- **Não foi testado ao vivo** (faltam credenciais neste PC). O formato foi conferido com a documentação e com testes
  simulados.

## Limites

- Imagens de **referência** não são suportadas: o `gerar.py` avisa e usa só o texto.
- Vídeo grátis: nenhum provedor foi verificado. O menu de vídeo continua só com os modelos do OpenRouter (pagos).
- Isto não substitui o ComfyUI local (FLUX.1 schnell já baixado em `O:\data\comfyui`), que ainda precisa de torch.
