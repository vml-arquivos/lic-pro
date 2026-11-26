-- Campos do PNCP que a coleta principal não traz: fonte orçamentária, emenda parlamentar,
-- normativo base, critério de julgamento, orçamento sigiloso e NF-e. Entram por uma rotina
-- à parte (busca pública do PNCP) e ficam nulos enquanto o PNCP não informar.
ALTER TABLE editais
  ADD COLUMN IF NOT EXISTS fonte_orcamentaria TEXT,
  ADD COLUMN IF NOT EXISTS emenda_parlamentar BOOLEAN,
  ADD COLUMN IF NOT EXISTS normativo_base TEXT,
  ADD COLUMN IF NOT EXISTS criterio_julgamento TEXT,
  ADD COLUMN IF NOT EXISTS orcamento_sigiloso BOOLEAN,
  ADD COLUMN IF NOT EXISTS possui_nfe BOOLEAN,
  ADD COLUMN IF NOT EXISTS enriquecido_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS editais_enriquecer_idx
  ON editais (tenant_id, data_publicacao DESC)
  WHERE fonte = 'pncp' AND enriquecido_em IS NULL;

-- Grava os campos acima em editais do catálogo da plataforma, pelo número de controle do PNCP.
-- Não mexe em nenhuma outra coluna e não gera histórico.
CREATE OR REPLACE FUNCTION coleta_enriquecer_editais(p_registros JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant UUID := app_tenant_id();
  v_total INTEGER;
BEGIN
  IF v_tenant IS NULL OR NOT is_platform_tenant(v_tenant) THEN
    RAISE EXCEPTION 'coleta_enriquecer_editais: apenas a conta da plataforma pode gravar o catálogo'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_registros) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'coleta_enriquecer_editais: esperado um array JSON' USING ERRCODE = '22023';
  END IF;
  WITH entrada AS (
    SELECT * FROM jsonb_to_recordset(p_registros) AS x(
      id_externo TEXT, fonte_orcamentaria TEXT, emenda_parlamentar BOOLEAN,
      normativo_base TEXT, criterio_julgamento TEXT, orcamento_sigiloso BOOLEAN,
      possui_nfe BOOLEAN
    )
    WHERE id_externo IS NOT NULL
  ), atualizados AS (
    UPDATE editais e
       SET fonte_orcamentaria = x.fonte_orcamentaria,
           emenda_parlamentar = x.emenda_parlamentar,
           normativo_base = x.normativo_base,
           criterio_julgamento = x.criterio_julgamento,
           orcamento_sigiloso = x.orcamento_sigiloso,
           possui_nfe = x.possui_nfe,
           enriquecido_em = now()
      FROM entrada x
     WHERE e.tenant_id = v_tenant AND e.fonte = 'pncp' AND e.id_externo = x.id_externo
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_total FROM atualizados;
  RETURN COALESCE(v_total, 0);
END
$$;
ALTER FUNCTION coleta_enriquecer_editais(JSONB) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION coleta_enriquecer_editais(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coleta_enriquecer_editais(JSONB) TO licite_core;
