# Arquitetura do Licite Comigo

## Visão de blocos

```text
Fontes públicas documentadas
  ├── PNCP Consulta API
  └── Compras.gov.br Dados Abertos
        │ GET somente, retry, backoff e rate limit
        ▼
services/ingest
  conectores, fixtures, normalização, deduplicação, upsert
        │ eventos edital.novo / edital.atualizado
        ▼
RabbitMQ ───────────────► workers e serviços de domínio
        │                         │
        │                         ├── services/ai
        │                         │     Reader/RAG, embeddings, Ana
        │                         │
        │                         ├── services/core-api
        │                         │     tenants, auth, RBAC, auditoria, Radar
        │                         │
        │                         └── services/bid-engine
        │                               decisões e adapters autorizados
        ▼
PostgreSQL 16 + pgvector ◄──── Redis (estado efêmero e locks futuros)
        │
        ├── edital_chunks / analises_ia / ana_*
        ├── services/realtime-gw
        │      WebSocket, salas, delay e anonimização futuros
        │
        └── apps/web (Next.js)
               Radar, Academia e Ana

apps/web ── sessão do usuário ──► services/core-api
                                      │
                                      └── PostgreSQL com RLS por tenant

apps/web ── sessão do usuário ──► services/ai
                                      │
                                      ├── Reader: PDF → páginas → chunks estruturais
                                      │              → embeddings → evidências
                                      │
                                      ├── Ana: SSE + histórico + 3 ferramentas de leitura
                                      │
                                      └── ações futuras
                                             confirmação explícita na UI
```

## Princípios da fundação

O sistema é um monorepo com fronteiras claras: aplicações web e serviços TypeScript vivem em workspaces pnpm; ingestão e IA usam projetos Python isolados por serviço. O PostgreSQL é a fonte de verdade para dados de negócio e auditoria. Redis fica reservado para estado efêmero, locks e coordenação; RabbitMQ transporta eventos assíncronos.

Toda chamada sensível deve carregar o tenant e o usuário da sessão. Migrations usam `licite_owner`; runtime usa roles próprias `NOSUPERUSER`/`NOBYPASSRLS`, com grants mínimos e `FORCE ROW LEVEL SECURITY`. Nenhum serviço da fundação usa conexão privilegiada para a Ana. Recursos de lances deverão depender de `PortalAdapter`; as Fases 2, 3 e 3.1 apenas consultam fontes públicas e leem documentos, sem operar portais reais.

## Reader/RAG

O Reader preserva página, seção e cláusula durante a extração. O chunking divide por headings e parágrafos, não por janelas cegas; o embedding é um provider configurável e o adapter SQL grava em `edital_chunks`. A saída estruturada guarda `modelo`, `prompt_version`, resumo, riscos, checklist, perguntas e evidências em `analises_ia`. Ausência de evidência vira pergunta ou campo vazio; nunca é preenchida como fato.

## Ana

Ana é read-only nesta fase. As ferramentas permitidas são `buscar_editais`, `ler_analise_edital` e `explicar_conceito`. A mensagem do usuário, o PDF e o conteúdo recuperado são dados não confiáveis; não alteram as regras do sistema. O histórico fica separado por tenant/usuário, e cada tool call é auditável. Conclusão jurídica, promessa de vitória e ações de portal estão fora do escopo. Rate limits por usuário/tenant e `uso_ia` protegem custo e abuso.

## Deploy e readiness

Na Fase 3.3, produção usa um recurso Coolify por serviço, com contexto na raiz e Dockerfile multi-stage não-root. PostgreSQL usa `pgvector/pgvector:pg16`; `db/Dockerfile.migrate` aplica migrations com advisory lock e fica separado dos processos HTTP. Site e web expõem `/health` e `/ready`; core/AI/ingest também verificam dependências; worker e scheduler Celery não têm HTTP e são observados por logs/processo. O Compose produtivo foi movido para `infra/reference/` apenas como referência.

Contas públicas usam `auth_credentials`, tokens temporários com hash, consentimento versionado, rate limit e SMTP configurável. Leads entram por endpoint público sem leitura pública e aparecem apenas no painel admin autenticado. `editais` permanece tenant-scoped nesta parada, conforme ADR-0013; a ingestão não cria catálogo global nem compartilha dados entre tenants.

## Evolução planejada

A Fase 3.3 está concluída nesta parada para revisão. O MVP 2 não foi iniciado; Hunter, Pricer e Writer continuam como skeletons e automações/aprovações continuam marcadas como “Em breve” no shell.
