# Licite Comigo

O **Licite Comigo** é a base de uma plataforma SaaS de apoio à decisão e formação para licitações públicas brasileiras. O mesmo sistema atende três perfis de jornada: **iniciante**, **mentorado** e **profissional**. Ana é a assistente virtual de IA do produto.

A identidade visual atual é provisória. O wordmark, os tokens, o preset Tailwind e o tema shadcn/ui ficam centralizados em `packages/ui/brand/` para que a futura marca seja aplicada em um único lugar.

## Estado do projeto

Esta entrega cobre as **Fases 0, 1, 2, 2B e 3**. A fundação, o banco multi-tenant com RLS, o core API, os conectores oficiais do Radar, a normalização, os eventos, a busca, o onboarding, a adaptação guiada/profissional, a Academia, o Reader/RAG e a Ana com ferramentas somente leitura estão implementados.

Conforme solicitado, o desenvolvimento para aqui para revisão antes das fases 4 a 6. Hunter, Pricer e Writer ficam apenas como interfaces/skeletons nesta parada; a automação de portais e ações reais não foi implementada.

## Requisitos locais

Use Node.js 22+, pnpm 9+ e Python 3.12+. Docker com Docker Compose é necessário para subir PostgreSQL com pgvector, Redis e RabbitMQ. O arquivo `.env.example` lista as configurações sem segredos; copie-o para `.env` e altere as credenciais locais.

```bash
cp .env.example .env
pnpm install
pnpm build
pnpm lint
pnpm test
pnpm format:check
```

Para validar os serviços Python:

```bash
for service in services/ingest services/ai; do
  (cd "$service" && pip install -e '.[dev]' && ruff check src tests && mypy src && pytest)
done
```

Para subir a infraestrutura:

```bash
docker compose up -d postgres redis rabbitmq
docker compose ps
```

Para desligar os containers:

```bash
docker compose down
```

O app web roda com `pnpm --filter @licitecomigo/web dev`. O core API roda com `pnpm --filter @licitecomigo/core-api dev` e expõe `GET /editais` com filtros de palavra-chave, CATMAT/CATSER, UF, UASG, modalidade e faixa de valor, sempre dentro do tenant da sessão. A Academia usa `/onboarding`, `/academia`, `/academia/trilhas/:slug` e `/academia/mentor`; as rotas equivalentes do backend ficam sob `/academy`. O serviço de IA expõe `/reader/ingest`, `/reader/analyze` e `/ana/chat/stream`.

## Organização

`apps/web` contém o Next.js com App Router, incluindo Radar, onboarding, Academia, análise com evidências e o widget flutuante da Ana. `packages/ui` contém tokens e adaptação de jornada compartilhada. `services/core-api` contém autenticação, RBAC, CRUD, auditoria, busca do Radar e rotas de Academia. `services/ingest` contém os clientes oficiais do PNCP e Compras.gov.br, normalizador, upsert e eventos. `services/ai` contém extração estrutural de PDF, embeddings, Reader, provider boundary, Ana e skeletons de agentes futuros. `services/bid-engine` e `services/realtime-gw` continuam como fundações para fases posteriores.

A arquitetura detalhada está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), os riscos e controles em [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md), a especificação da Ana em [`docs/ANA.md`](docs/ANA.md), as fontes da Fase 2 em [`docs/research/fase2-apis-oficiais.md`](docs/research/fase2-apis-oficiais.md) e as decisões em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Avisos de segurança

Nunca commite `.env`, chaves, tokens ou dados reais. O produto não promete lucro ou vitória e não presta consultoria jurídica. A fundação não automatiza portais reais de licitação. Os conectores consultam APIs públicas documentadas; Reader e Ana somente organizam evidências e não publicam, alteram, apagam ou enviam lances para portais.
