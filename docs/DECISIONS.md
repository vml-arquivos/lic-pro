# Decisões técnicas

## ADR-0001 — Monorepo com pnpm

**Status:** aceito. **Contexto:** a plataforma terá aplicações web, serviços TypeScript e serviços Python que precisam evoluir de forma coordenada. **Decisão:** usar pnpm workspaces para os pacotes JavaScript/TypeScript e `pyproject.toml` independente nos serviços Python. **Consequência:** os serviços permanecem implantáveis separadamente e o CI consegue validar cada família de código.

## ADR-0002 — PostgreSQL com pgvector

**Status:** aceito. **Contexto:** o produto precisa de dados transacionais e busca vetorial, mas a primeira versão deve reduzir a quantidade de infraestrutura. **Decisão:** usar PostgreSQL 16 com pgvector como banco principal. **Consequência:** embeddings e dados relacionais compartilham governança e backup; uma migração futura para outro mecanismo exigirá uma decisão explícita.

## ADR-0003 — RabbitMQ para eventos

**Status:** aceito. **Contexto:** a primeira etapa precisa de filas e eventos entre ingestão e serviços sem a complexidade operacional de Kafka. **Decisão:** usar RabbitMQ no desenvolvimento e no primeiro deploy. **Consequência:** contratos de eventos devem ser versionados antes de integrações externas.

## ADR-0004 — Identidade visual em um único ponto

**Status:** aceito. **Contexto:** a marca oficial será entregue posteriormente. **Decisão:** tokens provisórios, preset Tailwind, tema shadcn/ui e `Logo` vivem em `packages/ui/brand/` e não há cores definitivas espalhadas pelos componentes. **Consequência:** a troca futura da marca deve ficar concentrada nesse diretório.

## ADR-0005 — Sem automação de portais na fundação

**Status:** aceito. **Contexto:** automação em portais reais exige validação jurídica e operacional específica. **Decisão:** nesta etapa não existe adapter de portal real; a futura camada de lances deverá depender de uma interface e usar apenas Mock/Simulador. **Consequência:** nenhum serviço da Fase 0 faz autenticação, scraping ou envio de lances para portais reais.
