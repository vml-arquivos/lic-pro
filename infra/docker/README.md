# Imagens Docker

Os Dockerfiles dos serviços usam a raiz do repositório como contexto de build, por exemplo:

```bash
docker build -f services/core-api/Dockerfile .
docker build -f services/ai/Dockerfile .
```

A configuração de desenvolvimento continua em `docker-compose.yml`; o compose da raiz sobe somente PostgreSQL com pgvector, Redis e RabbitMQ para evitar iniciar todos os serviços sem configuração de aplicação.
