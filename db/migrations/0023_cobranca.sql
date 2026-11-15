-- Fase G: planos, cobrança (Asaas), compra do curso e assinatura das empresas.
--
-- Regras desta migration:
-- * Nada é vendido até a equipe ativar um plano (os planos nascem inativos).
-- * Dados de cobrança ficam em tabelas com RLS: a empresa só enxerga as suas; a equipe vê tudo;
--   o fluxo de cobrança (checkout e webhook, sem sessão) liga `app.billing_flow` só no servidor.
-- * Liberar o curso e ativar a assinatura passam por funções restritas (SECURITY DEFINER), para
--   que o core-api não precise de escrita ampla em convites, turmas, matrículas e assinaturas.
-- * CPF/CNPJ do comprador não é guardado aqui: só os 4 últimos dígitos, para conferência.

-- 1. Planos: preço, ciclo, benefícios e tipo (assinatura de empresa ou curso).
ALTER TABLE planos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'assinatura';
ALTER TABLE planos ADD COLUMN IF NOT EXISTS preco_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE planos ADD COLUMN IF NOT EXISTS ciclo TEXT NOT NULL DEFAULT 'mensal';
ALTER TABLE planos ADD COLUMN IF NOT EXISTS beneficios JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE planos ADD COLUMN IF NOT EXISTS turma_nome TEXT;
ALTER TABLE planos ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 100;
ALTER TABLE planos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_tipo_check') THEN
    ALTER TABLE planos ADD CONSTRAINT planos_tipo_check CHECK (tipo IN ('assinatura', 'curso'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_ciclo_check') THEN
    ALTER TABLE planos ADD CONSTRAINT planos_ciclo_check CHECK (ciclo IN ('mensal', 'anual', 'unico'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_preco_check') THEN
    ALTER TABLE planos ADD CONSTRAINT planos_preco_check CHECK (preco_centavos >= 0);
  END IF;
END $$;

-- Planos iniciais: INATIVOS e com preço de referência. A equipe ajusta em Administração → Planos.
INSERT INTO planos (slug, nome, descricao, limites, tipo, preco_centavos, ciclo, beneficios,
                    turma_nome, ordem, ativo)
VALUES
  ('curso-licite-comigo', 'Curso Licite Comigo',
   'Aprenda a vender para o governo, com trilhas, prática em edital real e mentoria.',
   '{}'::jsonb, 'curso', 49700, 'unico',
   '["Trilhas de aulas e quizzes","Prática com editais reais","Plano de 30 dias","Devolutivas da mentora","Certificado","Acesso ao Radar de licitações"]'::jsonb,
   'Curso Licite Comigo', 10, false),
  ('empresa-essencial', 'Essencial',
   'Radar com até 1 nicho, alertas por e-mail e pipeline de oportunidades.',
   '{"buscas_salvas": 5}'::jsonb, 'assinatura', 9700, 'mensal',
   '["1 nicho no Radar","Até 5 buscas salvas com alerta","Pipeline de oportunidades","Agenda de prazos","Documentos com validade"]'::jsonb,
   NULL, 20, false),
  ('empresa-profissional', 'Profissional',
   'Radar com até 3 nichos, mais buscas salvas e a Ana para apoio na análise.',
   '{"buscas_salvas": 30}'::jsonb, 'assinatura', 19700, 'mensal',
   '["Até 3 nichos no Radar","Até 30 buscas salvas com alerta","Pipeline e agenda completos","Ana para apoio na leitura do edital","Pesquisa de preços de referência"]'::jsonb,
   NULL, 30, false)
ON CONFLICT (slug) DO NOTHING;

-- Edição de planos: leitura aberta, escrita só da equipe (o banco confere de novo).
ALTER TABLE planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planos_leitura ON planos;
CREATE POLICY planos_leitura ON planos FOR SELECT USING (true);
DROP POLICY IF EXISTS planos_escrita_equipe ON planos;
CREATE POLICY planos_escrita_equipe ON planos FOR ALL
  USING (app_is_platform_session()) WITH CHECK (app_is_platform_session());
GRANT SELECT, INSERT, UPDATE ON planos TO licite_core;

-- Assinatura é da conta da empresa (tenant). A empresa cadastrada (CNPJ) pode ainda não existir
-- quando a assinatura é contratada, então `empresa_id` passa a ser opcional.
ALTER TABLE assinaturas ALTER COLUMN empresa_id DROP NOT NULL;
DROP POLICY IF EXISTS assinaturas_tenant_isolation ON assinaturas;
CREATE POLICY assinaturas_tenant_isolation ON assinaturas
  USING (tenant_id = app_tenant_id() AND (empresa_id IS NULL OR empresa_acessivel(empresa_id)))
  WITH CHECK (tenant_id = app_tenant_id() AND (empresa_id IS NULL OR empresa_acessivel(empresa_id)));

-- 2. Cobranças: uma por compra do curso e uma por assinatura de empresa.
CREATE TABLE IF NOT EXISTS cobrancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('curso', 'assinatura')),
  plano_id UUID NOT NULL REFERENCES planos(id),
  empresa_tenant_id UUID REFERENCES tenants(id),
  empresa_id UUID,
  usuario_id UUID,
  comprador_nome TEXT NOT NULL CHECK (length(trim(comprador_nome)) > 0),
  comprador_email TEXT NOT NULL CHECK (position('@' in comprador_email) > 1),
  documento_final TEXT,
  claim_hash TEXT UNIQUE,
  asaas_customer_id TEXT,
  asaas_subscription_id TEXT,
  asaas_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'paga', 'vencida', 'reembolsada', 'cancelada')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  link_pagamento TEXT,
  pago_em TIMESTAMPTZ,
  liberado_em TIMESTAMPTZ,
  resultado_liberacao TEXT,
  ultimo_evento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cobrancas_status_idx ON cobrancas (status, created_at DESC);
CREATE INDEX IF NOT EXISTS cobrancas_empresa_idx ON cobrancas (empresa_tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cobrancas_asaas_payment_uidx
  ON cobrancas (asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cobrancas_asaas_subscription_uidx
  ON cobrancas (asaas_subscription_id) WHERE asaas_subscription_id IS NOT NULL;

-- 3. Pagamentos recebidos (um por parcela/mensalidade): base da receita no painel.
CREATE TABLE IF NOT EXISTS cobranca_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id UUID NOT NULL REFERENCES cobrancas(id) ON DELETE CASCADE,
  asaas_payment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  vencimento DATE,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cobranca_pagamentos_pago_idx ON cobranca_pagamentos (pago_em DESC);
CREATE INDEX IF NOT EXISTS cobranca_pagamentos_cobranca_idx ON cobranca_pagamentos (cobranca_id);

-- 4. Eventos do webhook já processados (idempotência). Sem dado pessoal.
CREATE TABLE IF NOT EXISTS cobranca_eventos (
  chave TEXT PRIMARY KEY,
  evento TEXT NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cobrancas OWNER TO licite_owner;
ALTER TABLE cobranca_pagamentos OWNER TO licite_owner;
ALTER TABLE cobranca_eventos OWNER TO licite_owner;

ALTER TABLE cobrancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobrancas FORCE ROW LEVEL SECURITY;
ALTER TABLE cobranca_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobranca_pagamentos FORCE ROW LEVEL SECURITY;

-- Quem enxerga: a equipe da plataforma; a própria empresa (suas cobranças); e o fluxo de
-- cobrança do servidor (checkout público e webhook).
DROP POLICY IF EXISTS cobrancas_acesso ON cobrancas;
CREATE POLICY cobrancas_acesso ON cobrancas
  USING (
    current_setting('app.billing_flow', true) = 'true'
    OR app_is_platform_session()
    OR (empresa_tenant_id IS NOT NULL AND empresa_tenant_id = app_tenant_id() AND app_role() = 'admin')
  )
  WITH CHECK (
    current_setting('app.billing_flow', true) = 'true'
    OR app_is_platform_session()
  );

DROP POLICY IF EXISTS cobranca_pagamentos_acesso ON cobranca_pagamentos;
CREATE POLICY cobranca_pagamentos_acesso ON cobranca_pagamentos
  USING (
    current_setting('app.billing_flow', true) = 'true'
    OR app_is_platform_session()
    OR EXISTS (
      SELECT 1 FROM cobrancas c
       WHERE c.id = cobranca_pagamentos.cobranca_id
         AND c.empresa_tenant_id = app_tenant_id() AND app_role() = 'admin')
  )
  WITH CHECK (
    current_setting('app.billing_flow', true) = 'true'
    OR app_is_platform_session()
  );

GRANT SELECT, INSERT, UPDATE ON cobrancas, cobranca_pagamentos TO licite_core;
GRANT SELECT, INSERT ON cobranca_eventos TO licite_core;

-- 5. Liberar o curso depois do pagamento confirmado.
-- Cria o convite do aluno na conta da plataforma (ou matricula, se ele já tem conta de aluno).
-- O token do convite é gerado pelo servidor; aqui entra só o hash.
-- Retorna: 'convite', 'matriculado', 'ja_liberado' ou 'revisar' (e-mail já usado por outro papel).
CREATE OR REPLACE FUNCTION billing_liberar_curso(p_cobranca UUID, p_token_hash TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c cobrancas%ROWTYPE;
  pl planos%ROWTYPE;
  v_tenant UUID;
  v_turma UUID;
  v_mentor UUID;
  v_user UUID;
  v_papel TEXT;
  v_convite UUID;
  v_resultado TEXT;
  o_tenant TEXT := coalesce(current_setting('app.tenant_id', true), '');
  o_role TEXT := coalesce(current_setting('app.role', true), '');
  o_auth TEXT := coalesce(current_setting('app.auth_flow', true), '');
  o_bill TEXT := coalesce(current_setting('app.billing_flow', true), '');
BEGIN
  -- Como as tabelas têm RLS forçada, a função assume o contexto da conta da plataforma só
  -- durante a execução e devolve o contexto original no fim.
  PERFORM set_config('app.billing_flow', 'true', true);
  SELECT * INTO c FROM cobrancas WHERE id = p_cobranca FOR UPDATE;
  IF NOT FOUND OR c.tipo <> 'curso' THEN RAISE EXCEPTION 'cobranca_invalida'; END IF;
  IF c.status <> 'paga' THEN RAISE EXCEPTION 'cobranca_nao_paga'; END IF;
  IF c.liberado_em IS NOT NULL THEN
    PERFORM set_config('app.billing_flow', o_bill, true);
    RETURN 'ja_liberado';
  END IF;

  SELECT * INTO pl FROM planos WHERE id = c.plano_id;
  SELECT id INTO v_tenant FROM plataforma_tenants ORDER BY created_at, id LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'sem_conta_da_plataforma'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  PERFORM set_config('app.role', 'admin', true);
  PERFORM set_config('app.auth_flow', 'true', true);

  SELECT id INTO v_turma FROM turmas
   WHERE tenant_id = v_tenant AND nome = coalesce(pl.turma_nome, 'Curso Licite Comigo');
  IF v_turma IS NULL THEN
    INSERT INTO turmas (tenant_id, nome)
    VALUES (v_tenant, coalesce(pl.turma_nome, 'Curso Licite Comigo'))
    ON CONFLICT (tenant_id, nome) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_turma;
  END IF;
  SELECT mentor_id INTO v_mentor FROM turmas WHERE id = v_turma;

  SELECT id, papel::text INTO v_user, v_papel FROM usuarios
   WHERE tenant_id = v_tenant AND lower(email) = lower(c.comprador_email) LIMIT 1;

  IF v_user IS NOT NULL THEN
    IF v_papel = 'aluno' THEN
      INSERT INTO matriculas (tenant_id, turma_id, aluno_id)
      VALUES (v_tenant, v_turma, v_user) ON CONFLICT (turma_id, aluno_id) DO NOTHING;
      IF v_mentor IS NOT NULL THEN
        INSERT INTO mentor_mentorado (tenant_id, mentor_id, mentorado_id)
        VALUES (v_tenant, v_mentor, v_user) ON CONFLICT DO NOTHING;
      END IF;
      v_resultado := 'matriculado';
    ELSE
      v_resultado := 'revisar';
    END IF;
  ELSE
    UPDATE convites SET revogado_em = now()
     WHERE tenant_id = v_tenant AND lower(email) = lower(c.comprador_email)
       AND tipo = 'aluno' AND usado_em IS NULL AND revogado_em IS NULL;
    INSERT INTO convites (tenant_id, tipo, email, nome, turma_id, token_hash, expira_em)
    VALUES (v_tenant, 'aluno', lower(c.comprador_email), c.comprador_nome, v_turma,
            p_token_hash, now() + interval '7 days')
    RETURNING id INTO v_convite;
    v_resultado := 'convite';
  END IF;

  UPDATE cobrancas
     SET liberado_em = CASE WHEN v_resultado = 'revisar' THEN NULL ELSE now() END,
         resultado_liberacao = v_resultado, updated_at = now()
   WHERE id = c.id;
  PERFORM set_config('app.tenant_id', o_tenant, true);
  PERFORM set_config('app.role', o_role, true);
  PERFORM set_config('app.auth_flow', o_auth, true);
  PERFORM set_config('app.billing_flow', o_bill, true);
  RETURN v_resultado;
END;
$$;
ALTER FUNCTION billing_liberar_curso(UUID, TEXT) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION billing_liberar_curso(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_liberar_curso(UUID, TEXT) TO licite_core;

-- 6. Estado da assinatura da empresa (ativa, em atraso, cancelada), com os limites do plano.
CREATE OR REPLACE FUNCTION billing_definir_assinatura(p_cobranca UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c cobrancas%ROWTYPE;
  pl planos%ROWTYPE;
  v_id UUID;
  o_tenant TEXT := coalesce(current_setting('app.tenant_id', true), '');
  o_role TEXT := coalesce(current_setting('app.role', true), '');
  o_emp TEXT := coalesce(current_setting('app.empresa_id', true), '');
  o_bill TEXT := coalesce(current_setting('app.billing_flow', true), '');
BEGIN
  PERFORM set_config('app.billing_flow', 'true', true);
  IF p_status NOT IN ('ativa', 'past_due', 'cancelada', 'expirada') THEN
    RAISE EXCEPTION 'status_invalido';
  END IF;
  SELECT * INTO c FROM cobrancas WHERE id = p_cobranca;
  IF NOT FOUND OR c.tipo <> 'assinatura' OR c.empresa_tenant_id IS NULL THEN
    RAISE EXCEPTION 'cobranca_invalida';
  END IF;
  SELECT * INTO pl FROM planos WHERE id = c.plano_id;
  PERFORM set_config('app.tenant_id', c.empresa_tenant_id::text, true);
  PERFORM set_config('app.role', 'admin', true);
  PERFORM set_config('app.empresa_id', coalesce(c.empresa_id::text, ''), true);

  SELECT id INTO v_id FROM assinaturas
   WHERE tenant_id = c.empresa_tenant_id
   ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO assinaturas (tenant_id, empresa_id, plano_id, status, limites_snapshot, fim_em)
    VALUES (c.empresa_tenant_id, c.empresa_id, c.plano_id, p_status, pl.limites,
            CASE WHEN p_status IN ('cancelada', 'expirada') THEN now() ELSE NULL END);
  ELSE
    UPDATE assinaturas
       SET plano_id = c.plano_id, status = p_status, limites_snapshot = pl.limites,
           fim_em = CASE WHEN p_status IN ('cancelada', 'expirada') THEN now() ELSE NULL END,
           updated_at = now()
     WHERE id = v_id;
  END IF;
  PERFORM set_config('app.tenant_id', o_tenant, true);
  PERFORM set_config('app.role', o_role, true);
  PERFORM set_config('app.empresa_id', o_emp, true);
  PERFORM set_config('app.billing_flow', o_bill, true);
END;
$$;
ALTER FUNCTION billing_definir_assinatura(UUID, TEXT) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION billing_definir_assinatura(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_definir_assinatura(UUID, TEXT) TO licite_core;
