# /// script
# requires-python = ">=3.11"
# ///
"""Banco de Dados Interno do Framework FUI AGENTS // MILITARYCON:
1. Taxonomia Completa ArXiv CoRR (Computing Research Repository - 40 Categorias CS + Quantitative Biology).
2. Matriz Global de Modelos Soberanos & Uncensored (CPU-Friendly / GGUF Q4 / Zero-GPU Local).
3. Doutrinas Estratégicas de IA Militar (Wargaming, Swarm Intelligence, Intelligence Fusion, Human-Machine Teaming, Cyber Defense).
4. Pipeline de Visão Computacional Zero-GPU para Extração e Síntese de Diagramas Científicos (estilo arXiv:2604.08224).
"""
from __future__ import annotations

# ==============================================================================
# 1. BANCO DE DADOS ARXIV CoRR (COMPUTING RESEARCH REPOSITORY)
# ==============================================================================
ARXIV_CORR_CATEGORIAS: dict[str, dict[str, str]] = {
    'cs.AI': {'nome': 'Artificial Intelligence', 'foco': 'Agentes autônomos, raciocínio simbólico/neural, planejamento e sistemas especialistas'},
    'cs.CL': {'nome': 'Computation and Language', 'foco': 'LLMs, engenharia de contexto, tradução tática e processamento de linguagem natural'},
    'cs.CC': {'nome': 'Computational Complexity', 'foco': 'Limites teóricos de computação, classes P/NP e complexidade algorítmica'},
    'cs.CE': {'nome': 'Computational Engineering, Finance, and Science', 'foco': 'Simulação física de larga escala, gêmeos digitais e modelagem balística/estrutural'},
    'cs.CG': {'nome': 'Computational Geometry', 'foco': 'Malhas 3D, triangulação espacial, visibilidade de radar e rotas em terreno'},
    'cs.GT': {'nome': 'Computer Science and Game Theory', 'foco': 'Equilíbrio de Nash, Wargaming estratégico e tomada de decisão multi-adversário'},
    'cs.CV': {'nome': 'Computer Vision and Pattern Recognition', 'foco': 'Extração de diagramas, rastreamento de alvos, reconhecimento óptico/SAR e NUI'},
    'cs.CY': {'nome': 'Computers and Society', 'foco': 'Governança de IA, segurança operacional, ética militar e impacto estratégico'},
    'cs.CR': {'nome': 'Cryptography and Security', 'foco': 'Guerra cibernética, detecção Zero-Day, criptografia pós-quântica e defesa de redes'},
    'cs.DS': {'nome': 'Data Structures and Algorithms', 'foco': 'Grafos de conhecimento em tempo real, indexação espacial e algoritmos sub-lineares'},
    'cs.DB': {'nome': 'Databases', 'foco': 'Bancos vetoriais, fusão de telemetria distribuída e séries temporais de missão crítica'},
    'cs.DL': {'nome': 'Digital Libraries', 'foco': 'Mineração automatizada de repositórios científicos (ArXiv/CoRR) e grafos de citação'},
    'cs.DM': {'nome': 'Discrete Mathematics', 'foco': 'Teoria dos grafos, combinatória e topologias de rede resilientes'},
    'cs.DC': {'nome': 'Distributed, Parallel, and Cluster Computing', 'foco': 'Computação de borda (Edge AI), enxames distribuídos e consenso tolerante a falhas'},
    'cs.ET': {'nome': 'Emerging Technologies', 'foco': 'Computação neuromórfica, fotônica, quântica e interfaces cérebro-computador (BCI)'},
    'cs.FL': {'nome': 'Formal Languages and Automata Theory', 'foco': 'Verificação formal de protocolos críticos e máquinas de estados determinísticas'},
    'cs.GL': {'nome': 'General Literature', 'foco': 'Surveys fundamentais, taxonomias de arquiteturas de agentes (Weights -> Context -> Harness)'},
    'cs.GR': {'nome': 'Graphics', 'foco': 'Shaders GLSL, renderização WebGL2 GPGPU, visualização volumétrica e HUDs holográficos'},
    'cs.AR': {'nome': 'Hardware Architecture', 'foco': 'Aceleradores de inferência leve, quantização Q4/INT4 em CPU e arquiteturas embarcadas'},
    'cs.HC': {'nome': 'Human-Computer Interaction', 'foco': 'Interfaces espaciais (FUI/NUI), controle por mãos/voz/olhar e Human-Machine Teaming'},
    'cs.IR': {'nome': 'Information Retrieval', 'foco': 'RAG multimodal, busca semântica cruzada e calibração probabilística (System-One)'},
    'cs.IT': {'nome': 'Information Theory', 'foco': 'Entropia de sinal, compressão de telemetria e canais de comunicação sob interferência'},
    'cs.LO': {'nome': 'Logic in Computer Science', 'foco': 'Lógica temporal, verificação de segurança e raciocínio neuro-simbólico'},
    'cs.LG': {'nome': 'Machine Learning', 'foco': 'Reinforcement Learning (GRPO/PPO), calibração Bayesiana, adaptação em tempo de teste'},
    'cs.MS': {'nome': 'Mathematical Software', 'foco': 'Solvers simbólicos, álgebra linear rápida e filtros estocásticos (Kalman / 1€)'},
    'cs.MA': {'nome': 'Multiagent Systems', 'foco': 'Enxames de drones (Swarm Intelligence), coordenação descentralizada e protocolo A2A'},
    'cs.MM': {'nome': 'Multimedia', 'foco': 'Fusão de áudio, vídeo em tempo real e síntese audiovisual procedural'},
    'cs.NI': {'nome': 'Networking and Internet Architecture', 'foco': 'Redes táticas ad-hoc (MANET), roteamento resiliente e links de satélite'},
    'cs.NE': {'nome': 'Neural and Evolutionary Computing', 'foco': 'Algoritmos evolutivos, busca de arquitetura neural (NAS) e otimização de enxames'},
    'cs.NA': {'nome': 'Numerical Analysis', 'foco': 'Equações diferenciais parciais, dinâmica de fluidos e órbitas keplerianas'},
    'cs.OS': {'nome': 'Operating Systems', 'foco': 'Kernels de tempo real (RTOS), isolamento de sandbox e escalonamento determinístico'},
    'cs.OH': {'nome': 'Other Computer Science', 'foco': 'Sistemas híbridos interdisciplinares e arquiteturas cognitivas integradas'},
    'cs.PF': {'nome': 'Performance', 'foco': 'Otimização Zero-GC, latência sub-milissegundo e telemetria de throughput'},
    'cs.PL': {'nome': 'Programming Languages', 'foco': 'Compiladores, DSLs para agentes (Harness/Skills) e tipagem estática de contratos'},
    'cs.RO': {'nome': 'Robotics', 'foco': 'Navegação autônoma SLAM, controle cinemático de VANTs/UGVs e percepção multimodal'},
    'cs.SI': {'nome': 'Social and Information Networks', 'foco': 'Dinâmica de conflitos, detecção de desinformação e modelagem comportamental em rede'},
    'cs.SE': {'nome': 'Software Engineering', 'foco': 'Agentes de engenharia de software (SWE-Agent), harnesses de execução e auditoria de código'},
    'cs.SD': {'nome': 'Sound', 'foco': 'Reconhecimento contínuo de voz, síntese acústica tática e análise espectral'},
    'cs.SC': {'nome': 'Symbolic Computation', 'foco': 'Prova automática de teoremas e verificação algébrica de sistemas críticos'},
    'cs.SY': {'nome': 'Systems and Control', 'foco': 'Teoria de controle ótimo, malha fechada C4ISR, estabilidade Lyapunov e fusão de sensores'},
    'q-bio.NC': {'nome': 'Quantitative Biology // Neurons and Cognition', 'foco': 'Inspiração neurobiológica, externalização cognitiva (Thought -> Harness) e memória episódica'},
}


