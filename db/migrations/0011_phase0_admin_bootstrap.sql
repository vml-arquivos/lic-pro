-- Etapa 0.2 — o cluster e o runner usam licite_admin; licite_owner só possui objetos.
-- Não alterar migrations históricas: esta migration corrige instalações já existentes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_owner') THEN
    CREATE ROLE licite_owner NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
END $$;

ALTER ROLE licite_owner
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    ALTER TABLE public.schema_migrations OWNER TO licite_owner;
  END IF;
END $$;
