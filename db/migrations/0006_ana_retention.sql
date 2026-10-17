-- Fase 3.2 item 1.4 — retenção auditável do histórico da Ana.

CREATE TABLE ana_retencao_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim_em TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('processando', 'concluida', 'erro')),
  conversas_excluidas INTEGER NOT NULL DEFAULT 0,
  mensagens_excluidas INTEGER NOT NULL DEFAULT 0,
  tool_calls_excluidos INTEGER NOT NULL DEFAULT 0,
  erro TEXT
);

ALTER TABLE ana_retencao_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_retencao_execucoes FORCE ROW LEVEL SECURITY;
CREATE POLICY ana_retencao_execucoes_isolation ON ana_retencao_execucoes
  USING (tenant_id IS NULL OR tenant_id = app_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = app_tenant_id());

-- O worker agenda uma conexão própria e só ele define o contexto de retenção.
CREATE POLICY ana_conversas_retention_job ON ana_conversas
  FOR DELETE USING (current_setting('app.retention_job', true) = 'true');
CREATE POLICY ana_mensagens_retention_job ON ana_mensagens
  FOR DELETE USING (current_setting('app.retention_job', true) = 'true');
CREATE POLICY ana_tool_calls_retention_job ON ana_tool_calls
  FOR DELETE USING (current_setting('app.retention_job', true) = 'true');

ALTER TABLE ana_retencao_execucoes OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE ON ana_retencao_execucoes TO licite_ai;
GRANT DELETE ON ana_conversas, ana_mensagens, ana_tool_calls TO licite_ai;