# ==============================================================================
# 2. MATRIZ GLOBAL DE MODELOS SOBERANOS, UNCENSORED E CPU-FRIENDLY (ZERO-GPU OPCIONAL)
# ==============================================================================
CATALOGO_MODELOS_GLOBAIS: list[dict[str, str]] = [
    # 🔓 Uncensored / Abliterated (Ideais para Red-Teaming, Wargaming e Pesquisa Irrestrita em CPU Q4)
    {
        'id': 'josiefied-qwen-7b',
        'nome': 'Josiefied-Qwen 2.5 7B (Abliterated)',
        'origem': '🔓 Uncensored / Abliterated',
        'hardware': 'CPU-Friendly (GGUF Q4_K_M ~4.4GB RAM)',
        'comando_ollama': 'ollama run hf.co/Goekdeniz-Guelmez/Josiefied-Qwen2.5-7B-Instruct-abliterated-GGUF',
        'papel_fui': 'Red-Teaming Estratégico, Simulação de Adversário Sintético (Wargaming) sem bloqueios morais artificiais',
    },
    {
        'id': 'dolphin-mistral-7b',
        'nome': 'Dolphin-Mistral 7B (Eric Hartford)',
        'origem': '🔓 Uncensored / Abliterated',
        'hardware': 'CPU-Friendly (Q4 ~4.1GB RAM)',
        'comando_ollama': 'ollama run dolphin-mistral',
        'papel_fui': 'Análise tática direta, geração de hipóteses de conflito e engenharia reversa de protocolos',
    },
    {
        'id': 'dolphin-3',
        'nome': 'Dolphin 3 (Cognitive Computations)',
        'origem': '🔓 Uncensored / Abliterated',
        'hardware': 'CPU / NPU Leve (Llama 3.1/3.2 Base Q4)',
        'comando_ollama': 'ollama run dolphin3',
        'papel_fui': 'Orquestração de Agentes (Harness), chamada de ferramentas (Tool Calling) e síntese técnica',
    },
    {
        'id': 'llama3.2-abliterated',
        'nome': 'Llama 3.2 Abliterated (huihui_ai · 3B)',
        'origem': '🔓 Uncensored / Abliterated',
        'hardware': 'Ultra-Leve em CPU (~2.0GB RAM)',
        'comando_ollama': 'ollama run huihui_ai/llama3.2-abliterate',
        'papel_fui': 'Inferência instantânea em CPU para classificação de comandos de voz e triagem de PDFs ArXiv',
    },
    # 🇨🇳 China (SOTA Open-Weights em Raciocínio Matemático e Código)
    {
        'id': 'qwen2.5-7b',
        'nome': 'Qwen 2.5 7B (Alibaba Cloud)',
        'origem': '🇨🇳 China',
        'hardware': 'CPU / GPU Leve (Q4)',
        'comando_ollama': 'ollama run qwen2.5:7b',
        'papel_fui': 'Extração estruturada JSON de artigos científicos do ArXiv e síntese multilíngue',
    },
    {
        'id': 'deepseek-r1-7b',
        'nome': 'DeepSeek-R1 7B (Reasoning Distill)',
        'origem': '🇨🇳 China',
        'hardware': 'CPU / GPU Leve (Chain-of-Thought)',
        'comando_ollama': 'ollama run deepseek-r1:7b',
        'papel_fui': 'Raciocínio profundo (System-2), verificação formal de algoritmos e árvore de decisão C4ISR',
    },
    {
        'id': 'yi-6b',
        'nome': 'Yi 6B (01.AI)',
        'origem': '🇨🇳 China',
        'hardware': 'CPU Leve (~3.5GB RAM)',
        'comando_ollama': 'ollama run yi:6b',
        'papel_fui': 'Resumo rápido de inteligência OSINT e correlação de longo contexto',
    },
    {
        'id': 'glm-4-9b',
        'nome': 'GLM-4 9B (Zhipu AI / Tsinghua)',
        'origem': '🇨🇳 China',
        'hardware': 'CPU / GPU Média',
        'comando_ollama': 'ollama run glm4',
        'papel_fui': 'Agente autônomo de navegação web e decomposição de tarefas científicas',
    },
    # 🇦🇪 Emirados Árabes Unidos (Eficiência Extrema em CPU)
    {
        'id': 'falcon3-3b',
        'nome': 'Falcon 3 · 3B (TII Abu Dhabi)',
        'origem': '🇦🇪 Emirados Árabes',
        'hardware': 'Ótimo p/ CPU Pura (~1.8GB RAM)',
        'comando_ollama': 'ollama run falcon3:3b',
        'papel_fui': 'Copiloto tático local de baixíssima latência sem usar GPU dedicada',
    },
    {
        'id': 'jais-6.7b',
        'nome': 'Jais 6.7B (G42 / MBZUAI)',
        'origem': '🇦🇪 Emirados Árabes',
        'hardware': 'HuggingFace (`inceptionai/jais-family-6p7b-chat`)',
        'comando_ollama': 'hf:inceptionai/jais-family-6p7b-chat',
        'papel_fui': 'Inteligência geopolítica Oriente Médio (Árabe-Inglês) e fusão OSINT',
    },
    # 🇮🇱 Israel (Raciocínio Tático e Longo Contexto Híbrido Mamba-Transformer)
    {
        'id': 'dictalm-3.0-thinking',
        'nome': 'DictaLM 3.0 Thinking 24B',
        'origem': '🇮🇱 Israel',
        'hardware': 'Servidor / API (`dicta-il/DictaLM-3.0-24B-Thinking`)',
        'comando_ollama': 'hf:dicta-il/DictaLM-3.0-24B-Thinking',
        'papel_fui': 'Raciocínio analítico profundo, inteligência estratégica Hebraico-Inglês e análise de causa raiz',
    },
    {
        'id': 'ai21-jamba-1.5',
        'nome': 'AI21 Jamba 1.5 (Hybrid SSM-Transformer)',
        'origem': '🇮🇱 Israel',
        'hardware': 'Cloud / API (256K Context Window)',
        'comando_ollama': 'hf:ai21labs/AI21-Jamba-1.5-Large',
        'papel_fui': 'Arquitetura híbrida Mamba + Attention capaz de ingerir dezenas de PDFs do ArXiv simultaneamente',
    },
    # 🇮🇳 Índia (Modelos Compactos Soberanos)
    {
        'id': 'sarvam-1-2b',
        'nome': 'Sarvam-1 · 2B (Sarvam AI)',
        'origem': '🇮🇳 Índia',
        'hardware': 'Ultra-Leve em CPU (~1.3GB RAM)',
        'comando_ollama': 'hf:sarvamai/sarvam-1',
        'papel_fui': 'Micro-agente embarcado para classificação rápida de texto e telemetria',
    },
    # 🏆 Código & Arquitetura de Sistemas
    {
        'id': 'qwen2.5-coder-7b',
        'nome': 'Qwen2.5-Coder 7B',
        'origem': '🏆 Engenharia de Código',
        'hardware': 'CPU / GPU Leve',
        'comando_ollama': 'ollama run qwen2.5-coder:7b',
        'papel_fui': 'Síntese automática de diagramas (Mermaid/SVG/GLSL) e implementação de papers em código vivo',
    },
    {
        'id': 'deepseek-coder-v2',
        'nome': 'DeepSeek-Coder-V2',
        'origem': '🏆 Engenharia de Código',
        'hardware': 'CPU / GPU (MoE)',
        'comando_ollama': 'ollama run deepseek-coder-v2',
        'papel_fui': 'Auditoria cibernética Zero-Day, engenharia de sistemas C4ISR e síntese de shaders WebGL',
    },
]


