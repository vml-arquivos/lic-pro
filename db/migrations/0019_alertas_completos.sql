-- Alertas completos: frequência, canais, destinatários, tipos de aviso, preferências e motor.
-- Só Empresa e Administração criam alertas; a entrega é registrada em `alerta_entregas`
-- (uma linha por regra, edital, tipo, destinatário e canal) e o aviso resumido vai ao sino
-- (`notificacoes`).

ALTER TABLE alertas_regras
  ADD COLUMN IF NOT EXISTS frequencia TEXT NOT NULL DEFAULT 'diario',
  ADD COLUMN IF NOT EXISTS horario_diario SMALLINT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS dia_semana SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tipos TEXT[] NOT NULL DEFAULT ARRAY['novos']::text[],
  ADD COLUMN IF NOT EXISTS destinatarios UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE alertas_regras DROP CONSTRAINT IF EXISTS alertas_regras_frequencia_check;
ALTER TABLE alertas_regras ADD CONSTRAINT alertas_regras_frequencia_check
  CHECK (frequencia IN ('imediata', 'diario', 'semanal'));
ALTER TABLE alertas_regras DROP CONSTRAINT IF EXISTS alertas_regras_horario_check;
ALTER TABLE alertas_regras ADD CONSTRAINT alertas_regras_horario_check
  CHECK (horario_diario IN (7, 12, 18));
ALTER TABLE alertas_regras DROP CONSTRAINT IF EXISTS alertas_regras_dia_check;
ALTER TABLE alertas_regras ADD CONSTRAINT alertas_regras_dia_check
  CHECK (dia_semana BETWEEN 1 AND 7);
ALTER TABLE alertas_regras DROP CONSTRAINT IF EXISTS alertas_regras_tipos_check;
ALTER TABLE alertas_regras ADD CONSTRAINT alertas_regras_tipos_check
  CHECK (tipos <@ ARRAY['novos', 'alteracao', 'prazo']::text[]);
ALTER TABLE alertas_regras DROP CONSTRAINT IF EXISTS alertas_regras_canais_check;
ALTER TABLE alertas_regras ADD CONSTRAINT alertas_regras_canais_check
  CHECK (jsonb_typeof(canais) = 'array');

-- Regras antigas sem canal passam a avisar no sino.
UPDATE alertas_regras SET canais = '["in_app"]'::jsonb WHERE canais = '[]'::jsonb;

ALTER TABLE alerta_entregas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS agendada_para TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tentativas SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE alerta_entregas DROP CONSTRAINT IF EXISTS alerta_entregas_tipo_check;
ALTER TABLE alerta_entregas ADD CONSTRAINT alerta_entregas_tipo_check
  CHECK (tipo IN ('novo', 'alteracao', 'prazo'));

CREATE INDEX IF NOT EXISTS alerta_entregas_agendadas_idx
  ON alerta_entregas (tenant_id, agendada_para) WHERE status = 'agendada';
CREATE INDEX IF NOT EXISTS alerta_entregas_caixa_idx
  ON alerta_entregas (tenant_id, usuario_id, canal, status, created_at DESC);
CREATE INDEX IF NOT EXISTS alerta_entregas_regra_edital_idx
  ON alerta_entregas (alerta_regra_id, edital_id, tipo);

-- Preferências de quem recebe: pausar tudo e escolher canais. Cada pessoa cuida das suas.
CREATE TABLE IF NOT EXISTS preferencias_alertas (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  pausar_tudo BOOLEAN NOT NULL DEFAULT false,
  email_ativo BOOLEAN NOT NULL DEFAULT true,
  em_app_ativo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE preferencias_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferencias_alertas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS preferencias_alertas_do_usuario ON preferencias_alertas;
-- Administração da conta lê as preferências para respeitá-las ao enviar; só a própria pessoa grava.
CREATE POLICY preferencias_alertas_do_usuario ON preferencias_alertas
  USING (tenant_id = app_tenant_id() AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador')))
  WITH CHECK (tenant_id = app_tenant_id() AND usuario_id = app_user_id());
ALTER TABLE preferencias_alertas OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE ON preferencias_alertas TO licite_core;

-- Registro de cada rodada do motor (sem dado de cliente, por isso sem tenant).
CREATE TABLE IF NOT EXISTS alertas_motor_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  regras INTEGER NOT NULL DEFAULT 0,
  criadas INTEGER NOT NULL DEFAULT 0,
  liberadas INTEGER NOT NULL DEFAULT 0,
  emails INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  detalhe TEXT
);
CREATE INDEX IF NOT EXISTS alertas_motor_execucoes_idx ON alertas_motor_execucoes (iniciado_em DESC);
ALTER TABLE alertas_motor_execucoes OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE ON alertas_motor_execucoes TO licite_core;

-- Lista as contas e regras que o motor precisa olhar, sem ler dados de cliente além do necessário.
-- Roda como licite_owner; as políticas abaixo valem só para ele (que não é usado para login).
DROP POLICY IF EXISTS alertas_regras_motor ON alertas_regras;
CREATE POLICY alertas_regras_motor ON alertas_regras FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS buscas_salvas_motor ON buscas_salvas;
CREATE POLICY buscas_salvas_motor ON buscas_salvas FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS alerta_entregas_motor ON alerta_entregas;
CREATE POLICY alerta_entregas_motor ON alerta_entregas FOR SELECT TO licite_owner USING (true);

CREATE OR REPLACE FUNCTION alertas_motor_alvos()
RETURNS TABLE (tenant_id UUID, usuario_id UUID, empresa_id UUID, regra_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ar.tenant_id, ar.usuario_id, ar.empresa_id, ar.id
    FROM alertas_regras ar
    JOIN buscas_salvas bs ON bs.id = ar.busca_id AND bs.tenant_id = ar.tenant_id
   WHERE ar.ativa AND bs.ativa AND ar.usuario_id IS NOT NULL
  UNION ALL
  SELECT DISTINCT ae.tenant_id, ae.usuario_id, NULL::uuid, NULL::uuid
    FROM alerta_entregas ae
   WHERE ae.status = 'agendada' AND ae.usuario_id IS NOT NULL AND ae.agendada_para <= now()
$$;
ALTER FUNCTION alertas_motor_alvos() OWNER TO licite_owner;
REVOKE ALL ON FUNCTION alertas_motor_alvos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION alertas_motor_alvos() TO licite_core;

-- Notificações (sino): cada pessoa lê só as suas, em qualquer área (empresa, aluno, mentor).
-- Quem grava (motor de alertas, devolutiva do mentor) pode criar para outra pessoa da mesma conta.
DROP POLICY IF EXISTS notificacoes_tenant_isolation ON notificacoes;
CREATE POLICY notificacoes_tenant_isolation ON notificacoes
  USING (tenant_id = app_tenant_id() AND usuario_id = app_user_id())
  WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE ON notificacoes TO licite_core;
