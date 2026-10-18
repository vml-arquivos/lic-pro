-- Etapa 0.2 — o cluster e o runner usam licite_admin; licite_owner só possui objetos.
-- Esta migration remove o LOGIN de licite_owner (ele passa a ser apenas dono dos objetos)
-- e normaliza o dono de schema_migrations. Não altera migrations históricas.
-- Ver também 0012_owner_schema_usage.sql (USAGE no schema public para licite_owner).

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
