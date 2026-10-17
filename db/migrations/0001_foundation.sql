-- Licite Comigo — Fase 1
-- PostgreSQL 16 + pgvector. Todas as regras de disputa permanecem configuráveis
-- e devem ser validadas contra a norma vigente e as regras de cada portal.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE papel_usuario AS ENUM ('admin', 'operador', 'mentor', 'aluno');
CREATE TYPE perfil_jornada AS ENUM ('iniciante', 'mentorado', 'profissional');
CREATE TYPE status_analise AS ENUM ('pendente', 'processando', 'concluida', 'erro');
CREATE TYPE tipo_mensagem_ana AS ENUM ('usuario', 'assistente', 'sistema', 'ferramenta');

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL CHECK (position('@' in email) > 1),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  papel papel_usuario NOT NULL DEFAULT 'aluno',
  perfil_jornada perfil_jornada NOT NULL DEFAULT 'iniciante',
  ativo BOOLEAN NOT NULL DEFAULT true,
  onboarding_concluido BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE editais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  fonte TEXT NOT NULL,
  id_externo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  orgao TEXT,
  uf CHAR(2),
  uasg TEXT,
  modalidade TEXT,
  catmat_catser TEXT,
  valor_estimado NUMERIC(18, 2),
  data_publicacao TIMESTAMPTZ,
  url_origem TEXT,
  hash_conteudo TEXT NOT NULL,
  conteudo_texto TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(titulo, '') || ' ' ||
      coalesce(orgao, '') || ' ' ||
      coalesce(modalidade, '') || ' ' ||
      coalesce(catmat_catser, '') || ' ' ||
      coalesce(conteudo_texto, '')
    )
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fonte, id_externo)
);

CREATE INDEX editais_search_vector_idx ON editais USING GIN (search_vector);
CREATE INDEX editais_catmat_catser_idx ON editais (catmat_catser);
CREATE INDEX editais_filters_idx ON editais (tenant_id, uf, uasg, modalidade, valor_estimado);

CREATE TABLE itens_edital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidade NUMERIC(18, 6),
  valor_unitario_estimado NUMERIC(18, 2),
  catmat_catser TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edital_id, numero)
);

CREATE TABLE edital_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  pagina INTEGER CHECK (pagina IS NULL OR pagina > 0),
  secao TEXT,
  clausula TEXT,
  conteudo TEXT NOT NULL,
  embedding VECTOR(1024),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX edital_chunks_embedding_hnsw_idx
  ON edital_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
CREATE INDEX edital_chunks_edital_pagina_idx ON edital_chunks (edital_id, pagina);

CREATE TABLE analises_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  status status_analise NOT NULL DEFAULT 'pendente',
  resultado JSONB,
  modelo TEXT,
  prompt_version TEXT,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pregoes_ativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id),
  item_id UUID NOT NULL REFERENCES itens_edital(id),
  portal TEXT NOT NULL,
  identificador_externo TEXT,
  status TEXT NOT NULL DEFAULT 'monitorando',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE estrategias_lances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pregao_id UUID NOT NULL REFERENCES pregoes_ativos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  modo_disputa TEXT NOT NULL,
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  versao_regras TEXT NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lances_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pregao_id UUID NOT NULL REFERENCES pregoes_ativos(id),
  item_id UUID REFERENCES itens_edital(id),
  evento TEXT NOT NULL,
  decisao TEXT NOT NULL,
  motivo TEXT NOT NULL,
  valor NUMERIC(18, 2),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX lances_log_pregao_created_idx ON lances_log (pregao_id, created_at);

CREATE FUNCTION impedir_mutacao_lances_log() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lances_log é append-only; UPDATE e DELETE não são permitidos';
END;
$$;

CREATE TRIGGER lances_log_append_only
  BEFORE UPDATE OR DELETE ON lances_log
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacao_lances_log();

CREATE TABLE mentorias_sessao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  mentor_id UUID NOT NULL REFERENCES usuarios(id),
  aluno_id UUID NOT NULL REFERENCES usuarios(id),
  titulo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendada',
  inicio_at TIMESTAMPTZ,
  fim_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ana_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  titulo TEXT,
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  apagada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ana_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  conversa_id UUID NOT NULL REFERENCES ana_conversas(id) ON DELETE CASCADE,
  tipo tipo_mensagem_ana NOT NULL,
  conteudo TEXT NOT NULL,
  fonte JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ana_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  conversa_id UUID REFERENCES ana_conversas(id) ON DELETE SET NULL,
  mensagem_id UUID REFERENCES ana_mensagens(id) ON DELETE SET NULL,
  ferramenta TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('leitura', 'acao')),
  argumentos JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB,
  confirmado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID REFERENCES usuarios(id),
  acao TEXT NOT NULL,
  recurso TEXT NOT NULL,
  recurso_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conteúdo da Academia é global e versionado editorialmente; progresso e vínculos são multi-tenant.
