-- Fase 2B — quizzes simples por módulo. Conteúdo inicial permanece rascunho para revisão.

CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id UUID NOT NULL UNIQUE REFERENCES modulos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho_para_revisao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_questoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL CHECK (ordem > 0),
  enunciado TEXT NOT NULL,
  alternativas JSONB NOT NULL DEFAULT '[]'::jsonb,
  resposta_correta SMALLINT,
  status TEXT NOT NULL DEFAULT 'rascunho_para_revisao',
  UNIQUE (quiz_id, ordem)
);

CREATE TABLE quiz_tentativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  nota NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quiz_tentativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_tentativas FORCE ROW LEVEL SECURITY;
CREATE POLICY quiz_tentativas_tenant_isolation ON quiz_tentativas
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE INDEX quiz_tentativas_usuario_idx ON quiz_tentativas (tenant_id, usuario_id, created_at);

DO $$
DECLARE
  v_modulo RECORD;
  v_quiz UUID;
BEGIN
  FOR v_modulo IN SELECT id, titulo FROM modulos LOOP
    INSERT INTO quizzes (modulo_id, titulo, status)
    VALUES (v_modulo.id, 'Quiz de revisão — conteúdo em revisão', 'rascunho_para_revisao')
    ON CONFLICT (modulo_id) DO UPDATE SET
      titulo = EXCLUDED.titulo,
      status = 'rascunho_para_revisao'
    RETURNING id INTO v_quiz;

    IF v_quiz IS NULL THEN
      SELECT id INTO v_quiz FROM quizzes WHERE modulo_id = v_modulo.id;
    END IF;

    INSERT INTO quiz_questoes (quiz_id, ordem, enunciado, alternativas, status)
    VALUES (
      v_quiz,
      1,
      'Qual é o próximo passo responsável ao encontrar uma oportunidade?',
      '["Ler a fonte original e conferir os requisitos", "Ignorar os anexos", "Assumir que todos os dados estão completos"]'::jsonb,
      'rascunho_para_revisao'
    )
    ON CONFLICT (quiz_id, ordem) DO UPDATE SET
      enunciado = EXCLUDED.enunciado,
      alternativas = EXCLUDED.alternativas,
      status = 'rascunho_para_revisao';
  END LOOP;
END $$;
