-- Ajuste de acesso MVP 1: admin/operação podem administrar empresas do próprio tenant.

CREATE OR REPLACE FUNCTION app_role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE OR REPLACE FUNCTION empresa_acessivel(target UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT app_role() IN ('admin', 'operador')
      OR target = app_empresa_id()
      OR EXISTS (
        SELECT 1 FROM concessoes_mentor cm
         WHERE cm.tenant_id = app_tenant_id()
           AND cm.empresa_id = target
           AND cm.mentor_id = app_user_id()
           AND cm.revogada_em IS NULL
           AND (cm.fim_em IS NULL OR cm.fim_em > now())
      );
$$;

DROP POLICY IF EXISTS concessoes_mentor_tenant_isolation ON concessoes_mentor;
CREATE POLICY concessoes_mentor_tenant_isolation ON concessoes_mentor
  USING (
    tenant_id = app_tenant_id()
    AND (app_role() IN ('admin', 'operador') OR mentor_id = app_user_id() OR empresa_id = app_empresa_id())
  )
  WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, UPDATE ON edital_chunks TO licite_core;
GRANT SELECT ON edital_versoes TO licite_core;

DROP POLICY IF EXISTS empresa_usuarios_tenant_isolation ON empresa_usuarios;
CREATE POLICY empresa_usuarios_tenant_isolation ON empresa_usuarios
  USING (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR empresa_acessivel(empresa_id))
  )
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
