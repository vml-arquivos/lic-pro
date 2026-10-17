# Migrations

As migrations são SQL versionado e são aplicadas em ordem lexicográfica. Em um volume PostgreSQL novo, o `docker-compose.yml` monta este diretório no entrypoint do container.

Para aplicar manualmente:

```bash
for file in db/migrations/*.sql; do
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file "$file"
done
```

O teste de integração `services/core-api/tests/rls.integration.test.ts` é executado quando `TEST_DATABASE_URL` está configurada. Sem essa variável, ele fica explicitamente marcado como skipped, evitando que testes locais dependam de um banco externo.
