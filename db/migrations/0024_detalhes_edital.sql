-- Fase G (2): itens, benefícios ME/EPP e documentos do edital, buscados no PNCP sob demanda.
--
-- O core-api (licite_core) continua sem escrita em `editais`, `itens_edital` e `edital_documentos`.
-- A gravação passa por uma única função, que só aceita edital do catálogo da plataforma e só
-- guarda o que veio da fonte oficial. Documentos entram como link para o PNCP: o arquivo em si
-- continua no portal oficial.

ALTER TABLE itens_edital ADD COLUMN IF NOT EXISTS beneficio TEXT;
ALTER TABLE itens_edital ADD COLUMN IF NOT EXISTS situacao_item TEXT;
ALTER TABLE editais ADD COLUMN IF NOT EXISTS detalhes_coletados_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION coleta_gravar_detalhes(p_edital UUID, p_itens JSONB, p_documentos JSONB)
RETURNS TABLE (itens INTEGER, documentos INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant UUID;
  v_old TEXT := coalesce(current_setting('app.tenant_id', true), '');
  v_itens INTEGER := 0;
  v_docs INTEGER := 0;
BEGIN
  SELECT tenant_id INTO v_tenant FROM editais WHERE id = p_edital;
  IF v_tenant IS NULL OR NOT is_platform_tenant(v_tenant) THEN
    RAISE EXCEPTION 'edital_fora_do_catalogo';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_typeof(p_documentos) <> 'array' THEN
    RAISE EXCEPTION 'entrada_invalida';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  WITH entrada AS (
    SELECT * FROM jsonb_to_recordset(p_itens) AS x(
      numero TEXT, descricao TEXT, unidade TEXT, quantidade NUMERIC,
      valor_unitario_estimado NUMERIC, catmat_catser TEXT, beneficio TEXT, situacao_item TEXT)
    WHERE numero IS NOT NULL AND descricao IS NOT NULL
  ), gravados AS (
    INSERT INTO itens_edital (tenant_id, edital_id, numero, descricao, unidade, quantidade,
                              valor_unitario_estimado, catmat_catser, beneficio, situacao_item)
    SELECT v_tenant, p_edital, numero, descricao, unidade, quantidade, valor_unitario_estimado,
           catmat_catser, beneficio, situacao_item FROM entrada
    ON CONFLICT (edital_id, numero) DO UPDATE SET
      descricao = EXCLUDED.descricao, unidade = EXCLUDED.unidade, quantidade = EXCLUDED.quantidade,
      valor_unitario_estimado = EXCLUDED.valor_unitario_estimado,
      catmat_catser = EXCLUDED.catmat_catser, beneficio = EXCLUDED.beneficio,
      situacao_item = EXCLUDED.situacao_item
    RETURNING 1
  ) SELECT count(*)::int INTO v_itens FROM gravados;

  WITH entrada AS (
    SELECT * FROM jsonb_to_recordset(p_documentos) AS x(
      tipo TEXT, nome_arquivo TEXT, url TEXT, hash_conteudo TEXT, estado TEXT)
    WHERE url IS NOT NULL AND hash_conteudo IS NOT NULL
  ), gravados AS (
    INSERT INTO edital_documentos (tenant_id, edital_id, tipo, nome_arquivo, url, hash_conteudo, estado)
    SELECT v_tenant, p_edital, tipo, nome_arquivo, url, hash_conteudo, estado FROM entrada
    ON CONFLICT (tenant_id, edital_id, hash_conteudo) DO UPDATE SET
      tipo = EXCLUDED.tipo, nome_arquivo = EXCLUDED.nome_arquivo, estado = EXCLUDED.estado,
      updated_at = now()
    RETURNING 1
  ) SELECT count(*)::int INTO v_docs FROM gravados;

  UPDATE editais SET detalhes_coletados_em = now() WHERE id = p_edital;
  PERFORM set_config('app.tenant_id', v_old, true);
  itens := v_itens;
  documentos := v_docs;
  RETURN NEXT;
END;
$$;
ALTER FUNCTION coleta_gravar_detalhes(UUID, JSONB, JSONB) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION coleta_gravar_detalhes(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coleta_gravar_detalhes(UUID, JSONB, JSONB) TO licite_core;
