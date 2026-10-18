# Licite Comigo

O **Licite Comigo** é a base de uma plataforma SaaS de apoio à decisão e formação para licitações públicas brasileiras. O mesmo sistema atende três perfis de jornada: **iniciante**, **mentorado** e **profissional**. Ana é a assistente virtual de IA do produto.

A identidade visual atual é provisória. O wordmark, os tokens, o preset Tailwind e o tema shadcn/ui ficam centralizados em `packages/ui/brand/` para que a futura marca seja aplicada em um único lugar.

## Estado do projeto

Esta entrega cobre as **Fases 0, 1, 2, 2B, 3, 3.1, MVP 1 e Fase 3.3 da especificação v2**. Além da fundação, banco multi-tenant com RLS, conectores oficiais, Academia, Reader/RAG, Ana somente-leitura, roles e deploy, foram entregues autenticação pública controlada, bootstrap administrativo, leads LGPD, site institucional, shell v2 e deploy por recurso Coolify.

Conforme solicitado, as fases posteriores não foram iniciadas. A automação de portais e ações reais de lance não foi implementada.

## Requisitos locais

Use Node.js 22+, pnpm 9+, Python 3.12+ e Docker Compose apenas para desenvolvimento local. Copie `.env.example` para `.env` e substitua os valores locais quando necessário. O `MIGRATION_DATABASE_URL` usa a role de migrations; cada serviço usa sua URL de role de aplicação.

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis rabbitmq
pnpm db:migrate
DEMO_MODE=true pnpm db:seed
pnpm env:check
pnpm build
pnpm lint
pnpm test
pnpm format:check
```

`pnpm db:migrate` executa todas as migrations em ordem com `MIGRATION_DATABASE_URL`, provisiona as senhas das roles de aplicação a partir das variáveis de ambiente e nunca é chamado pelo processo web. `db/seed.sh` recusa execução sem `DEMO_MODE=true` e insere o tenant local e o usuário `admin@local.test`. Depois do seed, abra `/login`; em modo demo a tela pode preencher a credencial local, enquanto o login normal pede apenas e-mail e senha e solicita a organização somente se houver mais de uma. Para produção, rode `pnpm admin:bootstrap` como job one-shot com senha forte e use `db/Dockerfile.migrate` no recurso separado do Coolify.

Para validar os serviços Python:

```bash
for service in services/ingest services/ai; do
  (cd "$service" && pip install -e '.[dev]' && ruff check src tests && mypy src && pytest)
done
```

Para subir a infraestrutura local:

```bash
docker compose up -d postgres redis rabbitmq
docker compose down
```

O app web roda com `pnpm --filter @licitecomigo/web dev`; o site institucional com `pnpm --filter @licitecomigo/site dev`. O core API expõe `/health`, `/ready`, login, signup controlado, recuperação, `/public/leads`, conta, empresas, pipeline e mentor. O web usa proxies same-origin sem expor URL interna do AI. O serviço de IA expõe `/health`, `/ready`, `/reader/ingest`, `/reader/analyze` e `/ana/chat/stream`. O ingest expõe `/health` e `/ready`; worker e scheduler não têm HTTP. Produção usa um recurso Coolify por Dockerfile; `infra/reference/docker-compose.prod.yml` é somente referência.

O smoke test das fontes públicas é opt-in e nunca roda no CI:

```bash
RUN_INGEST_SMOKE=1 pnpm ingest:smoke
```

Ele executa no máximo uma requisição por fonte, compara campos observados com o contrato do normalizador e reporta campos ausentes ou novos. Veja o agendamento proposto e checkpoints em `services/ingest/README.md`.

## Organização

`apps/web` contém o Next.js com App Router, incluindo Radar, onboarding, Academia, análise com evidências e o widget flutuante da Ana. `packages/ui` contém tokens e adaptação de jornada compartilhada. `services/core-api` contém autenticação, RBAC, CRUD, auditoria, busca do Radar e rotas de Academia/histórico da Ana. `services/ingest` contém os clientes oficiais do PNCP e Compras.gov.br, normalizador, upsert e eventos. `services/ai` contém extração estrutural de PDF, embeddings, Reader, provider boundary, Ana e skeletons de agentes futuros. `services/bid-engine` e `services/realtime-gw` continuam como fundações para fases posteriores.

A arquitetura detalhada está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), os riscos e controles em [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md), a especificação da Ana em [`docs/ANA.md`](docs/ANA.md), as fontes da Fase 2 em [`docs/research/fase2-apis-oficiais.md`](docs/research/fase2-apis-oficiais.md), as decisões em [`docs/DECISIONS.md`](docs/DECISIONS.md) e o caminho de deploy em [`infra/coolify/README.md`](infra/coolify/README.md).

## Avisos de segurança

Nunca commite `.env`, chaves, tokens ou dados reais. O produto não promete lucro ou vitória e não presta consultoria jurídica. A fundação não automatiza portais reais de licitação. Os conectores consultam APIs públicas documentadas; Reader e Ana somente organizam evidências e não publicam, alteram, apagam ou enviam lances para portais.