CREATE TABLE trilhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho_para_revisao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id UUID NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL CHECK (ordem > 0),
  titulo TEXT NOT NULL,
  resumo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho_para_revisao',
  UNIQUE (trilha_id, ordem)
);

CREATE TABLE aulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id UUID NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL CHECK (ordem > 0),
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'video')),
  conteudo TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho_para_revisao',
  UNIQUE (modulo_id, ordem)
);

CREATE TABLE progresso_aula (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  aula_id UUID NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
  concluida BOOLEAN NOT NULL DEFAULT false,
  percentual SMALLINT NOT NULL DEFAULT 0 CHECK (percentual BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, aula_id)
);

CREATE TABLE glossario_termos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termo TEXT NOT NULL UNIQUE,
  definicao_simples TEXT NOT NULL,
  definicao_tecnica TEXT,
  referencia TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho_para_revisao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mentor_mentorado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  mentor_id UUID NOT NULL REFERENCES usuarios(id),
  mentorado_id UUID NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'ativo',
  liberacoes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, mentor_id, mentorado_id)
);

CREATE FUNCTION app_tenant_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE FUNCTION app_user_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Todas as tabelas abaixo carregam tenant_id e ficam protegidas por RLS.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE editais ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_edital ENABLE ROW LEVEL SECURITY;
ALTER TABLE edital_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analises_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregoes_ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estrategias_lances ENABLE ROW LEVEL SECURITY;
ALTER TABLE lances_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorias_sessao ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE progresso_aula ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_mentorado ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE usuarios FORCE ROW LEVEL SECURITY;
ALTER TABLE editais FORCE ROW LEVEL SECURITY;
ALTER TABLE itens_edital FORCE ROW LEVEL SECURITY;
ALTER TABLE edital_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE analises_ia FORCE ROW LEVEL SECURITY;
ALTER TABLE pregoes_ativos FORCE ROW LEVEL SECURITY;
ALTER TABLE estrategias_lances FORCE ROW LEVEL SECURITY;
ALTER TABLE lances_log FORCE ROW LEVEL SECURITY;
ALTER TABLE mentorias_sessao FORCE ROW LEVEL SECURITY;
ALTER TABLE ana_conversas FORCE ROW LEVEL SECURITY;
ALTER TABLE ana_mensagens FORCE ROW LEVEL SECURITY;
ALTER TABLE ana_tool_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE auditoria FORCE ROW LEVEL SECURITY;
ALTER TABLE progresso_aula FORCE ROW LEVEL SECURITY;
ALTER TABLE mentor_mentorado FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id());

CREATE POLICY usuarios_tenant_isolation ON usuarios
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY editais_tenant_isolation ON editais
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY itens_edital_tenant_isolation ON itens_edital
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY edital_chunks_tenant_isolation ON edital_chunks
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY analises_ia_tenant_isolation ON analises_ia
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY pregoes_ativos_tenant_isolation ON pregoes_ativos
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY estrategias_lances_tenant_isolation ON estrategias_lances
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY lances_log_tenant_isolation ON lances_log
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY mentorias_sessao_tenant_isolation ON mentorias_sessao
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY ana_conversas_tenant_isolation ON ana_conversas
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY ana_mensagens_tenant_isolation ON ana_mensagens
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY ana_tool_calls_tenant_isolation ON ana_tool_calls
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY auditoria_tenant_isolation ON auditoria
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY progresso_aula_tenant_isolation ON progresso_aula
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY mentor_mentorado_tenant_isolation ON mentor_mentorado
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE INDEX usuarios_tenant_idx ON usuarios (tenant_id, id);
CREATE INDEX ana_conversas_usuario_idx ON ana_conversas (tenant_id, usuario_id, created_at);
CREATE INDEX progresso_aula_usuario_idx ON progresso_aula (tenant_id, usuario_id, updated_at);
CREATE INDEX mentor_mentorado_mentorado_idx ON mentor_mentorado (tenant_id, mentorado_id);
