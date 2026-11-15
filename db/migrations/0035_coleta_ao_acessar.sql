-- 0035 — Coleta disparada ao acessar o sistema
--
-- Além das rodadas agendadas e manuais, a coleta do PNCP agora também pode começar quando alguém
-- entra no sistema e os dados estão velhos (uma rodada rápida, no máximo uma a cada poucos
-- minutos). Só amplia os valores aceitos em `origem`; as linhas existentes não mudam.
ALTER TABLE coleta_pncp_execucoes DROP CONSTRAINT IF EXISTS coleta_pncp_execucoes_origem_check;
ALTER TABLE coleta_pncp_execucoes
  ADD CONSTRAINT coleta_pncp_execucoes_origem_check CHECK (origem IN ('agendada', 'manual', 'acesso'));
