# Deploy no Coolify — esqueleto de produção

Esta pasta documenta o caminho para subir o esqueleto do Licite Comigo em uma VPS própria usando Coolify. O domínio temporário pode ser `licitecomigo.buscarr.com.br`, mas ele **não é hardcoded**: configure `APP_URL`, `API_URL`, `WS_URL` e `ALLOWED_ORIGINS` no ambiente do Coolify. O AI é acessado somente pelo proxy same-origin do web via `AI_INTERNAL_URL`.

Não há deploy automatizado nesta fase, não há credenciais de infraestrutura no repositório e não há acesso ao servidor. O resultado é código pronto para configurar.

## Opção recomendada: compose de produção

1. Crie um recurso **Docker Compose** apontando para `docker-compose.prod.yml` e para a raiz do repositório.
2. Configure uma rede privada do projeto e mantenha apenas o serviço `web` associado ao domínio público. Os demais serviços usam `expose` e não publicam portas no host.
3. Preencha no painel de variáveis todos os valores de `.env.example`, substituindo todos os `change-me-*` por segredos fortes. Use `MIGRATION_DATABASE_URL` com a role `licite_owner` somente para o serviço `migrate`.
4. Configure o domínio do recurso web com o valor de `APP_URL`. Se API e WebSocket tiverem domínios próprios, informe-os em `API_URL` e `WS_URL`; o AI permanece em rede privada e recebe `AI_INTERNAL_URL=http://ai:8000`.
5. Configure `ALLOWED_ORIGINS` com as origens exatas do browser. O core-api habilita CORS com credenciais somente para essa lista.
6. Faça o primeiro start. A ordem é: PostgreSQL saudável, Redis/RabbitMQ saudáveis, `migrate` concluído, serviços internos e, por último, web.
7. Em cada deploy, verifique os logs do serviço `migrate`. Migrations são one-shot e não são executadas dentro do processo web.

### Recursos a criar

- PostgreSQL com `pgvector/pgvector:pg16` e volume persistente `postgres_prod_data`.
- Redis 7 com AOF e volume persistente `redis_prod_data`.
- RabbitMQ 3 com volume persistente `rabbitmq_prod_data`.
- Serviço one-shot `migrate`.
- `core-api`, `ai`, `ingest`, `ingest-worker`, `ingest-scheduler` e `web` construídos pelos Dockerfiles da raiz.
- `bid-engine` e `realtime-gw` ficam no profile `future` e não sobem por padrão no MVP 1.

Configure o backup do PostgreSQL no recurso de volume persistente ou em uma rotina externa da VPS, com cópia cifrada fora do host e teste periódico de restauração. Redis e RabbitMQ não substituem o backup do PostgreSQL.

## Opção alternativa: um recurso por serviço

Em vez do compose, crie um recurso Coolify por serviço e use o Dockerfile indicado:

| Recurso     | Dockerfile                        | Porta interna | Health              |
| ----------- | --------------------------------- | ------------: | ------------------- |
| web         | `apps/web/Dockerfile`             |          3000 | `/health`           |
| core-api    | `services/core-api/Dockerfile`    |          3001 | `/health`, `/ready` |
| ai          | `services/ai/Dockerfile`          |          8000 | `/health`, `/ready` |
| ingest      | `services/ingest/Dockerfile`      |          8100 | `/health`, `/ready` |
| bid-engine  | `services/bid-engine/Dockerfile`  |          3002 | `/health`, `/ready` |
| realtime-gw | `services/realtime-gw/Dockerfile` |          3003 | `/health`, `/ready` |

Nesse caminho, conecte os serviços à mesma rede privada, crie o PostgreSQL/Redis/RabbitMQ como recursos persistentes e execute `db/migrate.sh` uma vez como job/recurso one-shot antes de iniciar aplicações. Não coloque `MIGRATION_DATABASE_URL` nos serviços de runtime.

## Variáveis por serviço

- **web:** `APP_URL`, `API_URL`, `WS_URL`, `AI_INTERNAL_URL`, `ALLOWED_ORIGINS`.
- **core-api:** `JWT_SECRET`, `CORE_DATABASE_URL`, `REDIS_URL`, `APP_URL`, `API_URL`, `WS_URL`, `ALLOWED_ORIGINS`.
- **ai:** `AI_DATABASE_URL`, `REDIS_URL`, limites `AI_*`, `ANA_HISTORY_RETENTION_DAYS` e provider configurável.
- **ingest:** `INGEST_DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `PNCP_BASE_URL`, `COMPRAS_GOV_BASE_URL`.
- **bid-engine/realtime-gw:** suas URLs de banco/Redis e `WS_URL`/`ALLOWED_ORIGINS` quando aplicável.
- **migrate:** `MIGRATION_DATABASE_URL` e as cinco senhas das roles de aplicação para provisionamento de login.

Nunca coloque API keys, senhas ou tokens em `Dockerfile`, migrations, commits ou logs.

## Checklist pós-deploy

- [ ] `web/health` responde 200.
- [ ] `core-api/health` responde 200 e `core-api/ready` confirma banco e Redis.
- [ ] `ai/health`, `ai/ready`, `ingest/health` e `ingest/ready` respondem conforme dependências.
- [ ] `bid-engine/health`, `realtime-gw/health` e seus `/ready` estão acessíveis apenas na rede privada.
- [ ] O widget da Ana alcança a URL configurada de AI, sem expor credenciais no browser.
- [ ] As migrations foram aplicadas pelo serviço `migrate` e o usuário de aplicação não é superusuário nem `BYPASSRLS`.
- [ ] Um smoke test autenticado confirma que o Radar não cruza tenants.
- [ ] CORS aceita somente origens esperadas e cookies usam o domínio configurado.
- [ ] Backup do PostgreSQL foi configurado e uma restauração de teste foi registrada.
- [ ] Logs mascaram CPF/e-mail e a retenção do histórico está configurada.
