# Deploy no Coolify

A configuração desta fase prepara o projeto para deploy em VPS própria, sem Kubernetes. No Coolify, crie os serviços a partir dos Dockerfiles por serviço quando cada aplicação estiver implementada, configure as variáveis do `.env.example` no painel de secrets e mantenha PostgreSQL, Redis e RabbitMQ em recursos persistentes.

A ordem recomendada é banco, Redis, RabbitMQ, core-api, ai, ingest, bid-engine, realtime-gw e web. Cada serviço deve usar healthcheck e rede privada. Não publique portas internas sem necessidade; exponha apenas a aplicação web e os endpoints protegidos pelo gateway.

Antes de qualquer ambiente de produção, revise RLS, backups, retenção de auditoria, rotação de segredos, TLS, limites de fila, logs e os textos legais com profissional habilitado. A operação de portais reais continua fora do escopo da fundação.
