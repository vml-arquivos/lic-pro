# Licite Comigo

O **Licite Comigo** é a base de uma plataforma SaaS de apoio à decisão e formação para licitações públicas brasileiras. O mesmo sistema atende três perfis de jornada: **iniciante**, **mentorado** e **profissional**. Ana é a assistente virtual de IA do produto.

A identidade visual atual é provisória. O wordmark, os tokens, o preset Tailwind e o tema shadcn/ui ficam centralizados em `packages/ui/brand/` para que a futura marca seja aplicada em um único lugar.

## Estado do projeto

Esta entrega cobre as **Fases 0, 1 e 2**. A fundação, o banco multi-tenant com RLS, o core API, os conectores oficiais do Radar, a normalização, os eventos, a busca e as telas iniciais do Radar estão implementados.

A Fase 3 adicionará Reader/RAG e Ana de leitura. Após a Fase 3, o desenvolvimento deve parar para revisão antes das fases 4 a 6.

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

O app web roda com `pnpm --filter @licitecomigo/web dev`. O core API roda com `pnpm --filter @licitecomigo/core-api dev` e expõe `GET /editais` com filtros de palavra-chave, CATMAT/CATSER, UF, UASG, modalidade e faixa de valor, sempre dentro do tenant da sessão.

## Organização

`apps/web` contém o Next.js com App Router, incluindo `/radar` e o detalhe do edital. `services/core-api` contém autenticação, RBAC, CRUD, auditoria e busca do Radar. `services/ingest` contém os clientes oficiais do PNCP e Compras.gov.br, normalizador, upsert e eventos. `services/bid-engine` e `services/realtime-gw` continuam como fundações para fases posteriores. `services/ai` permanece reservado para a Fase 3.

A arquitetura detalhada está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), os riscos e controles em [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md), a especificação da Ana em [`docs/ANA.md`](docs/ANA.md), as fontes da Fase 2 em [`docs/research/fase2-apis-oficiais.md`](docs/research/fase2-apis-oficiais.md) e as decisões em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Avisos de segurança

Nunca commite `.env`, chaves, tokens ou dados reais. O produto não promete lucro ou vitória e não presta consultoria jurídica. A fundação não automatiza portais reais de licitação. Os conectores da Fase 2 somente consultam APIs públicas documentadas; não publicam nem alteram dados nos portais.
