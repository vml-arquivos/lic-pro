-- 0025: teste grátis, cupons de desconto e gestão de assinantes.
-- Idempotente: pode rodar de novo sem efeito colateral.

-- 1. Planos: dias de teste grátis (0 = sem teste).
ALTER TABLE planos ADD COLUMN IF NOT EXISTS trial_dias INTEGER NOT NULL DEFAULT 0
  CHECK (trial_dias BETWEEN 0 AND 60);

-- Os planos de exemplo ainda desativados passam a descrever só o que o sistema entrega hoje
-- e a oferecer 7 dias de teste. Plano que a equipe já ativou ou editou não é tocado.
UPDATE planos SET
  descricao = 'Radar de editais, buscas salvas com alerta no painel, pipeline e agenda de prazos.',
  limites = '{"buscas_salvas": 10}'::jsonb,
  preco_centavos = 7900,
  trial_dias = 7,
  beneficios = '["Radar com todos os editais do PNCP","Até 10 buscas salvas com alerta no painel","Pipeline de oportunidades","Agenda de prazos","Documentos de habilitação com validade","Preços de referência (Compras.gov.br)"]'::jsonb,
  updated_at = now()
WHERE slug = 'empresa-essencial' AND ativo = false AND preco_centavos = 9700;

UPDATE planos SET
  descricao = 'Tudo do Essencial, com mais buscas salvas e a Ana para apoio na leitura do edital.',
  limites = '{"buscas_salvas": 40}'::jsonb,
  preco_centavos = 14900,
  trial_dias = 7,
  beneficios = '["Tudo do plano Essencial","Até 40 buscas salvas com alerta no painel","Ana para apoio na leitura do edital","Itens e documentos do edital direto do PNCP","Acesso à Academia (conteúdo do curso)"]'::jsonb,
  updated_at = now()
WHERE slug = 'empresa-profissional' AND ativo = false AND preco_centavos = 19700;

-- 2. Cupons.
CREATE TABLE IF NOT EXISTS cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9_-]{3,32}$'),
  descricao TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('percentual', 'fixo')),
  valor INTEGER NOT NULL CHECK (valor > 0),
  plano_slugs TEXT[],
  max_usos INTEGER CHECK (max_usos IS NULL OR max_usos > 0),
  valido_ate TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tipo <> 'percentual' OR valor <= 95)
);
ALTER TABLE cupons OWNER TO licite_owner;
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupons FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cupons_billing_read ON cupons;
CREATE POLICY cupons_billing_read ON cupons FOR SELECT
  USING (coalesce(current_setting('app.billing_flow', true), '') = 'true' OR app_is_platform_session());
DROP POLICY IF EXISTS cupons_platform_write ON cupons;
CREATE POLICY cupons_platform_write ON cupons FOR ALL
  USING (app_is_platform_session()) WITH CHECK (app_is_platform_session());
GRANT SELECT, INSERT, UPDATE ON cupons TO licite_core;

-- 3. Cobranças registram o cupom e o desconto aplicado.
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS cupom_codigo TEXT;
ALTER TABLE cobrancas ADD COLUMN IF NOT EXISTS desconto_centavos INTEGER NOT NULL DEFAULT 0
  CHECK (desconto_centavos >= 0);
CREATE INDEX IF NOT EXISTS cobrancas_cupom_idx ON cobrancas (cupom_codigo) WHERE cupom_codigo IS NOT NULL;

-- 4. A equipe da plataforma enxerga as assinaturas de todos os clientes (só leitura).
DROP POLICY IF EXISTS assinaturas_platform_read ON assinaturas;
CREATE POLICY assinaturas_platform_read ON assinaturas FOR SELECT
  USING (app_is_platform_session());

-- 5. Empresa inicia o teste grátis (uma vez por conta). Roda com o contexto da própria conta.
CREATE OR REPLACE FUNCTION billing_iniciar_teste(p_plano TEXT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pl planos%ROWTYPE;
  v_tenant UUID := app_tenant_id();
BEGIN
  IF v_tenant IS NULL OR coalesce(current_setting('app.role', true), '') <> 'admin' THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  SELECT * INTO pl FROM planos WHERE slug = p_plano AND tipo = 'assinatura' AND ativo AND trial_dias > 0;
  IF NOT FOUND THEN
    RETURN 'plano_sem_teste';
  END IF;
  IF EXISTS (SELECT 1 FROM assinaturas WHERE tenant_id = v_tenant) THEN
    RETURN 'ja_teve_assinatura';
  END IF;
  INSERT INTO assinaturas (tenant_id, empresa_id, plano_id, status, limites_snapshot, fim_em)
  VALUES (v_tenant, NULL, pl.id, 'trial', pl.limites, now() + make_interval(days => pl.trial_dias));
  RETURN 'ok';
END;
$$;
ALTER FUNCTION billing_iniciar_teste(TEXT) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION billing_iniciar_teste(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_iniciar_teste(TEXT) TO licite_core;

-- 6. Equipe ajusta uma assinatura: estender o teste, cancelar ou reativar de cortesia.
CREATE OR REPLACE FUNCTION admin_ajustar_assinatura(p_assinatura UUID, p_acao TEXT, p_dias INTEGER)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a assinaturas%ROWTYPE;
  o_tenant TEXT := coalesce(current_setting('app.tenant_id', true), '');
  o_role TEXT := coalesce(current_setting('app.role', true), '');
  o_emp TEXT := coalesce(current_setting('app.empresa_id', true), '');
  v_result TEXT := 'ok';
BEGIN
  IF NOT app_is_platform_session() THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  IF p_acao NOT IN ('estender', 'cancelar', 'reativar') THEN
    RAISE EXCEPTION 'acao_invalida';
  END IF;
  SELECT * INTO a FROM assinaturas WHERE id = p_assinatura;
  IF NOT FOUND THEN
    RETURN 'nao_encontrada';
  END IF;
  PERFORM set_config('app.tenant_id', a.tenant_id::text, true);
  PERFORM set_config('app.role', 'admin', true);
  PERFORM set_config('app.empresa_id', coalesce(a.empresa_id::text, ''), true);
  IF p_acao = 'estender' THEN
    IF p_dias IS NULL OR p_dias < 1 OR p_dias > 365 THEN
      v_result := 'dias_invalidos';
    ELSIF a.status NOT IN ('trial', 'expirada') THEN
      v_result := 'so_teste';
    ELSE
      UPDATE assinaturas
         SET status = 'trial', fim_em = greatest(coalesce(fim_em, now()), now()) + make_interval(days => p_dias),
             updated_at = now()
       WHERE id = a.id;
    END IF;
  ELSIF p_acao = 'cancelar' THEN
    UPDATE assinaturas SET status = 'cancelada', fim_em = now(), updated_at = now() WHERE id = a.id;
  ELSE
    UPDATE assinaturas SET status = 'ativa', fim_em = NULL, updated_at = now() WHERE id = a.id;
  END IF;
  PERFORM set_config('app.tenant_id', o_tenant, true);
  PERFORM set_config('app.role', o_role, true);
  PERFORM set_config('app.empresa_id', o_emp, true);
  RETURN v_result;
END;
$$;
ALTER FUNCTION admin_ajustar_assinatura(UUID, TEXT, INTEGER) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION admin_ajustar_assinatura(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_ajustar_assinatura(UUID, TEXT, INTEGER) TO licite_core;