# ==============================================================================
# 3. AS 5 DOUTRINAS MILITARES E ARQUITETURA "WEIGHTS -> CONTEXT -> HARNESS" (arXiv:2604.08224)
# ==============================================================================
DOUTRINAS_IA_MILITAR: list[dict] = [
    {
        'codigo': 'MIL-01 // WARGAMING',
        'titulo': '1. Wargaming Estratégico e Adversário Sintético',
        'corr': ['cs.GT', 'cs.AI', 'cs.MA', 'cs.SI'],
        'pipeline': ['Cenário Geopolítico', 'Adversário Sintético (RL/GRPO)', 'Árvore de Escalada', 'Auditoria de Fragilidade'],
        'resumo': 'Simulações sociais e táticas onde LLMs abliterated/soberanos atuam como adversários adaptativos para testar fragilidade logística e linhas de ação.',
    },
    {
        'codigo': 'MIL-02 // SWARM-AI',
        'titulo': '2. Enxames de Drones Autônomos (Swarm Intelligence)',
        'corr': ['cs.MA', 'cs.RO', 'cs.SY', 'cs.CV'],
        'pipeline': ['Percepção Óptica Edge', 'Consenso Descentralizado A2A', 'Rastreamento Multi-Alvo', 'Saturação Sincronizada'],
        'resumo': 'Coordenação local sem internet de centenas de VANTs usando modelos ultra-leves (2B-3B Q4) e filtros de Kalman distribuídos.',
    },
    {
        'codigo': 'MIL-03 // C4ISR-FUSION',
        'titulo': '3. Fusão de Dados Multi-Fonte (Intelligence Fusion)',
        'corr': ['cs.IR', 'cs.CV', 'cs.DB', 'cs.SY'],
        'pipeline': ['Ingestão SAR/OSINT/ArXiv', 'Extração de Diagramas CV', 'Calibração Groot-1 (System-One)', 'Grafo Tático C4ISR'],
        'resumo': 'Correlação em tempo real de imagens de satélite, radar, papers científicos (ArXiv CoRR), vídeos e sinais abertos em uma única tela holográfica.',
    },
    {
        'codigo': 'MIL-04 // HUMAN-TEAMING',
        'titulo': '4. Apoio à Decisão e Human-Machine Teaming (Harness)',
        'corr': ['cs.HC', 'cs.AI', 'cs.CL', 'q-bio.NC'],
        'pipeline': ['Weights (Pesos Base)', 'Context (Memória + RAG)', 'Harness (Skills + Protocolos)', 'Supervisão Humana NUI'],
        'resumo': 'Baseado em arXiv:2604.08224: externalização da agência humana e de LLMs através de Memória, Skills e Protocolos sob comando biométrico.',
    },
    {
        'codigo': 'MIL-05 // CYBER-DEFENSE',
        'titulo': '5. Guerra Cibernética, Zero-Day e Defesa contra Data Poisoning',
        'corr': ['cs.CR', 'cs.SE', 'cs.LG', 'cs.NI'],
        'pipeline': ['Monitoramento de Rede Global', 'Detecção de Anomalia Zero-Day', 'Filtro Anti-Poisoning', 'Contra-Medida Autônoma'],
        'resumo': 'Auditoria contínua de vulnerabilidades, proteção contra envenenamento de dados adversariais e resposta cibernética em sub-segundos.',
    },
]


