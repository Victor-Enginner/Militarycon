# Catálogo de fontes do harness

Lista de fontes **gratuitas e legítimas** para pesquisa (notícias, TV, imagens, mapas, artigos, arquivos da web).
Nasceu das coleções OSINT [osint4all](https://start.me/p/L1rEYQ/osint4all) e [osint-500-tools](https://start.me/p/0Pqbdg/osint-500-tools),
filtradas pelos critérios abaixo, mais fontes oficiais que faltavam (marcadas `origem: claude`).

- Catálogo: `ferramentas/dados/fontes.json` (versionado)
- Resultado dos testes: `ferramentas/dados/fontes_status.json` (gerado, não versionado)
- Comandos:

```bash
uv run ferramentas/fontes.py listar --cat noticias
uv run ferramentas/fontes.py verificar            # testa todas
uv run ferramentas/fontes.py verificar --id arxiv
```

## O que cada campo promete

| Campo | Significado |
|---|---|
| `acesso` | `api` (o código chama), `rss` (feed), `manual` (só pelo navegador, sem uso programático) |
| `chave` | `nao`, `gratis` (cadastro grátis) ou `paga` (listada só para você saber que não serve) |
| `termos` | resumo dos termos de uso. **`(conferir)` = ninguém leu os termos oficiais ainda** |
| `origem` | `osint500`, `osint4all` ou `claude` (sugerida, a verificar) |

O catálogo diz o que a fonte **promete**. Quem diz o que ela **fez hoje** é o `verificar`: `ok`, `formato`
(respondeu, mas não como o esperado), `bloqueia-robos` (403: o site vive, mas recusa automação), `limite` (429) ou `fora`.

## Critérios para entrar

1. **Custo zero** para o uso que o projeto faz (cadastro grátis tudo bem; cartão ou plano pago, não).
2. **Legítima:** API ou página pública, feita para ser consultada. Sem raspagem de quem proíbe, sem burlar bloqueio.
3. **Sem rastrear pessoas.** O harness pesquisa assunto, notícia, imagem e dado público, não indivíduos.
4. **Sem acesso não autorizado** a câmeras, contas ou sistemas.

## O que ficou de fora das listas OSINT (e por quê)

| Bloco das listas | Motivo |
|---|---|
| Busca de pessoas, rosto (PimEyes), telefone, e-mail, nome de usuário | rastreia indivíduos (critério 3) |
| Vazamentos e senhas (DeHashed, Snusbase, senhas padrão) | dados roubados e acesso indevido |
| Geradores de CPF/SSN, CNH, passaporte, cartão, IMEI; geradores de perfil e chat falsos; criadores de deepfake | fraude e desinformação |
| SMS e e-mail descartáveis, números virtuais | contornar verificação de contas |
| Webcams `Insecam` e `Camhacker` | mostram câmeras sem autorização do dono (critério 4) |
| Baixadores e raspadores de Instagram, TikTok, Facebook, Twitter, Snapchat | violam os termos das plataformas |
| Dark web, IP loggers, varreduras de rede e de vulnerabilidade, exploits | fora do escopo e arriscado sem autorização |

Isso é uma triagem por tipo de bloco, não uma auditoria de cada um dos ~1.100 links: a segunda lista carrega aos poucos e
eu li o que ela entregou. Se um item excluído for essencial para você, diga o caso de uso.

## Limites desta versão

- A verificação testa **se a fonte responde**, não se os **termos** permitem o seu uso. Onde está `(conferir)`, leia os
  termos antes de depender dela.
- As fontes `manual` não têm uso programático: servem de bússola para pesquisa feita à mão.
- Nenhuma fonte do catálogo está ligada à pesquisa por voz ainda. Hoje o harness usa arXiv, YouTube, Bing, Wikimedia e
  Openverse (veja `ferramentas/agentes_pesquisa.py`).
