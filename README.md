# Licite Comigo

O **Licite Comigo** é a base de uma plataforma SaaS de apoio à decisão e formação para licitações públicas brasileiras. O mesmo sistema atende três perfis de jornada: **iniciante**, **mentorado** e **profissional**. Ana é a assistente virtual de IA do produto.

A identidade visual atual é provisória. O wordmark, os tokens, o preset Tailwind e o tema shadcn/ui ficam centralizados em `packages/ui/brand/` para que a futura marca seja aplicada em um único lugar.

## Estado do projeto

Esta entrega corresponde à **Fase 0 — Fundação**. Ela cria o monorepo, a infraestrutura local, o app web mínimo, os esqueletos de serviços, o CI e a documentação de arquitetura/compliance. Banco de negócio, ingestão real, RAG, lances e integrações de portal entram somente nas fases descritas no requisito original.

Após a Fase 3, o desenvolvimento deve parar para revisão antes das fases 4 a 6.

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

Para subir a infraestrutura:

```bash
docker compose up -d postgres redis rabbitmq
docker compose ps
```

Para desligar os containers:

```bash
docker compose down
```

O app web mínimo roda com `pnpm --filter @licitecomigo/web dev` e o endpoint local do core API com `pnpm --filter @licitecomigo/core-api dev`. Os serviços Python têm instruções próprias em seus READMEs.

## Organização

`apps/web` contém o Next.js com App Router. `services/core-api`, `services/bid-engine` e `services/realtime-gw` são serviços TypeScript. `services/ingest` e `services/ai` são projetos Python. `packages/shared` concentra contratos compartilhados e `packages/ui` concentra a fundação visual. `db/migrations` e `db/seeds` ficam reservados ao banco versionado.

A arquitetura detalhada está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), os riscos e controles em [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md), a especificação da Ana em [`docs/ANA.md`](docs/ANA.md) e as decisões em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Avisos de segurança

Nunca commite `.env`, chaves, tokens ou dados reais. O produto não promete lucro ou vitória e não presta consultoria jurídica. A fundação não automatiza portais reais de licitação.
