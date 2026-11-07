-- Aluno: biblioteca de materiais, diagnóstico inicial, encontros ao vivo e prazo de acesso.
--
-- Tudo vive na conta da plataforma (onde ficam alunos e mentores). A Administração gerencia os
-- materiais e os prazos; o mentor marca encontros; o aluno lê o que é da sua turma.

-- 1. Prazos e grupo da turma -------------------------------------------------------------
ALTER TABLE turmas
  ADD COLUMN IF NOT EXISTS acesso_ate DATE,
  ADD COLUMN IF NOT EXISTS mentoria_ate DATE,
  ADD COLUMN IF NOT EXISTS grupo_url TEXT CHECK (grupo_url IS NULL OR grupo_url ~ '^https://');

-- O aluno passa a ler a própria turma. A policy de `turmas` não pode consultar `matriculas`
-- direto (a de `matriculas` já consulta `turmas`), então o vínculo passa por uma função que
-- devolve só as turmas do próprio aluno e roda sem a recursão de policy.
CREATE OR REPLACE FUNCTION aluno_turma_ids() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.turma_id FROM matriculas m
   WHERE m.tenant_id = app_tenant_id() AND m.aluno_id = app_user_id() AND m.status = 'ativa';
$$;
ALTER FUNCTION aluno_turma_ids() OWNER TO licite_owner;
REVOKE ALL ON FUNCTION aluno_turma_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aluno_turma_ids() TO licite_core;

DROP POLICY IF EXISTS turmas_do_aluno ON turmas;
CREATE POLICY turmas_do_aluno ON turmas FOR SELECT
  USING (tenant_id = app_tenant_id() AND id IN (SELECT aluno_turma_ids()));

CREATE OR REPLACE FUNCTION aluno_acesso()
RETURNS TABLE (turma_id UUID, turma_nome TEXT, acesso_ate DATE, mentoria_ate DATE, grupo_url TEXT)
LANGUAGE sql STABLE AS $$
  SELECT t.id, t.nome, t.acesso_ate, t.mentoria_ate, t.grupo_url
    FROM turmas t
   WHERE t.tenant_id = app_tenant_id() AND t.id IN (SELECT aluno_turma_ids())
   ORDER BY t.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION aluno_acesso() TO licite_core;

-- 2. Materiais -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  codigo TEXT NOT NULL CHECK (length(trim(codigo)) > 0),
  titulo TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  descricao TEXT,
  etapa TEXT NOT NULL CHECK (etapa IN
    ('comecar', 'oportunidades', 'documentos', 'proposta', 'sessao', 'pos', 'assessor', 'base')),
  tipo TEXT NOT NULL CHECK (tipo IN
    ('guia', 'checklist', 'modelo', 'planilha', 'lista', 'lei', 'video', 'outro')),
  para TEXT NOT NULL DEFAULT 'todos' CHECK (para IN ('todos', 'fornecedor', 'assessor')),
  url TEXT CHECK (url IS NULL OR url ~ '^https://'),
  conteudo TEXT,
  ordem INTEGER NOT NULL DEFAULT 100,
  publicado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);
CREATE INDEX IF NOT EXISTS materiais_lista_idx ON materiais (tenant_id, etapa, ordem);

-- 3. Diagnóstico inicial do aluno ("Rx do licitante") ---------------------------------------
CREATE TABLE IF NOT EXISTS diagnosticos_aluno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  atuacao TEXT NOT NULL CHECK (atuacao IN ('fornecedor', 'assessor')),
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  concluido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id)
);

-- 4. Encontros ao vivo (em grupo) ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encontros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  turma_id UUID REFERENCES turmas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  descricao TEXT,
  inicio_at TIMESTAMPTZ NOT NULL,
  fim_at TIMESTAMPTZ,
  link TEXT CHECK (link IS NULL OR link ~ '^https://'),
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'realizado', 'cancelado')),
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS encontros_inicio_idx ON encontros (tenant_id, inicio_at DESC);

DO $$
DECLARE
  nome TEXT;
BEGIN
  FOREACH nome IN ARRAY ARRAY['materiais', 'diagnosticos_aluno', 'encontros']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I OWNER TO licite_owner', nome);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO licite_core', nome);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', nome || '_platform_read', nome);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app_is_platform_session())', nome || '_platform_read', nome);
  END LOOP;
END $$;

-- Materiais: quem está na conta da plataforma lê o que foi publicado; só a Administração grava.
DROP POLICY IF EXISTS materiais_leitura ON materiais;
CREATE POLICY materiais_leitura ON materiais FOR SELECT
  USING (tenant_id = app_tenant_id() AND is_platform_tenant(tenant_id)
         AND (publicado OR app_role() = 'admin'));
DROP POLICY IF EXISTS materiais_gestao ON materiais;
CREATE POLICY materiais_gestao ON materiais FOR ALL
  USING (tenant_id = app_tenant_id() AND app_role() = 'admin' AND is_platform_tenant(tenant_id))
  WITH CHECK (tenant_id = app_tenant_id() AND app_role() = 'admin' AND is_platform_tenant(tenant_id));

-- Diagnóstico: o próprio aluno, o mentor dele ou a Administração.
DROP POLICY IF EXISTS diagnosticos_aluno_acesso ON diagnosticos_aluno;
CREATE POLICY diagnosticos_aluno_acesso ON diagnosticos_aluno
  USING (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id))
  WITH CHECK (tenant_id = app_tenant_id() AND aluno_id = app_user_id());

-- Encontros: equipe vê todos; aluno vê os da própria turma e os abertos a todas as turmas.
DROP POLICY IF EXISTS encontros_leitura ON encontros;
CREATE POLICY encontros_leitura ON encontros FOR SELECT
  USING (
    tenant_id = app_tenant_id() AND is_platform_tenant(tenant_id)
    AND (
      app_role() IN ('admin', 'mentor')
      OR turma_id IS NULL
      OR turma_id IN (SELECT m.turma_id FROM matriculas m
                       WHERE m.aluno_id = app_user_id() AND m.status = 'ativa')
    )
  );
DROP POLICY IF EXISTS encontros_gestao ON encontros;
CREATE POLICY encontros_gestao ON encontros FOR ALL
  USING (tenant_id = app_tenant_id() AND app_role() IN ('admin', 'mentor') AND is_platform_tenant(tenant_id))
  WITH CHECK (tenant_id = app_tenant_id() AND app_role() IN ('admin', 'mentor') AND is_platform_tenant(tenant_id));
