# Deploy no Coolify — Fase 3.3 por recurso

A produção oficial do Licite Comigo usa **um recurso por serviço no Coolify**, com build a partir de um Dockerfile e contexto na raiz do repositório. O arquivo `infra/reference/docker-compose.prod.yml` é apenas referência histórica e **não é usado em produção**.

Não há acesso ao Coolify ou ao servidor nesta tarefa. Os comandos abaixo são um checklist para executar no terminal do recurso depois da configuração.

## Recursos e caminhos

Todos os recursos de aplicação usam **Base Directory `/`** e o repositório como contexto de build.

| Recurso          | Dockerfile / imagem                    | Base Directory |        Porta | Domínio              | Health                                       | Variáveis principais                                                      |
| ---------------- | -------------------------------------- | -------------: | -----------: | -------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL       | `pgvector/pgvector:pg16`               |              — | 5432 privado | —                    | `pg_isready`                                 | `POSTGRES_DB`, `POSTGRES_OWNER_USER`, `POSTGRES_OWNER_PASSWORD`           |
| Redis            | `redis:7.4-alpine` com AOF             |              — | 6379 privado | —                    | `redis-cli ping`                             | `REDIS_PASSWORD`                                                          |
| RabbitMQ         | `rabbitmq:3.13-management-alpine`      |              — | 5672 privado | —                    | `rabbitmq-diagnostics -q ping`               | `RABBITMQ_USER`, `RABBITMQ_PASSWORD`                                      |
| migrate          | `db/Dockerfile.migrate`                |            `/` |            — | —                    | one-shot, sem HTTP                           | `MIGRATION_DATABASE_URL`, cinco `*_DB_PASSWORD`, `MIGRATE_IDLE_AFTER`     |
| core-api         | `services/core-api/Dockerfile`         |            `/` |         3001 | opcional `API_URL`   | `/health`, `/ready`                          | JWT, `DATABASE_URL`, Redis, signup e SMTP                                 |
| ai               | `services/ai/Dockerfile`               |            `/` |         8000 | somente rede privada | `/health`, `/ready`                          | JWT AI, providers, limites, `AI_DATABASE_URL` mapeada para `DATABASE_URL` |
| ingest HTTP      | `services/ingest/Dockerfile`           |            `/` |         8100 | somente rede privada | `/health`, `/ready`                          | banco, Redis, RabbitMQ e fontes oficiais                                  |
| ingest worker    | `services/ingest/Dockerfile.worker`    |            `/` |            — | —                    | sem HTTP; observar logs/processo Celery      | banco, Redis, RabbitMQ, retry                                             |
| ingest scheduler | `services/ingest/Dockerfile.scheduler` |            `/` |            — | —                    | sem HTTP; observar logs/processo Celery Beat | banco, Redis, RabbitMQ, janela                                            |
| site             | `apps/site/Dockerfile`                 |            `/` |         3100 | `SITE_URL`           | `/health`, `/ready`                          | `SITE_URL`, `APP_URL`, `CORE_API_INTERNAL_URL`, branding                  |
| web/app          | `apps/web/Dockerfile`                  |            `/` |         3000 | `APP_URL`            | `/health`, `/ready`                          | `APP_URL`, core/AI internos, sessão                                       |

`bid-engine` e `realtime-gw` continuam recursos futuros e não fazem parte do deploy ativo do MVP 1. Seus Dockerfiles permanecem disponíveis para uma parada posterior.

## Ordem de criação

