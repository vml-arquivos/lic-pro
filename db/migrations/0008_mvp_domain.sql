-- MVP 1 — modelo de domínio, governança e versionamento.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS publico TEXT NOT NULL DEFAULT 'empresa',
  ADD COLUMN IF NOT EXISTS nivel_diagnostico TEXT NOT NULL DEFAULT 'sem_diagnostico';
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_publico_check,
  DROP CONSTRAINT IF EXISTS usuarios_nivel_diagnostico_check;
ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_publico_check
    CHECK (publico IN ('empresa', 'mentor', 'estudante')),
  ADD CONSTRAINT usuarios_nivel_diagnostico_check
    CHECK (nivel_diagnostico IN ('sem_diagnostico', 'iniciante', 'em_evolucao', 'pronto_para_operar'));

CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  cnpj TEXT NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  razao_social TEXT NOT NULL CHECK (length(trim(razao_social)) > 0),
  nome_fantasia TEXT,
  porte TEXT CHECK (porte IS NULL OR porte IN ('mei', 'micro', 'pequena', 'media', 'grande')),
  segmento TEXT,
  cidade TEXT,
  uf CHAR(2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cnpj)
);

CREATE TABLE empresa_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'membro' CHECK (papel IN ('proprietario', 'administrador', 'membro', 'leitor')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, empresa_id, usuario_id)
);

CREATE TABLE planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  limites JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  plano_id UUID NOT NULL REFERENCES planos(id),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'ativa', 'past_due', 'cancelada', 'expirada')),
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim_em TIMESTAMPTZ,
  limites_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE concessoes_mentor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  mentor_id UUID NOT NULL REFERENCES usuarios(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  escopo JSONB NOT NULL DEFAULT '{}'::jsonb,
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim_em TIMESTAMPTZ,
  revogada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mentor_id, empresa_id)
);

CREATE TABLE oportunidades_salvas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  edital_id UUID NOT NULL REFERENCES editais(id),
  status TEXT NOT NULL DEFAULT 'salva'
    CHECK (status IN ('salva', 'triagem', 'em_analise', 'em_habilitacao', 'proposta', 'arquivada', 'ganha', 'perdida')),
  observacoes TEXT,
  origem TEXT NOT NULL DEFAULT 'radar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, empresa_id, edital_id)
);

CREATE TABLE checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  oportunidade_id UUID NOT NULL REFERENCES oportunidades_salvas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'habilitacao' CHECK (tipo IN ('habilitacao', 'proposta', 'operacional', 'customizado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checklist_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  concluido BOOLEAN NOT NULL DEFAULT false,
  evidencia_url TEXT,
  atualizado_por UUID REFERENCES usuarios(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE prazos_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  oportunidade_id UUID REFERENCES oportunidades_salvas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'prazo',
  vence_em TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'concluido', 'cancelado', 'atrasado')),
  fonte TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  oportunidade_id UUID REFERENCES oportunidades_salvas(id) ON DELETE CASCADE,
  responsavel_id UUID REFERENCES usuarios(id),
  titulo TEXT NOT NULL,
  descricao TEXT,
  prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'concluida', 'cancelada')),
  vence_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE edital_versoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL CHECK (numero > 0),
  fonte TEXT NOT NULL,
  url_origem TEXT,
  hash_conteudo TEXT NOT NULL,
  conteudo_texto TEXT,
  publicado_em TIMESTAMPTZ,
  capturado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, edital_id, numero),
  UNIQUE (tenant_id, edital_id, hash_conteudo)
);

ALTER TABLE edital_chunks
  ADD COLUMN IF NOT EXISTS fonte TEXT,
  ADD COLUMN IF NOT EXISTS confianca NUMERIC(5, 4) CHECK (confianca IS NULL OR confianca BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS status_validacao TEXT NOT NULL DEFAULT 'extraido',
  ADD COLUMN IF NOT EXISTS corrigido_por UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS corrigido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observacao_correcao TEXT;
ALTER TABLE edital_chunks
  DROP CONSTRAINT IF EXISTS edital_chunks_status_validacao_check;
ALTER TABLE edital_chunks
  ADD CONSTRAINT edital_chunks_status_validacao_check
    CHECK (status_validacao IN ('extraido', 'confirmado_usuario', 'corrigido'));

ALTER TABLE auditoria
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id),
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS versao_dados TEXT;

