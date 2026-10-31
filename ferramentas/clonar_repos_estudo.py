"""Gerenciador de clonagem e sincronização dos repositórios de estudo do Ecossistema FUI Agents C4ISR.

Clona (shallow --depth 1) ou verifica na pasta `repos_estudo/`:
1. https://github.com/amilajack/reading              (ArXiv CoRR & CS Taxonomy)
2. https://github.com/openobserve/openobserve        (Observabilidade & Logs C4ISR)
3. https://github.com/CMU-Perceptual-Computing-Lab/openpose (Esqueleto Biométrico Multi-Pessoa)
4. https://github.com/open-mmlab/mmpose              (RTMPose 2D/3D Hand & WholeBody)
5. https://github.com/Taskosaur/Taskosaur            (Orquestração de Missões e Tasks IA)
6. https://github.com/bilawalsidhu/gods-eye-view     (Reconstrução 3D Espacial / Gaussian Splatting)
7. https://github.com/lyogavin/airllm                (Inferência LLM Layer-Wise 4GB VRAM)
8. https://github.com/cathrynlavery/diagram-design   (Arquitetura de Diagramas de IA)
"""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalogo_corr_militar import REPOSITORIOS_ECOSSISTEMA_FUI  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PASTA_REPOS = RAIZ / "repos_estudo"


def sincronizar_repositorios(apenas_listar: bool = False, filtro: str = "") -> list[dict]:
    if not apenas_listar:
        PASTA_REPOS.mkdir(parents=True, exist_ok=True)
    relatorio = []

    print("=" * 82)
    print("FUI AGENTS // ECOSSISTEMA GITHUB C4ISR — SINCRONIZADOR DE REPOSITÓRIOS")
    print("=" * 82)

    for item in REPOSITORIOS_ECOSSISTEMA_FUI:
        repo = item.get("nome") or item["id"]
        url = item["url"]
        if filtro and filtro.lower() not in repo.lower() and filtro.lower() not in item["id"].lower():
            continue

        pasta_nome = item["id"].replace("/", "__")
        destino = PASTA_REPOS / pasta_nome
        ja_existe = (destino / ".git").exists()

        print(f"\n[*] [{item.get('camada', '')}] {item['id']} — {repo}")
        print(f"   URL:   {url}")
        print(f"   Papel: {item['papel_no_sistema']}")
        print(f"   Clone: {item.get('comando_clone', '')}")
        print(f"   Local: {destino}")

        if apenas_listar:
            status = "CLONADO" if ja_existe else "PRONTO PARA CLONAR"
            print(f"   Status: {status}")
            relatorio.append({**item, "local": str(destino), "clonado": ja_existe})
            continue

        if ja_existe:
            print("   ✓ Já clonado localmente em repos_estudo/.")
            relatorio.append({**item, "local": str(destino), "clonado": True})
            continue

        print(f"   ⏳ Clonando shallow (--depth 1) {url}.git ...")
        cmd = ["git", "clone", "--depth", "1", f"{url}.git", str(destino)]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            ok = res.returncode == 0
            if ok:
                print(f"   ✅ Clonado com sucesso em {destino}")
            else:
                print(f"   ⚠️ Aviso ao clonar {repo}: {res.stderr.strip()[:200]}")
            relatorio.append({**item, "local": str(destino), "clonado": ok})
        except Exception as exc:
            print(f"   ⚠️ Falha de rede/tempo ao clonar {repo}: {exc}")
            relatorio.append({**item, "local": str(destino), "clonado": False})

    print("\n" + "=" * 82)
    clonados = sum(1 for r in relatorio if r["clonado"])
    print(f"Resumo: {clonados}/{len(relatorio)} repositórios prontos em {PASTA_REPOS}")
    print("=" * 82)
    return relatorio


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Clona ou lista os repositórios de estudo do FUI Agents.")
    ap.add_argument("--listar", action="store_true", help="Apenas exibe o catálogo e status local")
    ap.add_argument("--filtro", default="", help="Filtra por nome de repositório")
    args = ap.parse_args()
    sincronizar_repositorios(apenas_listar=args.listar, filtro=args.filtro)
