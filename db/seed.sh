#!/bin/sh
set -eu
: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL é obrigatório}"
psql "$MIGRATION_DATABASE_URL" --set ON_ERROR_STOP=1 --file db/seeds/001_local.sql