# ==============================================================================
# 4. ECOSSISTEMA DE REPOSITÓRIOS DE ESTUDO & INTEGRAÇÃO ARQUITETURAL (CLONE MATRIX)
# ==============================================================================
REPOSITORIOS_ECOSSISTEMA_FUI: list[dict[str, str]] = [
    {
        'id': 'amilajack/reading',
        'nome': 'Reading // Knowledge Graph Científico',
        'url': 'https://github.com/amilajack/reading',
        'camada': 'TOP STACK // INTELIGÊNCIA & LEITURA',
        'linguagem': 'Markdown / JSON / Curadoria CS',
        'comando_clone': 'git clone --depth 1 https://github.com/amilajack/reading.git',
        'papel_no_sistema': (
            'Estrutura a ingestão de artigos técnicos e papers do ArXiv CoRR em fichas de leitura '
            'indexadas por domínio (AI, Compilers, Distributed Systems, Graphics).'
        ),
        'query_pesquisa': 'arxiv amilajack reading knowledge graph computer science architecture diagram',
    },
    {
        'id': 'openobserve/openobserve',
        'nome': 'OpenObserve // Telemetria & Logs C4ISR (Rust)',
        'url': 'https://github.com/openobserve/openobserve',
        'camada': 'MIDDLE STACK // OBSERVABILIDADE PETABYTE',
        'linguagem': 'Rust / Vue / SQL & PromQL',
        'comando_clone': 'git clone --depth 1 https://github.com/openobserve/openobserve.git',
        'papel_no_sistema': (
            'Motor de observabilidade de alta performance (140x menor custo de storage que Elasticsearch). '
            'Inspira e alimenta nosso barramento de Logs em Tempo Real, Métricas Z/XY e Traces de Agentes.'
        ),
        'query_pesquisa': 'OpenObserve telemetry observability architecture logs metrics traces diagram',
    },
    {
        'id': 'CMU-Perceptual-Computing-Lab/openpose',
        'nome': 'OpenPose (CMU) // 135 Keypoints Corpo + Mãos + Rosto',
        'url': 'https://github.com/CMU-Perceptual-Computing-Lab/openpose',
        'camada': 'NUI STACK // VISÃO COMPUTACIONAL BIOMECÂNICA',
        'linguagem': 'C++ / CUDA / OpenCV (Part Affinity Fields)',
        'comando_clone': 'git clone --depth 1 https://github.com/CMU-Perceptual-Computing-Lab/openpose.git',
        'papel_no_sistema': (
            'Referência pioneira da Carnegie Mellon (Part Affinity Fields - PAFs) para detecção simultânea '
            'de corpo, pés, 2x21 pontos das mãos e 70 pontos faciais em múltiplas pessoas.'
        ),
        'query_pesquisa': 'CMU OpenPose Part Affinity Fields hand body keypoint architecture diagram',
    },
    {
        'id': 'open-mmlab/mmpose',
        'nome': 'MMPose (OpenMMLab) // RTMPose 90+ FPS CPU/ONNX',
        'url': 'https://github.com/open-mmlab/mmpose',
        'camada': 'NUI STACK // RASTREAMENTO ULTRA-RÁPIDO 2D/3D',
        'linguagem': 'Python / PyTorch / ONNX Runtime (RTMPose)',
        'comando_clone': 'git clone --depth 1 https://github.com/open-mmlab/mmpose.git',
        'papel_no_sistema': (
            'Evolução moderna leve (RTMPose / WholeBody) capaz de rodar em CPU/ONNX a 90+ FPS para '
            'rastreamento de mãos, gestos de pinça (👌), passar página no ar e pose 3D sem exigir GPU pesada.'
        ),
        'query_pesquisa': 'OpenMMLab MMPose RTMPose hand pose estimation architecture diagram',
    },
    {
        'id': 'Taskosaur/Taskosaur',
        'nome': 'Taskosaur // Orquestrador Autônomo de Tarefas & Agentes',
        'url': 'https://github.com/Taskosaur/Taskosaur',
        'camada': 'MIDDLE STACK // HARNESS & TASK ORCHESTRATION',
        'linguagem': 'TypeScript / Node / Multi-Agent Queue',
        'comando_clone': 'git clone --depth 1 https://github.com/Taskosaur/Taskosaur.git',
        'papel_no_sistema': (
            'Gerenciamento autônomo de missões, decomposição de tarefas complexas em sub-agentes '
            'e sincronização de fila de trabalho (Harness Layer do modelo arXiv:2604.08224).'
        ),
        'query_pesquisa': 'autonomous task orchestration multi-agent workflow harness architecture diagram',
    },
    {
        'id': 'bilawalsidhu/gods-eye-view',
        'nome': "God's Eye View // Reconstrução Espacial 4D & C4ISR",
        'url': 'https://github.com/bilawalsidhu/gods-eye-view',
        'camada': 'TOP STACK // CONSCIÊNCIA SITUACIONAL 3D/4D',
        'linguagem': 'Python / 3D Gaussian Splatting / Point Clouds / WebGL',
        'comando_clone': 'git clone --depth 1 https://github.com/bilawalsidhu/gods-eye-view.git',
        'papel_no_sistema': (
            'Fusão de vídeo multi-ângulo, mapas topográficos e reconstrução volumétrica 4D em visão '
            'onisciente ("Olho de Deus") para comando e controle espacial C4ISR.'
        ),
        'query_pesquisa': 'Gods Eye View 3D Gaussian Splatting spatial C4ISR point cloud reconstruction',
    },
    {
        'id': 'lyogavin/airllm',
        'nome': 'AirLLM // Inferência Layer-Wise (70B em 4GB / CPU Q4)',
        'url': 'https://github.com/lyogavin/airllm',
        'camada': 'BOTTOM STACK // EXECUÇÃO ZERO-GPU OVERHEAD',
        'linguagem': 'Python / SafeTensors / Layer Sharding',
        'comando_clone': 'git clone --depth 1 https://github.com/lyogavin/airllm.git',
        'papel_no_sistema': (
            'Divide LLMs em camadas individuais no SSD e executa 1 camada por vez na memória, '
            'impedindo que o PC trave por falta de VRAM/RAM.'
        ),
        'query_pesquisa': 'AirLLM layer wise inference memory optimization transformer sharding diagram',
    },
    {
        'id': 'cathrynlavery/diagram-design',
        'nome': 'Diagram Design // Topologia Visual de Sistemas',
        'url': 'https://github.com/cathrynlavery/diagram-design',
        'camada': 'MIDDLE STACK // SÍNTESE DE DIAGRAMAS',
        'linguagem': 'Design System / Vetores / Topologia',
        'comando_clone': 'git clone --depth 1 https://github.com/cathrynlavery/diagram-design.git',
        'papel_no_sistema': (
            'Padrão visual para síntese de diagramas técnicos de alta legibilidade '
            '(Top Stack → Middle Stack → Bottom Stack).'
        ),
        'query_pesquisa': 'system architecture diagram design visual topology dataflow',
    },
    {
        'id': 'pschroen/alien.js',
        'nome': 'Alien.js // Arquitetura Hydra-Like WebGL + Shaders MVC',
        'url': 'https://github.com/pschroen/alien.js',
        'camada': 'HYDRA STACK // ACTIVE THEORY ARCHITECTURE',
        'linguagem': 'JavaScript / GLSL / Zero-GC Render Loop',
        'comando_clone': 'git clone --depth 1 https://github.com/pschroen/alien.js.git',
        'papel_no_sistema': (
            'Framework educacional e de produção criado por Patrick Schroen diretamente inspirado na '
            'engine Hydra da Active Theory: MVC 3D, FBO Ping-Pong Particles, Curl Noise e Uber-Shaders.'
        ),
        'query_pesquisa': 'WebGL GPGPU FBO ping pong particles curl noise shader architecture diagram',
    },
    {
        'id': 'pschroen/space.js',
        'nome': 'Space.js // FUI HUD Espacial + WebAudio + 3D UI',
        'url': 'https://github.com/pschroen/space.js',
        'camada': 'HYDRA STACK // FUI SPATIAL INTERFACE',
        'linguagem': 'JavaScript / WebGL / WebAudio Synth',
        'comando_clone': 'git clone --depth 1 https://github.com/pschroen/space.js.git',
        'papel_no_sistema': (
            'Biblioteca de componentes FUI (Futuristic User Interface), retículas táticas, '
            'telemetria animada e transições 3D fluidas a 60 FPS no estilo atlab.io e upp.cz.'
        ),
        'query_pesquisa': 'Futuristic User Interface FUI WebGL HUD spatial telemetry architecture',
    },
    {
        'id': 'oframe/ogl',
        'nome': 'OGL // Minimal WebGL2 Core (Estilo Hydra Renderer)',
        'url': 'https://github.com/oframe/ogl',
        'camada': 'HYDRA STACK // LOW-LEVEL WEBGL2 ENGINE',
        'linguagem': 'JavaScript / WebGL2 / GPGPU FBO',
        'comando_clone': 'git clone --depth 1 https://github.com/oframe/ogl.git',
        'papel_no_sistema': (
            'Camada WebGL2 ultra-leve e próxima do metal (sem abstrações pesadas), ideal para '
            'aprender e construir sistemas de partículas GPGPU, pós-processamento e Motion Blur.'
        ),
        'query_pesquisa': 'OGL WebGL2 minimal renderer framebuffer postprocessing shader pipeline',
    },
    {
        'id': 'mrdoob/three.js',
        'nome': 'Three.js // WebGPURenderer + TSL (Three.js Shading Language)',
        'url': 'https://github.com/mrdoob/three.js',
        'camada': 'HYDRA STACK // WEBGPU COMPUTE & TSL',
        'linguagem': 'JavaScript / WGSL / GLSL / TSL',
        'comando_clone': 'git clone --depth 1 https://github.com/mrdoob/three.js.git',
        'papel_no_sistema': (
            'Motor padrão da indústria com GPUComputationRenderer (FBO) e o novo TSL para '
            'escrever Compute Shaders em WebGPU capazes de animar 1 milhão de partículas no browser.'
        ),
        'query_pesquisa': 'Three.js WebGPU compute shader TSL GPUComputationRenderer particle system',
    },
]

