-- Fase D: Aluno e Mentor completos.
--
-- Plano de 30 dias, prática com editais reais (só leitura), devolutiva do mentor, anotações
-- (privadas e compartilhadas), sessões de mentoria e certificado interno de conclusão.
-- O certificado é um registro interno do Licite Comigo e não tem validade jurídica.
--
-- Quem enxerga o quê: o aluno vê o que é dele; o mentor vê só os alunos que acompanha
-- (vínculo ativo em `mentor_mentorado` ou turma dele); a Administração (papel `admin` dentro
-- da conta da plataforma) vê tudo da conta. Cada sessão de equipe da plataforma também lê
-- entre contas, como nas demais tabelas.

-- Mentor "acompanha" o aluno por vínculo direto ou por turma.
CREATE OR REPLACE FUNCTION app_mentor_de(aluno UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
           SELECT 1 FROM mentor_mentorado mm
            WHERE mm.tenant_id = app_tenant_id() AND mm.mentor_id = app_user_id()
              AND mm.mentorado_id = aluno AND mm.status = 'ativo')
      OR EXISTS (
           SELECT 1 FROM matriculas m JOIN turmas t ON t.id = m.turma_id
            WHERE m.tenant_id = app_tenant_id() AND t.mentor_id = app_user_id()
              AND m.aluno_id = aluno AND m.status = 'ativa');
$$;

-- Regra comum: o próprio aluno, o mentor dele ou a Administração.
CREATE OR REPLACE FUNCTION app_acompanha_aluno(aluno UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT aluno = app_user_id() OR app_role() = 'admin' OR app_mentor_de(aluno);
$$;

CREATE TABLE IF NOT EXISTS planos_aluno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  trilha_id UUID REFERENCES trilhas(id) ON DELETE SET NULL,
  inicio DATE NOT NULL,
  gerado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id)
);

CREATE TABLE IF NOT EXISTS plano_dias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dia SMALLINT NOT NULL CHECK (dia BETWEEN 1 AND 30),
  objetivo TEXT NOT NULL,
  atividade TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'aula' CHECK (tipo IN ('aula', 'quiz', 'pratica', 'revisao', 'livre')),
  aula_id UUID REFERENCES aulas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'feito', 'revisado')),
  feito_em TIMESTAMPTZ,
  revisado_em TIMESTAMPTZ,
  revisado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  comentario_mentor TEXT,
  ajustado_pelo_mentor BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, dia)
);
CREATE INDEX IF NOT EXISTS plano_dias_aluno_idx ON plano_dias (tenant_id, aluno_id, status);

CREATE TABLE IF NOT EXISTS praticas_edital (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'devolvida')),
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  enviada_em TIMESTAMPTZ,
  devolutiva TEXT,
  nota SMALLINT CHECK (nota BETWEEN 1 AND 5),
  devolvida_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  devolvida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, edital_id)
);
CREATE INDEX IF NOT EXISTS praticas_edital_fila_idx ON praticas_edital (tenant_id, status, enviada_em);

CREATE TABLE IF NOT EXISTS mentoria_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  mentor_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 4000),
  visibilidade TEXT NOT NULL DEFAULT 'privada' CHECK (visibilidade IN ('privada', 'compartilhada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mentoria_notas_aluno_idx ON mentoria_notas (tenant_id, aluno_id, created_at DESC);

CREATE TABLE IF NOT EXISTS certificados_internos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  trilha_id UUID NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  aulas_total INTEGER NOT NULL,
  emitido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, trilha_id)
);

-- Sessões de mentoria: resumo compartilhado com o aluno; `notas` continua só do mentor.
ALTER TABLE mentorias_sessao
  ADD COLUMN IF NOT EXISTS link TEXT,
  ADD COLUMN IF NOT EXISTS resumo TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE mentorias_sessao DROP CONSTRAINT IF EXISTS mentorias_sessao_status_check;
ALTER TABLE mentorias_sessao ADD CONSTRAINT mentorias_sessao_status_check
  CHECK (status IN ('agendada', 'realizada', 'cancelada'));
CREATE INDEX IF NOT EXISTS mentorias_sessao_aluno_idx ON mentorias_sessao (tenant_id, aluno_id, inicio_at);

DO $$
DECLARE
  nome TEXT;
BEGIN
  FOREACH nome IN ARRAY ARRAY['planos_aluno', 'plano_dias', 'praticas_edital', 'mentoria_notas', 'certificados_internos']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I OWNER TO licite_owner', nome);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO licite_core', nome);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', nome || '_platform_read', nome);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app_is_platform_session())', nome || '_platform_read', nome);
  END LOOP;
END $$;

DROP POLICY IF EXISTS planos_aluno_acesso ON planos_aluno;
CREATE POLICY planos_aluno_acesso ON planos_aluno
  USING (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id))
  WITH CHECK (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id));

DROP POLICY IF EXISTS plano_dias_acesso ON plano_dias;
CREATE POLICY plano_dias_acesso ON plano_dias
  USING (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id))
  WITH CHECK (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id));

DROP POLICY IF EXISTS praticas_edital_acesso ON praticas_edital;
CREATE POLICY praticas_edital_acesso ON praticas_edital
  USING (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id))
  WITH CHECK (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id));

DROP POLICY IF EXISTS certificados_internos_acesso ON certificados_internos;
CREATE POLICY certificados_internos_acesso ON certificados_internos
  USING (tenant_id = app_tenant_id() AND app_acompanha_aluno(aluno_id))
  WITH CHECK (tenant_id = app_tenant_id() AND aluno_id = app_user_id());

-- Anotações: o mentor vê e grava as suas; o aluno lê só as compartilhadas com ele.
DROP POLICY IF EXISTS mentoria_notas_acesso ON mentoria_notas;
CREATE POLICY mentoria_notas_acesso ON mentoria_notas
  USING (
    tenant_id = app_tenant_id()
    AND (
      app_role() = 'admin'
      OR (mentor_id = app_user_id() AND app_mentor_de(aluno_id))
      OR (aluno_id = app_user_id() AND visibilidade = 'compartilhada')
    )
  )
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND (app_role() = 'admin' OR (mentor_id = app_user_id() AND app_mentor_de(aluno_id)))
  );

-- Sessões: só mentor e aluno envolvidos (e a Administração).
DROP POLICY IF EXISTS mentorias_sessao_tenant_isolation ON mentorias_sessao;
DROP POLICY IF EXISTS mentorias_sessao_acesso ON mentorias_sessao;
CREATE POLICY mentorias_sessao_acesso ON mentorias_sessao
  USING (
    tenant_id = app_tenant_id()
    AND (app_role() = 'admin' OR mentor_id = app_user_id() OR aluno_id = app_user_id())
  )
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND (app_role() = 'admin' OR (mentor_id = app_user_id() AND app_mentor_de(aluno_id)))
  );
DROP POLICY IF EXISTS mentorias_sessao_platform_read ON mentorias_sessao;
CREATE POLICY mentorias_sessao_platform_read ON mentorias_sessao
  FOR SELECT USING (app_is_platform_session());
GRANT SELECT, INSERT, UPDATE, DELETE ON mentorias_sessao TO licite_core;