1. Crie PostgreSQL usando `pgvector/pgvector:pg16`, Redis com AOF e RabbitMQ em rede privada.
2. Configure DNS para `SITE_URL` e `APP_URL`. Publique somente site e web; core, AI e ingest permanecem privados, salvo decisão de expor `API_URL`.
3. Crie o recurso one-shot `migrate` com `db/Dockerfile.migrate`. Configure `MIGRATION_DATABASE_URL` apontando para o hostname interno do PostgreSQL e `MIGRATE_IDLE_AFTER=true` quando o Coolify precisar manter o recurso saudável após o sucesso.
4. Execute o migrate e confirme o código 0. Ele usa lock advisory, tabela `schema_migrations`, aplica arquivos em ordem, provisiona `licite_core`, `licite_ingest`, `licite_ai`, `licite_bid` e `licite_realtime` e termina; nunca é executado dentro de outro serviço.
5. Crie core-api, AI, ingest HTTP, worker, scheduler, site e web apontando para seus Dockerfiles. Aguarde `/ready` dos serviços HTTP antes de publicar links no app.
6. Execute `pnpm admin:bootstrap` como job one-shot com `MIGRATION_DATABASE_URL`, `BOOTSTRAP_TENANT_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD`. O comando exige senha forte, é idempotente e não é o seed demo.

Hostnames esperados na rede interna são os nomes dos recursos, por exemplo `postgres:5432`, `redis:6379`, `rabbitmq:5672`, `http://core-api:3001`, `http://ai:8000` e `http://ingest:8100`. Não coloque esses valores no código; configure-os no recurso.

## Backup e operação

Use backup PostgreSQL cifrado fora do host, retenção definida no provedor e teste periódico de restauração em ambiente isolado. O volume de PostgreSQL não substitui backup. Redis e RabbitMQ são infraestrutura de fila/cache, não a fonte de verdade dos dados de negócio.

O Coolify deve monitorar somente o caminho do serviço alterado: `apps/site/**` para site, `apps/web/**` e `packages/ui/**` para web, `services/core-api/**` e migrations quando aplicável para core, `services/ai/**` para AI, `services/ingest/**` para ingest/worker/scheduler e `db/**` para migrate. Isso evita rebuild de tudo em cada alteração.

## Comandos de verificação no terminal do Coolify

```sh
curl -fsS "$SITE_URL/health"
curl -fsS "$APP_URL/health"
curl -fsS "http://core-api:3001/health"
curl -fsS "http://core-api:3001/ready"
curl -fsS "http://ai:8000/health"
curl -fsS "http://ai:8000/ready"
curl -fsS "http://ingest:8100/health"
curl -fsS "http://ingest:8100/ready"
psql "$MIGRATION_DATABASE_URL" -c "select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname like 'licite_%' order by rolname;"
psql "$MIGRATION_DATABASE_URL" -c "select filename, applied_at from schema_migrations order by filename;"
```

O resultado esperado para roles de aplicação é `rolsuper = false`, `rolbypassrls = false` e `rolcanlogin = true` apenas nos serviços que efetivamente conectam ao banco. Worker e scheduler não têm endpoint HTTP por desenho; verifique seus logs e o estado do processo Celery.

## Checklist pós-deploy

- [ ] `SITE_URL/health`, `APP_URL/health` e todos os `/ready` HTTP respondem conforme dependências.
- [ ] Migrate terminou com código 0, advisory lock foi liberado e migrations aparecem em `schema_migrations`.
- [ ] `pg_roles` confirma ausência de superusuário e de `BYPASSRLS` nas roles de aplicação.
- [ ] `APP_URL` e `SITE_URL` usam HTTPS e não há segredo em imagem, log ou repositório.
- [ ] `EMAIL_PROVIDER=smtp` e credenciais SMTP estão configurados quando signup estiver ativo; `fake` não é permitido em produção.
- [ ] Backup PostgreSQL cifrado foi configurado e uma restauração foi testada.
- [ ] Worker e scheduler aparecem saudáveis por logs, não por HTTP.
- [ ] Lead público aceita apenas consentimento, tem honeypot e não possui leitura pública.
- [ ] CORS, cookies, rate limit, RLS e trilha de auditoria foram verificados.
- [ ] Lighthouse mobile foi medido no domínio real antes de declarar qualquer resultado.
