-- 0032 — Limpeza automática de registros técnicos
--
-- A coleta do PNCP e o motor de alertas gravam uma linha por rodada. Com rodadas de poucos minutos,
-- isso vira lixo. Esta função apaga o que já não serve e o core-api a chama sozinho de tempos em tempos:
--   * rodadas da coleta e do motor de alertas com mais de p_dias_registros dias (guarda sempre as 20
--     mais recentes e a última coleta concluída, que alimenta "dados atualizados há X min");
--   * rodadas que ficaram "rodando" há mais de 1 dia (processo interrompido);
--   * histórico de alterações de edital e notificações já lidas com mais de p_dias_historico dias.
-- Não mexe em editais, preços, auditoria, cobrança nem no registro de entregas dos alertas.

-- A função roda como licite_owner; estas políticas valem só para ele (não é usado para login).
DROP POLICY IF EXISTS edital_eventos_limpeza_ler ON edital_eventos;
CREATE POLICY edital_eventos_limpeza_ler ON edital_eventos FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS edital_eventos_limpeza ON edital_eventos;
CREATE POLICY edital_eventos_limpeza ON edital_eventos FOR DELETE TO licite_owner USING (true);
DROP POLICY IF EXISTS notificacoes_limpeza_ler ON notificacoes;
CREATE POLICY notificacoes_limpeza_ler ON notificacoes FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS notificacoes_limpeza ON notificacoes;
CREATE POLICY notificacoes_limpeza ON notificacoes FOR DELETE TO licite_owner USING (true);

CREATE OR REPLACE FUNCTION limpar_registros_tecnicos(
  p_dias_registros INTEGER DEFAULT 7,
  p_dias_historico INTEGER DEFAULT 90
)
RETURNS TABLE (coleta INTEGER, alertas INTEGER, eventos INTEGER, notificacoes INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_registros INTERVAL := make_interval(days => GREATEST(1, COALESCE(p_dias_registros, 7)));
  v_historico INTERVAL := make_interval(days => GREATEST(7, COALESCE(p_dias_historico, 90)));
  v_coleta INTEGER;
  v_alertas INTEGER;
  v_eventos INTEGER;
  v_notificacoes INTEGER;
BEGIN
  DELETE FROM coleta_pncp_execucoes c
   WHERE (c.iniciado_em < now() - v_registros
          OR (c.status = 'rodando' AND c.iniciado_em < now() - interval '1 day'))
     AND c.id NOT IN (SELECT r.id FROM coleta_pncp_execucoes r ORDER BY r.iniciado_em DESC LIMIT 20)
     AND c.id IS DISTINCT FROM (
       SELECT u.id FROM coleta_pncp_execucoes u
        WHERE u.status IN ('ok', 'parcial') AND u.finalizado_em IS NOT NULL
        ORDER BY u.finalizado_em DESC LIMIT 1);
  GET DIAGNOSTICS v_coleta = ROW_COUNT;

  DELETE FROM alertas_motor_execucoes a
   WHERE (a.iniciado_em < now() - v_registros
          OR (a.finalizado_em IS NULL AND a.iniciado_em < now() - interval '1 day'))
     AND a.id NOT IN (SELECT r.id FROM alertas_motor_execucoes r ORDER BY r.iniciado_em DESC LIMIT 20);
  GET DIAGNOSTICS v_alertas = ROW_COUNT;

  DELETE FROM edital_eventos e WHERE e.created_at < now() - v_historico;
  GET DIAGNOSTICS v_eventos = ROW_COUNT;

  DELETE FROM notificacoes n WHERE n.lida_em IS NOT NULL AND n.lida_em < now() - v_historico;
  GET DIAGNOSTICS v_notificacoes = ROW_COUNT;

  RETURN QUERY SELECT v_coleta, v_alertas, v_eventos, v_notificacoes;
END $$;

ALTER FUNCTION limpar_registros_tecnicos(INTEGER, INTEGER) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION limpar_registros_tecnicos(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION limpar_registros_tecnicos(INTEGER, INTEGER) TO licite_core;
