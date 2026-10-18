# Referência legada de Compose

`docker-compose.prod.yml` é mantido apenas como referência histórica e para ambientes que optem conscientemente por Compose. **Não é usado em produção na Fase 3.3.**

A produção oficial usa um recurso Coolify por serviço, cada um apontando para seu Dockerfile com contexto na raiz do repositório. O recurso `migrate` usa `db/Dockerfile.migrate` e é executado separadamente antes dos serviços HTTP.
