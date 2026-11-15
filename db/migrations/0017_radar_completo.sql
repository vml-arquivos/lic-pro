-- Fase B — Radar completo: campos do órgão, histórico de mudanças, municípios (proximidade),
-- estado do usuário por edital e perfil do Radar (nota de compatibilidade explicável).

-- ---------------------------------------------------------------------------
-- 1. Campos do edital que antes se perdiam
-- ---------------------------------------------------------------------------
ALTER TABLE editais
  ADD COLUMN IF NOT EXISTS orgao_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS numero_compra TEXT,
  ADD COLUMN IF NOT EXISTS processo TEXT,
  ADD COLUMN IF NOT EXISTS amparo_legal TEXT,
  ADD COLUMN IF NOT EXISTS informacao_complementar TEXT;

CREATE INDEX IF NOT EXISTS editais_orgao_cnpj_idx ON editais (orgao_cnpj);
CREATE INDEX IF NOT EXISTS editais_publicacao_idx ON editais (tenant_id, data_publicacao DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS editais_encerramento_idx
  ON editais (tenant_id, data_encerramento_proposta) WHERE data_encerramento_proposta IS NOT NULL;
CREATE INDEX IF NOT EXISTS editais_atualizacao_idx
  ON editais (tenant_id, (COALESCE(data_atualizacao, updated_at)) DESC);

-- ---------------------------------------------------------------------------
-- 2. Histórico de mudanças (campo antes → depois), gravado pelo próprio banco
-- ---------------------------------------------------------------------------
-- Vale para qualquer escritor (ingestão, correção manual). Só registra quando um campo
-- acompanhado realmente mudou; o mesmo evento não se repete (hash_evento).
CREATE OR REPLACE FUNCTION editais_registrar_mudancas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  mudancas JSONB := '[]'::jsonb;
BEGIN
  IF OLD.situacao IS DISTINCT FROM NEW.situacao THEN
    mudancas := mudancas || jsonb_build_object('campo', 'situacao', 'antes', OLD.situacao, 'depois', NEW.situacao);
  END IF;
  IF OLD.valor_estimado IS DISTINCT FROM NEW.valor_estimado THEN
    mudancas := mudancas || jsonb_build_object('campo', 'valor_estimado', 'antes', OLD.valor_estimado, 'depois', NEW.valor_estimado);
  END IF;
  IF OLD.valor_homologado IS DISTINCT FROM NEW.valor_homologado THEN
    mudancas := mudancas || jsonb_build_object('campo', 'valor_homologado', 'antes', OLD.valor_homologado, 'depois', NEW.valor_homologado);
  END IF;
  IF OLD.data_abertura_proposta IS DISTINCT FROM NEW.data_abertura_proposta THEN
    mudancas := mudancas || jsonb_build_object('campo', 'data_abertura_proposta', 'antes', OLD.data_abertura_proposta, 'depois', NEW.data_abertura_proposta);
  END IF;
  IF OLD.data_encerramento_proposta IS DISTINCT FROM NEW.data_encerramento_proposta THEN
    mudancas := mudancas || jsonb_build_object('campo', 'data_encerramento_proposta', 'antes', OLD.data_encerramento_proposta, 'depois', NEW.data_encerramento_proposta);
  END IF;
  IF OLD.modalidade IS DISTINCT FROM NEW.modalidade THEN
    mudancas := mudancas || jsonb_build_object('campo', 'modalidade', 'antes', OLD.modalidade, 'depois', NEW.modalidade);
  END IF;
  IF OLD.titulo IS DISTINCT FROM NEW.titulo THEN
    mudancas := mudancas || jsonb_build_object('campo', 'titulo', 'antes', OLD.titulo, 'depois', NEW.titulo);
  END IF;

  IF jsonb_array_length(mudancas) > 0 THEN
    INSERT INTO edital_eventos (tenant_id, edital_id, tipo, fonte, ocorrido_em, payload, hash_evento)
    VALUES (
      NEW.tenant_id, NEW.id, 'alteracao', NEW.fonte,
      COALESCE(NEW.data_atualizacao, now()),
      jsonb_build_object('campos', mudancas),
      md5(NEW.id::text || mudancas::text || COALESCE(NEW.hash_conteudo, ''))
    )
    ON CONFLICT (tenant_id, edital_id, hash_evento) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION editais_registrar_mudancas() OWNER TO licite_owner;
REVOKE ALL ON FUNCTION editais_registrar_mudancas() FROM PUBLIC;

-- A função roda como licite_owner (dono da tabela, que não é usado para login). Esta política
-- só vale para ele, então só a própria função grava o histórico, em qualquer sessão.
DROP POLICY IF EXISTS edital_eventos_registro_automatico ON edital_eventos;
CREATE POLICY edital_eventos_registro_automatico ON edital_eventos
  FOR INSERT TO licite_owner WITH CHECK (true);

DROP TRIGGER IF EXISTS editais_registrar_mudancas_trg ON editais;
CREATE TRIGGER editais_registrar_mudancas_trg
  AFTER UPDATE ON editais
  FOR EACH ROW EXECUTE FUNCTION editais_registrar_mudancas();

-- Edital alterado depois da última visita do usuário ao Radar
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS radar_visita_em TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 3. Municípios (IBGE): região e coordenadas para busca por proximidade
-- ---------------------------------------------------------------------------
-- Tabela de referência pública, sem dado de cliente (sem tenant). Carga pelo script
-- `pnpm data:import-municipios` a partir do arquivo oficial do IBGE.
CREATE TABLE IF NOT EXISTS municipios_ibge (
  codigo_ibge TEXT PRIMARY KEY CHECK (codigo_ibge ~ '^[0-9]{7}$'),
  municipio TEXT NOT NULL,
  sigla_uf CHAR(2) NOT NULL,
  regiao TEXT NOT NULL CHECK (regiao IN ('norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -35 AND 6),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -75 AND -30)
);
CREATE INDEX IF NOT EXISTS municipios_ibge_uf_nome_idx ON municipios_ibge (sigla_uf, lower(municipio));
CREATE INDEX IF NOT EXISTS municipios_ibge_nome_idx ON municipios_ibge (lower(municipio) text_pattern_ops);
ALTER TABLE municipios_ibge OWNER TO licite_owner;
GRANT SELECT ON municipios_ibge TO licite_core, licite_ingest, licite_ai;

-- ---------------------------------------------------------------------------
-- 4. Estado do usuário por edital: favorito, descartado, visto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edital_interacoes (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  favorito BOOLEAN NOT NULL DEFAULT false,
  descartado BOOLEAN NOT NULL DEFAULT false,
  visto_em TIMESTAMPTZ,
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, edital_id),
  CHECK (NOT (favorito AND descartado))
);
CREATE INDEX IF NOT EXISTS edital_interacoes_tenant_idx ON edital_interacoes (tenant_id, usuario_id, favorito);

-- ---------------------------------------------------------------------------
-- 5. Perfil do Radar: base da nota de compatibilidade (determinística e explicável)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfis_radar (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ufs TEXT[] NOT NULL DEFAULT '{}',
  palavras_interesse TEXT[] NOT NULL DEFAULT '{}',
  valor_min NUMERIC(18, 2) CHECK (valor_min IS NULL OR valor_min >= 0),
  valor_max NUMERIC(18, 2) CHECK (valor_max IS NULL OR valor_max >= 0),
  modalidades TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id),
  CHECK (cardinality(ufs) <= 27),
  CHECK (cardinality(palavras_interesse) <= 30),
  CHECK (valor_min IS NULL OR valor_max IS NULL OR valor_min <= valor_max)
);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['edital_interacoes', 'perfis_radar'] LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO licite_owner', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_do_usuario', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = app_tenant_id() AND usuario_id = app_user_id()) '
      'WITH CHECK (tenant_id = app_tenant_id() AND usuario_id = app_user_id())',
      table_name || '_do_usuario', table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON edital_interacoes, perfis_radar TO licite_core;
