#!/bin/sh
set -eu
: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL é obrigatório}"
: "${DEMO_MODE:?DEMO_MODE=true é obrigatório para o seed local}"
if [ "$DEMO_MODE" != "true" ]; then
  echo "recusando seed: defina DEMO_MODE=true apenas em desenvolvimento" >&2
  exit 1
fi
psql "$MIGRATION_DATABASE_URL" --set ON_ERROR_STOP=1 --file db/seeds/001_local.sql
