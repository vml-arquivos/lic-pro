-- Fase E: Empresa completa (uma conta = uma empresa, sem equipe).
--
-- Pipeline com decisão e histórico, documentos da empresa com validade informada à mão,
-- lembretes de prazo, tarefa e documento vencendo. Nenhuma consulta automática de certidão:
-- a validade é a que a pessoa digita.

-- Pipeline: etapa "decidida" com decisão e motivo.
ALTER TABLE oportunidades_salvas
  ADD COLUMN IF NOT EXISTS decisao TEXT,
  ADD COLUMN IF NOT EXISTS motivo_decisao TEXT,
  ADD COLUMN IF NOT EXISTS decidida_em TIMESTAMPTZ;
ALTER TABLE oportunidades_salvas DROP CONSTRAINT IF EXISTS oportunidades_salvas_status_check;
ALTER TABLE oportunidades_salvas ADD CONSTRAINT oportunidades_salvas_status_check
  CHECK (status IN ('salva', 'triagem', 'em_analise', 'em_habilitacao', 'decidida', 'proposta', 'arquivada', 'ganha', 'perdida'));
ALTER TABLE oportunidades_salvas DROP CONSTRAINT IF EXISTS oportunidades_salvas_decisao_check;
ALTER TABLE oportunidades_salvas ADD CONSTRAINT oportunidades_salvas_decisao_check
  CHECK (decisao IS NULL OR decisao IN ('participar', 'nao_participar'));

CREATE TABLE IF NOT EXISTS oportunidade_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  oportunidade_id UUID NOT NULL REFERENCES oportunidades_salvas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('criada', 'etapa', 'decisao', 'nota')),
  de_status TEXT,
  para_status TEXT,
  decisao TEXT,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oportunidade_historico_idx ON oportunidade_historico (oportunidade_id, created_at DESC);

-- Documentos da empresa. Só metadados e a validade informada; o arquivo fica com a empresa.
CREATE TABLE IF NOT EXISTS empresa_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'contrato_social', 'certidao_federal', 'certidao_fgts', 'certidao_trabalhista',
    'certidao_estadual', 'certidao_municipal', 'certidao_falencia', 'balanco',
    'atestado_capacidade', 'declaracao', 'outro')),
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 200),
  numero TEXT,
  emitido_em DATE,
  valido_ate DATE,
  link_url TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresa_documentos_validade_idx ON empresa_documentos (tenant_id, empresa_id, valido_ate);

-- Prazos vindos do edital não se repetem para a mesma oportunidade.
CREATE UNIQUE INDEX IF NOT EXISTS prazos_agenda_edital_unico
  ON prazos_agenda (oportunidade_id, tipo) WHERE fonte = 'edital';

-- Lembretes já enviados (evita avisar duas vezes a mesma coisa).
CREATE TABLE IF NOT EXISTS lembretes_enviados (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, chave)
);

DO $$
DECLARE
  nome TEXT;
BEGIN
  FOREACH nome IN ARRAY ARRAY['oportunidade_historico', 'empresa_documentos', 'lembretes_enviados']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nome);
    EXECUTE format('ALTER TABLE %I OWNER TO licite_owner', nome);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO licite_core', nome);
  END LOOP;
  FOREACH nome IN ARRAY ARRAY['oportunidade_historico', 'empresa_documentos', 'lembretes_enviados']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', nome || '_platform_read', nome);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app_is_platform_session())', nome || '_platform_read', nome);
  END LOOP;
END $$;

DROP POLICY IF EXISTS oportunidade_historico_acesso ON oportunidade_historico;
CREATE POLICY oportunidade_historico_acesso ON oportunidade_historico
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
DROP POLICY IF EXISTS empresa_documentos_acesso ON empresa_documentos;
CREATE POLICY empresa_documentos_acesso ON empresa_documentos
  USING (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id))
  WITH CHECK (tenant_id = app_tenant_id() AND empresa_acessivel(empresa_id));
DROP POLICY IF EXISTS lembretes_enviados_proprio ON lembretes_enviados;
CREATE POLICY lembretes_enviados_proprio ON lembretes_enviados
  USING (tenant_id = app_tenant_id() AND usuario_id = app_user_id())
  WITH CHECK (tenant_id = app_tenant_id() AND usuario_id = app_user_id());

