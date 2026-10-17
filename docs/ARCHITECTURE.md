# Arquitetura do Licite Comigo

## Visão de blocos

```text
Portais e fontes públicas
        │
        ▼
services/ingest
  conectores, normalização, deduplicação
        │ eventos edital.novo / edital.atualizado
        ▼
RabbitMQ ───────────────► workers e serviços de domínio
        │                         │
        │                         ├── services/ai
        │                         │     Reader, agentes e Ana
        │                         │
        │                         ├── services/core-api
        │                         │     tenants, auth, RBAC, auditoria
        │                         │
        │                         └── services/bid-engine
        │                               decisões e adapters autorizados
        ▼
PostgreSQL 16 + pgvector ◄──── Redis (estado efêmero e locks futuros)
        │
        ├── services/realtime-gw
        │      WebSocket, salas, delay e anonimização futuros
        │
        └── apps/web (Next.js)
               radar, cockpit, academia e Ana

apps/web ── sessão do usuário ──► services/ai/ana
                                      │
                                      ├── ferramentas de leitura
                                      │      core-api / banco, com escopo da sessão
                                      │
                                      └── ações futuras
                                             confirmação explícita na UI
```

## Princípios da fundação

O sistema é um monorepo com fronteiras claras: aplicações web e serviços TypeScript vivem em workspaces pnpm; ingestão e IA usam projetos Python isolados por serviço. O PostgreSQL é a fonte de verdade para dados de negócio e auditoria. Redis fica reservado para estado efêmero, locks e coordenação; RabbitMQ transporta eventos assíncronos.

Toda chamada sensível deve carregar o tenant e o usuário da sessão. Nenhum serviço da fundação usa conexão privilegiada para a Ana. Recursos de lances deverão depender de `PortalAdapter`; a Fase 0 não implementa integração com portais reais.

## Evolução planejada

A Fase 1 adicionará schema, RLS e core-api de negócio. A Fase 2 conectará fontes oficiais após confirmação da documentação e adicionará o Radar. A Fase 3 adicionará RAG, Reader e Ana de leitura. As fases posteriores só começam após a revisão solicitada ao final da Fase 3.
