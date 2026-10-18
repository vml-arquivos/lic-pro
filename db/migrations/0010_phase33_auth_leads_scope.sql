-- Fase 3.3 — autenticação self-service, leads e escopo empresarial.

UPDATE usuarios SET publico = 'mentoria' WHERE publico = 'mentor';
UPDATE usuarios SET publico = 'empresa' WHERE publico = 'estudante';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_publico_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_publico_check CHECK (publico IN ('empresa', 'mentoria'));
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_verificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS termos_versao TEXT,
  ADD COLUMN IF NOT EXISTS termos_aceitos_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS politica_versao TEXT,
  ADD COLUMN IF NOT EXISTS politica_aceita_em TIMESTAMPTZ;

CREATE TABLE auth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verificado_em TIMESTAMPTZ,
  verification_token_hash TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, usuario_id)
);

CREATE INDEX auth_credentials_email_idx ON auth_credentials (lower(email));
ALTER TABLE auth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_credentials_flow_only ON auth_credentials
  USING (current_setting('app.auth_flow', true) = 'true')
  WITH CHECK (current_setting('app.auth_flow', true) = 'true');
ALTER TABLE auth_credentials OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE ON auth_credentials TO licite_core;

DROP POLICY IF EXISTS tenant_isolation ON tenants;
CREATE POLICY tenant_isolation ON tenants
  USING (id = app_tenant_id() OR current_setting('app.auth_flow', true) = 'true')
  WITH CHECK (id = app_tenant_id() OR current_setting('app.auth_flow', true) = 'true');

DROP POLICY IF EXISTS usuarios_tenant_isolation ON usuarios;
CREATE POLICY usuarios_tenant_isolation ON usuarios
  USING (tenant_id = app_tenant_id() OR current_setting('app.auth_flow', true) = 'true')
  WITH CHECK (tenant_id = app_tenant_id());

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  email TEXT NOT NULL CHECK (position('@' in email) > 1),
  whatsapp TEXT,
  perfil TEXT NOT NULL CHECK (perfil IN ('empresario', 'mentorado', 'iniciante')),
  consentimento_lgpd BOOLEAN NOT NULL,
  consentimento_versao TEXT NOT NULL,
  consentimento_em TIMESTAMPTZ NOT NULL,
  origem TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  ip_hash TEXT,
  honeypot_vazio BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'contatado', 'qualificado', 'descartado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_email_created_idx ON leads (lower(email), created_at DESC);
CREATE INDEX leads_status_idx ON leads (status, created_at DESC);
ALTER TABLE leads OWNER TO licite_owner;
GRANT INSERT ON leads TO licite_core;
GRANT SELECT, UPDATE ON leads TO licite_core;

CREATE TABLE leads_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE leads_auditoria OWNER TO licite_owner;
GRANT INSERT ON leads_auditoria TO licite_core;

ALTER TABLE checklist_itens
  ADD COLUMN IF NOT EXISTS empresa_id UUID;
UPDATE checklist_itens ci
   SET empresa_id = c.empresa_id
  FROM checklists c
 WHERE c.id = ci.checklist_id AND ci.empresa_id IS NULL;
ALTER TABLE checklist_itens ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE checklist_itens DROP CONSTRAINT IF EXISTS checklist_itens_scope_fk;
ALTER TABLE checklist_itens ADD CONSTRAINT checklist_itens_scope_fk
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE rotina_execucoes
  ADD COLUMN IF NOT EXISTS empresa_id UUID;
UPDATE rotina_execucoes re
   SET empresa_id = r.empresa_id
  FROM rotinas r
 WHERE r.id = re.rotina_id AND re.empresa_id IS NULL;
ALTER TABLE rotina_execucoes ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE rotina_execucoes DROP CONSTRAINT IF EXISTS rotina_execucoes_scope_fk;
ALTER TABLE rotina_execucoes ADD CONSTRAINT rotina_execucoes_scope_fk
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS checklist_itens_tenant_isolation ON checklist_itens;
CREATE POLICY checklist_itens_tenant_isolation ON checklist_itens
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
DROP POLICY IF EXISTS rotina_execucoes_tenant_isolation ON rotina_execucoes;
CREATE POLICY rotina_execucoes_tenant_isolation ON rotina_execucoes
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
DROP POLICY IF EXISTS notificacoes_tenant_isolation ON notificacoes;
CREATE POLICY notificacoes_tenant_isolation ON notificacoes
  USING (
    tenant_id = app_tenant_id()
    AND usuario_id = app_user_id()
    AND empresa_id IS NOT NULL
    AND empresa_acessivel(empresa_id)
  )
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND usuario_id = app_user_id()
    AND empresa_id IS NOT NULL
    AND empresa_acessivel(empresa_id)
  );
DROP POLICY IF EXISTS concessoes_mentor_tenant_isolation ON concessoes_mentor;
CREATE POLICY concessoes_mentor_tenant_isolation ON concessoes_mentor
  USING (
    tenant_id = app_tenant_id()
    AND (app_role() IN ('admin', 'operador') OR mentor_id = app_user_id() OR empresa_id = app_empresa_id())
  )
  WITH CHECK (tenant_id = app_tenant_id() AND app_role() IN ('admin', 'operador'));
GRANT SELECT, INSERT, UPDATE ON concessoes_mentor TO licite_core;

CREATE INDEX checklist_itens_empresa_idx ON checklist_itens (tenant_id, empresa_id, checklist_id);
CREATE INDEX rotina_execucoes_empresa_idx ON rotina_execucoes (tenant_id, empresa_id, rotina_id, created_at DESC);
