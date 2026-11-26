-- Fornecedores acompanhados: a empresa escolhe concorrentes (por CNPJ) e o sistema avisa quando
-- aparece contrato novo no PNCP. Só cria a tabela; nada existente muda.
CREATE TABLE IF NOT EXISTS fornecedores_acompanhados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  cnpj TEXT NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  nome TEXT,
  apelido TEXT,
  ultimo_visto_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cnpj)
);
CREATE INDEX IF NOT EXISTS fornecedores_acompanhados_tenant_idx
  ON fornecedores_acompanhados (tenant_id, created_at DESC);

ALTER TABLE fornecedores_acompanhados ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores_acompanhados FORCE ROW LEVEL SECURITY;
ALTER TABLE fornecedores_acompanhados OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON fornecedores_acompanhados TO licite_core;

DROP POLICY IF EXISTS fornecedores_acompanhados_tenant_isolation ON fornecedores_acompanhados;
CREATE POLICY fornecedores_acompanhados_tenant_isolation ON fornecedores_acompanhados
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS fornecedores_acompanhados_platform_read ON fornecedores_acompanhados;
CREATE POLICY fornecedores_acompanhados_platform_read ON fornecedores_acompanhados
  FOR SELECT USING (app_is_platform_session());
