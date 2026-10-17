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

## ADR-0006 — Contratos oficiais do Radar

**Status:** aceito. **Contexto:** endpoints públicos de PNCP e Compras.gov.br podem mudar e rotas não documentadas não devem entrar no produto. **Decisão:** os conectores usam somente os OpenAPI/manuais oficiais registrados em `docs/research/fase2-apis-oficiais.md`; a paginação PNCP segue o OpenAPI vigente consultado, mesmo quando manuais antigos registram outro limite. **Consequência:** alterações futuras exigem atualizar a fonte registrada e os fixtures antes de alterar o cliente.

## ADR-0007 — Jornada adaptativa e conteúdo acadêmico em revisão

**Status:** aceito. **Contexto:** iniciantes e profissionais precisam da mesma base com densidade e orientação diferentes, sem criar duas plataformas divergentes. **Decisão:** o perfil de jornada é um atributo persistido (`iniciante`, `mentorado`, `profissional`) que controla modo guiado/profissional, glossário e próximo passo; trilhas, aulas e quizzes entram como conteúdo versionável com status `rascunho_para_revisao`. **Consequência:** nenhum conteúdo acadêmico deve ser tratado como material jurídico definitivo, e quizzes precisam passar por revisão editorial antes de publicação.
