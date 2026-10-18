-- Expansão de dados/ingestão: campos canônicos, radar salvo, alertas e controle retomável.
-- A migration é segura para reaplicação: colunas, índices e políticas usam IF NOT EXISTS
-- ou blocos condicionais explícitos.

ALTER TABLE editais
  ADD COLUMN IF NOT EXISTS sistema_origem TEXT,
  ADD COLUMN IF NOT EXISTS codigo_modalidade INTEGER,
  ADD COLUMN IF NOT EXISTS codigo_modo_disputa INTEGER,
  ADD COLUMN IF NOT EXISTS codigo_instrumento TEXT,
  ADD COLUMN IF NOT EXISTS instrumento TEXT,
  ADD COLUMN IF NOT EXISTS modo_disputa TEXT,
  ADD COLUMN IF NOT EXISTS situacao TEXT,
  ADD COLUMN IF NOT EXISTS esfera TEXT,
  ADD COLUMN IF NOT EXISTS poder TEXT,
  ADD COLUMN IF NOT EXISTS municipio_ibge TEXT,
  ADD COLUMN IF NOT EXISTS municipio_nome TEXT,
  ADD COLUMN IF NOT EXISTS srp BOOLEAN,
  ADD COLUMN IF NOT EXISTS data_atualizacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_abertura_proposta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_encerramento_proposta TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_abertura_propostas TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_encerramento_propostas TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_homologado NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS estado_completude TEXT;

CREATE INDEX IF NOT EXISTS editais_canonicos_filtro_idx
  ON editais (tenant_id, sistema_origem, codigo_modalidade, situacao, uf, municipio_ibge);
CREATE INDEX IF NOT EXISTS editais_propostas_idx
  ON editais (tenant_id, data_abertura_proposta, data_encerramento_proposta);

ALTER TABLE ingest_checkpoints
  ADD COLUMN IF NOT EXISTS query_hash TEXT,
  ADD COLUMN IF NOT EXISTS endpoint TEXT NOT NULL DEFAULT 'publicacao',
  ADD COLUMN IF NOT EXISTS filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS watermark TEXT;

UPDATE ingest_checkpoints
   SET query_hash = 'legacy'
 WHERE query_hash IS NULL;

ALTER TABLE ingest_checkpoints
  ALTER COLUMN query_hash SET DEFAULT 'legacy',
  ALTER COLUMN query_hash SET NOT NULL;

-- A chave antiga não distinguia filtros diferentes na mesma janela. Remova-a
-- por definição de colunas, sem depender do nome truncado pelo PostgreSQL.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'ingest_checkpoints'::regclass
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) LIKE
           'UNIQUE (tenant_id, fonte, modalidade, janela_inicio, janela_fim)%'
  LOOP
    EXECUTE format('ALTER TABLE ingest_checkpoints DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ingest_checkpoints_query_identity_idx
  ON ingest_checkpoints (tenant_id, fonte, modalidade, janela_inicio, janela_fim, query_hash);
CREATE INDEX IF NOT EXISTS ingest_checkpoints_lease_idx
  ON ingest_checkpoints (status, lease_until, heartbeat_at);

CREATE TABLE IF NOT EXISTS buscas_salvas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, usuario_id, nome)
);

CREATE TABLE IF NOT EXISTS alertas_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  busca_id UUID REFERENCES buscas_salvas(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  regra JSONB NOT NULL DEFAULT '{}'::jsonb,
  canais JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerta_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  alerta_regra_id UUID NOT NULL REFERENCES alertas_regras(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  edital_id UUID REFERENCES editais(id) ON DELETE CASCADE,
  canal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro TEXT,
  entregue_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE buscas_salvas
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE alertas_regras
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE alerta_entregas
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS edital_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  tipo TEXT,
  nome_arquivo TEXT,
  url TEXT,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  hash_conteudo TEXT,
  conteudo BYTEA,
  estado TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, edital_id, hash_conteudo)
);

CREATE TABLE IF NOT EXISTS edital_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  fonte TEXT,
  ocorrido_em TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_evento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, edital_id, hash_evento)
);

CREATE INDEX IF NOT EXISTS buscas_salvas_tenant_idx
  ON buscas_salvas (tenant_id, ativa, updated_at DESC);
CREATE INDEX IF NOT EXISTS buscas_salvas_usuario_idx
  ON buscas_salvas (tenant_id, usuario_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS alertas_regras_tenant_idx
  ON alertas_regras (tenant_id, ativa, updated_at DESC);
CREATE INDEX IF NOT EXISTS alerta_entregas_pendentes_idx
  ON alerta_entregas (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS edital_documentos_edital_idx
  ON edital_documentos (tenant_id, edital_id, created_at DESC);
CREATE INDEX IF NOT EXISTS edital_eventos_edital_idx
  ON edital_eventos (tenant_id, edital_id, ocorrido_em DESC);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'buscas_salvas', 'alertas_regras', 'alerta_entregas',
    'edital_documentos', 'edital_eventos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (
      SELECT 1
        FROM pg_policies
       WHERE schemaname = current_schema()
         AND tablename = table_name
         AND policyname = table_name || '_tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
        table_name || '_tenant_isolation', table_name
      );
    END IF;
  END LOOP;
END $$;

-- Registros de busca e entrega são privados por usuário por padrão. Admin/operação
-- podem consultar o tenant inteiro somente pelas rotas server-side correspondentes.
DROP POLICY IF EXISTS buscas_salvas_tenant_isolation ON buscas_salvas;
CREATE POLICY buscas_salvas_tenant_isolation ON buscas_salvas
  USING (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador'))
  )
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador'))
  );

DROP POLICY IF EXISTS alertas_regras_tenant_isolation ON alertas_regras;
CREATE POLICY alertas_regras_tenant_isolation ON alertas_regras
  USING (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador'))
  )
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador'))
  );

DROP POLICY IF EXISTS alerta_entregas_tenant_isolation ON alerta_entregas;
CREATE POLICY alerta_entregas_tenant_isolation ON alerta_entregas
  USING (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador'))
  )
  WITH CHECK (
    tenant_id = app_tenant_id()
    AND (usuario_id = app_user_id() OR app_role() IN ('admin', 'operador'))
  );

ALTER TABLE buscas_salvas OWNER TO licite_owner;
ALTER TABLE alertas_regras OWNER TO licite_owner;
ALTER TABLE alerta_entregas OWNER TO licite_owner;
ALTER TABLE edital_documentos OWNER TO licite_owner;
ALTER TABLE edital_eventos OWNER TO licite_owner;

GRANT SELECT, INSERT, UPDATE ON ingest_checkpoints TO licite_ingest;
GRANT SELECT, INSERT, UPDATE ON ingest_dead_letters TO licite_ingest;
GRANT SELECT, INSERT, UPDATE ON editais, edital_documentos, edital_eventos TO licite_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON buscas_salvas TO licite_core;
GRANT SELECT, INSERT, UPDATE ON alertas_regras, alerta_entregas TO licite_core;
GRANT SELECT ON buscas_salvas, alertas_regras, alerta_entregas TO licite_ingest;
GRANT SELECT ON edital_documentos, edital_eventos TO licite_core, licite_ai;
