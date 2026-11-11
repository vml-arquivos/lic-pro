-- Gestão de usuários pela Administração.
--
-- 1. Convite de equipe administrativa (a pessoa entra na conta da plataforma com papel `plataforma`).
-- 2. Registro de uso: o que cada usuário abriu (por recurso e por dia) e o que buscou.
--    A Administração lê esses dados na ficha de cada usuário; ninguém além dela e do próprio
--    usuário (isolamento por conta) enxerga.

ALTER TABLE convites DROP CONSTRAINT IF EXISTS convites_tipo_check;
ALTER TABLE convites ADD CONSTRAINT convites_tipo_check
  CHECK (tipo IN ('aluno', 'mentor', 'empresa', 'colaborador', 'equipe'));

CREATE TABLE IF NOT EXISTS atividade_usuario (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  recurso TEXT NOT NULL CHECK (length(recurso) BETWEEN 1 AND 60),
  total INTEGER NOT NULL DEFAULT 1 CHECK (total > 0),
  primeiro_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, usuario_id, dia, recurso)
);
CREATE INDEX IF NOT EXISTS atividade_usuario_recente_idx
  ON atividade_usuario (tenant_id, usuario_id, ultimo_em DESC);

CREATE TABLE IF NOT EXISTS atividade_buscas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  origem TEXT NOT NULL CHECK (origem IN ('radar', 'precos')),
  termo TEXT CHECK (termo IS NULL OR length(termo) <= 200),
  filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atividade_buscas_recente_idx
  ON atividade_buscas (tenant_id, usuario_id, created_at DESC);

DO $$
DECLARE
  nome TEXT;
BEGIN
  FOREACH nome IN ARRAY ARRAY['atividade_usuario', 'atividade_buscas']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I OWNER TO licite_owner', nome);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO licite_core', nome);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', nome || '_tenant_isolation', nome);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      nome || '_tenant_isolation', nome
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', nome || '_platform_read', nome);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_is_platform_session())',
      nome || '_platform_read', nome
    );
  END LOOP;
END $$;
