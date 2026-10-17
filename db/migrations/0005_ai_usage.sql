-- Fase 3.1 item 6 — custo, abuso e cotas de IA por tenant.

CREATE TABLE cotas_ia (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  limite_chamadas_mes INTEGER NOT NULL DEFAULT 1000 CHECK (limite_chamadas_mes > 0),
  limite_tokens_mes BIGINT NOT NULL DEFAULT 1000000 CHECK (limite_tokens_mes > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE uso_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  mes DATE NOT NULL,
  chamadas INTEGER NOT NULL DEFAULT 0 CHECK (chamadas >= 0),
  tokens_entrada BIGINT NOT NULL DEFAULT 0 CHECK (tokens_entrada >= 0),
  tokens_saida BIGINT NOT NULL DEFAULT 0 CHECK (tokens_saida >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, usuario_id, mes)
);

CREATE INDEX uso_ia_tenant_mes_idx ON uso_ia (tenant_id, mes);

ALTER TABLE cotas_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotas_ia FORCE ROW LEVEL SECURITY;
ALTER TABLE uso_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE uso_ia FORCE ROW LEVEL SECURITY;

CREATE POLICY cotas_ia_tenant_isolation ON cotas_ia
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY uso_ia_tenant_isolation ON uso_ia
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE cotas_ia OWNER TO licite_owner;
ALTER TABLE uso_ia OWNER TO licite_owner;

GRANT SELECT ON cotas_ia, uso_ia TO licite_core;
GRANT SELECT, INSERT, UPDATE ON cotas_ia, uso_ia TO licite_ai;