CREATE TABLE rotinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('alerta_prazo', 'triagem_radar', 'checklist', 'relatorio')),
  configuracao JSONB NOT NULL DEFAULT '{}'::jsonb,
  requer_aprovacao BOOLEAN NOT NULL DEFAULT true,
  ativa BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rotina_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rotina_id UUID NOT NULL REFERENCES rotinas(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluida', 'erro', 'bloqueada')),
  entrada JSONB NOT NULL DEFAULT '{}'::jsonb,
  saida JSONB,
  erro TEXT,
  iniciou_em TIMESTAMPTZ,
  concluiu_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aprovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  solicitante_id UUID NOT NULL REFERENCES usuarios(id),
  aprovador_id UUID REFERENCES usuarios(id),
  rotina_execucao_id UUID REFERENCES rotina_execucoes(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada', 'executada', 'expirada')),
  justificativa TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidido_em TIMESTAMPTZ
);

CREATE TABLE notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  lida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app_empresa_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.empresa_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION empresa_acessivel(target UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT target = app_empresa_id()
      OR EXISTS (
        SELECT 1 FROM concessoes_mentor cm
         WHERE cm.tenant_id = app_tenant_id()
           AND cm.empresa_id = target
           AND cm.mentor_id = app_user_id()
           AND cm.revogada_em IS NULL
           AND (cm.fim_em IS NULL OR cm.fim_em > now())
      );
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'empresas', 'empresa_usuarios', 'assinaturas', 'concessoes_mentor',
    'oportunidades_salvas', 'checklists', 'checklist_itens', 'prazos_agenda',
    'tarefas', 'edital_versoes', 'rotinas', 'rotina_execucoes', 'aprovacoes',
    'notificacoes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY empresas_tenant_isolation ON empresas
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(id))
  WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY empresa_usuarios_tenant_isolation ON empresa_usuarios
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY assinaturas_tenant_isolation ON assinaturas
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY concessoes_mentor_tenant_isolation ON concessoes_mentor
  USING (tenant_id = app_tenant_id() AND (mentor_id = app_user_id() OR empresa_id = app_empresa_id()))
  WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY oportunidades_tenant_isolation ON oportunidades_salvas
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY checklists_tenant_isolation ON checklists
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY checklist_itens_tenant_isolation ON checklist_itens
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY prazos_tenant_isolation ON prazos_agenda
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY tarefas_tenant_isolation ON tarefas
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY edital_versoes_tenant_isolation ON edital_versoes
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY rotinas_tenant_isolation ON rotinas
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY rotina_execucoes_tenant_isolation ON rotina_execucoes
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY aprovacoes_tenant_isolation ON aprovacoes
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
CREATE POLICY notificacoes_tenant_isolation ON notificacoes
  USING (tenant_id = app_tenant_id() AND (usuario_id = app_user_id() OR empresa_acessivel(empresa_id)))
  WITH CHECK (tenant_id = app_tenant_id());

CREATE INDEX empresas_tenant_idx ON empresas (tenant_id, id);
CREATE INDEX empresa_usuarios_usuario_idx ON empresa_usuarios (tenant_id, usuario_id, ativo);
CREATE INDEX oportunidades_pipeline_idx ON oportunidades_salvas (tenant_id, empresa_id, status, updated_at);
CREATE INDEX prazos_agenda_idx ON prazos_agenda (tenant_id, empresa_id, vence_em, status);
CREATE INDEX tarefas_responsavel_idx ON tarefas (tenant_id, responsavel_id, status, vence_em);
CREATE INDEX edital_versoes_edital_idx ON edital_versoes (tenant_id, edital_id, numero DESC);
CREATE INDEX notificacoes_usuario_idx ON notificacoes (tenant_id, usuario_id, lida_em, created_at DESC);

ALTER TABLE empresas OWNER TO licite_owner;
ALTER TABLE empresa_usuarios OWNER TO licite_owner;
ALTER TABLE planos OWNER TO licite_owner;
ALTER TABLE assinaturas OWNER TO licite_owner;
ALTER TABLE concessoes_mentor OWNER TO licite_owner;
ALTER TABLE oportunidades_salvas OWNER TO licite_owner;
ALTER TABLE checklists OWNER TO licite_owner;
ALTER TABLE checklist_itens OWNER TO licite_owner;
ALTER TABLE prazos_agenda OWNER TO licite_owner;
ALTER TABLE tarefas OWNER TO licite_owner;
ALTER TABLE edital_versoes OWNER TO licite_owner;
ALTER TABLE rotinas OWNER TO licite_owner;
ALTER TABLE rotina_execucoes OWNER TO licite_owner;
ALTER TABLE aprovacoes OWNER TO licite_owner;
ALTER TABLE notificacoes OWNER TO licite_owner;

GRANT SELECT ON planos TO licite_core, licite_ai;
GRANT SELECT, INSERT, UPDATE ON empresas, empresa_usuarios, assinaturas, oportunidades_salvas,
  checklists, checklist_itens, prazos_agenda, tarefas, edital_versoes, rotinas,
  rotina_execucoes, aprovacoes, notificacoes TO licite_core;
GRANT SELECT ON concessoes_mentor TO licite_core;
GRANT SELECT, INSERT, UPDATE ON edital_chunks TO licite_ai;
GRANT SELECT ON edital_versoes TO licite_ai;
