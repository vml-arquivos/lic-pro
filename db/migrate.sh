#!/bin/sh
set -eu

: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL é obrigatório}"
: "${CORE_DB_PASSWORD:?CORE_DB_PASSWORD é obrigatório}"
: "${INGEST_DB_PASSWORD:?INGEST_DB_PASSWORD é obrigatório}"
: "${AI_DB_PASSWORD:?AI_DB_PASSWORD é obrigatório}"
: "${BID_DB_PASSWORD:?BID_DB_PASSWORD é obrigatório}"
: "${REALTIME_DB_PASSWORD:?REALTIME_DB_PASSWORD é obrigatório}"

until pg_isready --dbname "$MIGRATION_DATABASE_URL" >/dev/null 2>&1; do
  sleep 2
done

psql "$MIGRATION_DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

for file in /migrations/*.sql; do
  filename="$(basename "$file")"
  applied="$(psql "$MIGRATION_DATABASE_URL" --tuples-only --no-align \
    --command "SELECT 1 FROM schema_migrations WHERE filename = '$filename'")"
  if [ "$applied" = '1' ]; then
    echo "migration já aplicada: $filename"
    continue
  fi
  echo "aplicando migration: $filename"
  psql "$MIGRATION_DATABASE_URL" --set ON_ERROR_STOP=1 --file "$file"
  psql "$MIGRATION_DATABASE_URL" --set ON_ERROR_STOP=1 \
    --set filename="$filename" \
    --command "INSERT INTO schema_migrations (filename) VALUES (:'filename')"
done

for role_and_password in \
  "licite_core:$CORE_DB_PASSWORD" \
  "licite_ingest:$INGEST_DB_PASSWORD" \
  "licite_ai:$AI_DB_PASSWORD" \
  "licite_bid:$BID_DB_PASSWORD" \
  "licite_realtime:$REALTIME_DB_PASSWORD"; do
  role="${role_and_password%%:*}"
  password="${role_and_password#*:}"
  psql "$MIGRATION_DATABASE_URL" --set ON_ERROR_STOP=1 \
    --set role_name="$role" --set role_password="$password" \
    --command "ALTER ROLE :role_name LOGIN PASSWORD :'role_password'"
done