-- O motor de lembretes precisa olhar todas as contas. Mesma técnica do motor de alertas:
-- função do dono (que não faz login) com política só para ele.
DROP POLICY IF EXISTS prazos_agenda_motor ON prazos_agenda;
CREATE POLICY prazos_agenda_motor ON prazos_agenda FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS tarefas_motor ON tarefas;
CREATE POLICY tarefas_motor ON tarefas FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS empresa_documentos_motor ON empresa_documentos;
CREATE POLICY empresa_documentos_motor ON empresa_documentos FOR SELECT TO licite_owner USING (true);
DROP POLICY IF EXISTS empresa_usuarios_motor ON empresa_usuarios;
CREATE POLICY empresa_usuarios_motor ON empresa_usuarios FOR SELECT TO licite_owner USING (true);

-- Quem deve ser lembrado de quê, agora. Só a dona da conta (ou o responsável da tarefa).
CREATE OR REPLACE FUNCTION lembretes_alvos(agora TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (tenant_id UUID, usuario_id UUID, tipo TEXT, titulo TEXT, vence_em TIMESTAMPTZ, chave TEXT, link TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH donas AS (
    SELECT DISTINCT ON (eu.empresa_id) eu.empresa_id, eu.usuario_id
      FROM empresa_usuarios eu
     WHERE eu.ativo
     ORDER BY eu.empresa_id, (eu.papel = 'proprietario') DESC, eu.created_at
  )
  SELECT p.tenant_id, d.usuario_id, 'prazo'::text, p.titulo, p.vence_em,
         'prazo:' || p.id || ':' || CASE WHEN p.vence_em <= agora + interval '24 hours' THEN '1d' ELSE '3d' END,
         CASE WHEN p.oportunidade_id IS NULL THEN '/agenda' ELSE '/oportunidades/' || p.oportunidade_id END
    FROM prazos_agenda p JOIN donas d ON d.empresa_id = p.empresa_id
   WHERE p.status = 'aberto' AND p.vence_em >= agora AND p.vence_em <= agora + interval '72 hours'
  UNION ALL
  SELECT t.tenant_id, coalesce(t.responsavel_id, d.usuario_id), 'tarefa'::text, t.titulo, t.vence_em,
         'tarefa:' || t.id || ':1d',
         CASE WHEN t.oportunidade_id IS NULL THEN '/agenda' ELSE '/oportunidades/' || t.oportunidade_id END
    FROM tarefas t JOIN donas d ON d.empresa_id = t.empresa_id
   WHERE t.status IN ('aberta', 'em_andamento') AND t.vence_em IS NOT NULL
     AND t.vence_em >= agora - interval '1 day' AND t.vence_em <= agora + interval '24 hours'
  UNION ALL
  SELECT x.tenant_id, d.usuario_id, 'documento'::text, x.nome, x.valido_ate::timestamptz,
         'doc:' || x.id || ':' || x.valido_ate || ':' ||
           CASE WHEN x.valido_ate < (agora AT TIME ZONE 'America/Sao_Paulo')::date THEN 'vencido'
                WHEN x.valido_ate <= (agora AT TIME ZONE 'America/Sao_Paulo')::date + 7 THEN '7d'
                ELSE '30d' END,
         '/documentos'
    FROM empresa_documentos x JOIN donas d ON d.empresa_id = x.empresa_id
   WHERE x.valido_ate IS NOT NULL
     AND x.valido_ate <= (agora AT TIME ZONE 'America/Sao_Paulo')::date + 30
     AND x.valido_ate >= (agora AT TIME ZONE 'America/Sao_Paulo')::date - 30
$$;
ALTER FUNCTION lembretes_alvos(TIMESTAMPTZ) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION lembretes_alvos(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lembretes_alvos(TIMESTAMPTZ) TO licite_core;

-- A empresa pode remover oportunidade, checklist, item, prazo e tarefa da própria conta.
GRANT DELETE ON oportunidades_salvas, checklists, checklist_itens, prazos_agenda, tarefas TO licite_core;

-- Itens do checklist ficam na ordem do modelo (e os novos entram no fim).
ALTER TABLE checklist_itens ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;
