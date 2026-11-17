-- 0036 — Portais de compras
--
-- De qual portal (BLL, BNC, Compras.gov.br, Portal de Compras Públicas...) vem cada licitação.
-- O PNCP informa isso em `usuarioNome` e `linkSistemaOrigem`; a coleta antiga lia um nome de campo
-- que não existe e `sistema_origem` ficou vazio. Daqui em diante:
--   * `sistema_origem` guarda o nome do portal (como o PNCP mostra);
--   * `portal_slug` guarda o identificador único do portal, usado no filtro e na lista de Portais.
-- Só acrescenta uma coluna e um índice; nada existente muda. A função de gravação da coleta passa
-- a aceitar `portal_slug` e também regrava a linha quando o portal passou a ser conhecido.

ALTER TABLE editais ADD COLUMN IF NOT EXISTS portal_slug TEXT;
CREATE INDEX IF NOT EXISTS editais_portal_idx ON editais (tenant_id, portal_slug)
  WHERE portal_slug IS NOT NULL;

-- Preenchimento inicial dos editais já coletados: só os portais cujo endereço aparece no link de
-- origem. O restante é preenchido pela próxima coleta (a função abaixo regrava quando o portal muda).
UPDATE editais AS e
   SET portal_slug = p.slug,
       sistema_origem = COALESCE(e.sistema_origem, p.nome)
  FROM (VALUES
    ('compras-gov-br', 'Compras.gov.br', 'compras.gov.br'),
    ('compras-gov-br', 'Compras.gov.br', 'comprasnet.gov.br'),
    ('portal-de-compras-publicas', 'Portal de Compras Públicas', 'portaldecompraspublicas.com.br'),
    ('bll-compras', 'BLL Compras', 'bllcompras.com'),
    ('bll-compras', 'BLL Compras', 'bll.org.br'),
    ('bnc', 'BNC - Bolsa Nacional de Compras', 'bnc.org.br'),
    ('licitanet', 'Licitanet', 'licitanet.com.br'),
    ('licitacoes-e', 'Licitações-e (Banco do Brasil)', 'licitacoes-e.com.br'),
    ('comprasbr', 'ComprasBR', 'comprasbr.com.br'),
    ('bbmnet', 'BBMNET Licitações', 'bbmnetlicitacoes.com.br'),
    ('m2a', 'M2A Tecnologia', 'm2atecnologia.com.br'),
    ('licitar-digital', 'Licitar Digital', 'licitardigital.com.br')
  ) AS p (slug, nome, dominio)
 WHERE e.portal_slug IS NULL
   AND e.url_origem IS NOT NULL
   AND lower(e.url_origem) ~ ('^(https?://)?([a-z0-9-]+[.])*' || replace(p.dominio, '.', '[.]') || '([/:?#]|$)');

-- 2. Gravação idempotente de editais no catálogo da plataforma (agora com o portal de origem).
-- Entrada: array JSON de editais já normalizados. Saída: quantos entraram e quantos mudaram.
CREATE OR REPLACE FUNCTION coleta_gravar_editais(p_registros JSONB)
RETURNS TABLE (inseridos INTEGER, atualizados INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant UUID := app_tenant_id();
  v_inseridos INTEGER;
  v_atualizados INTEGER;
BEGIN
  IF v_tenant IS NULL OR NOT is_platform_tenant(v_tenant) THEN
    RAISE EXCEPTION 'coleta_gravar_editais: apenas a conta da plataforma pode gravar o catálogo'
      USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_registros) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'coleta_gravar_editais: esperado um array JSON' USING ERRCODE = '22023';
  END IF;

  WITH entrada AS (
    SELECT * FROM jsonb_to_recordset(p_registros) AS x(
      id_externo TEXT, titulo TEXT, orgao TEXT, uf TEXT, uasg TEXT, modalidade TEXT,
      valor_estimado NUMERIC, data_publicacao TIMESTAMPTZ, url_origem TEXT, hash_conteudo TEXT,
      conteudo_texto TEXT, sistema_origem TEXT, codigo_modalidade INTEGER,
      codigo_modo_disputa INTEGER, codigo_instrumento TEXT, instrumento TEXT, modo_disputa TEXT,
      situacao TEXT, esfera TEXT, poder TEXT, municipio_ibge TEXT, municipio_nome TEXT,
      srp BOOLEAN, data_atualizacao TIMESTAMPTZ, data_abertura_proposta TIMESTAMPTZ,
      data_encerramento_proposta TIMESTAMPTZ, valor_homologado NUMERIC, estado_completude TEXT,
      orgao_cnpj TEXT, numero_compra TEXT, processo TEXT, amparo_legal TEXT,
      informacao_complementar TEXT, portal_slug TEXT
    )
    WHERE id_externo IS NOT NULL AND titulo IS NOT NULL AND hash_conteudo IS NOT NULL
  ), gravados AS (
    INSERT INTO editais (
      tenant_id, fonte, id_externo, titulo, orgao, uf, uasg, modalidade, valor_estimado,
      data_publicacao, url_origem, hash_conteudo, conteudo_texto, sistema_origem,
      codigo_modalidade, codigo_modo_disputa, codigo_instrumento, instrumento, modo_disputa,
      situacao, esfera, poder, municipio_ibge, municipio_nome, srp, data_atualizacao,
      data_abertura_proposta, data_encerramento_proposta, valor_homologado, estado_completude,
      orgao_cnpj, numero_compra, processo, amparo_legal, informacao_complementar, portal_slug
    )
    SELECT v_tenant, 'pncp', e.id_externo, e.titulo, e.orgao, e.uf, e.uasg, e.modalidade,
           e.valor_estimado, e.data_publicacao, e.url_origem, e.hash_conteudo, e.conteudo_texto,
           e.sistema_origem, e.codigo_modalidade, e.codigo_modo_disputa, e.codigo_instrumento,
           e.instrumento, e.modo_disputa, e.situacao, e.esfera, e.poder, e.municipio_ibge,
           e.municipio_nome, e.srp, e.data_atualizacao, e.data_abertura_proposta,
           e.data_encerramento_proposta, e.valor_homologado, e.estado_completude, e.orgao_cnpj,
           e.numero_compra, e.processo, e.amparo_legal, e.informacao_complementar, e.portal_slug
      FROM entrada e
    ON CONFLICT (tenant_id, fonte, id_externo) DO UPDATE SET
      titulo = EXCLUDED.titulo, orgao = EXCLUDED.orgao, uf = EXCLUDED.uf, uasg = EXCLUDED.uasg,
      modalidade = EXCLUDED.modalidade, valor_estimado = EXCLUDED.valor_estimado,
      data_publicacao = EXCLUDED.data_publicacao, url_origem = EXCLUDED.url_origem,
      hash_conteudo = EXCLUDED.hash_conteudo, conteudo_texto = EXCLUDED.conteudo_texto,
      sistema_origem = EXCLUDED.sistema_origem, codigo_modalidade = EXCLUDED.codigo_modalidade,
      codigo_modo_disputa = EXCLUDED.codigo_modo_disputa,
      codigo_instrumento = EXCLUDED.codigo_instrumento, instrumento = EXCLUDED.instrumento,
      modo_disputa = EXCLUDED.modo_disputa, situacao = EXCLUDED.situacao,
      esfera = EXCLUDED.esfera, poder = EXCLUDED.poder, municipio_ibge = EXCLUDED.municipio_ibge,
      municipio_nome = EXCLUDED.municipio_nome, srp = EXCLUDED.srp,
      data_atualizacao = EXCLUDED.data_atualizacao,
      data_abertura_proposta = EXCLUDED.data_abertura_proposta,
      data_encerramento_proposta = EXCLUDED.data_encerramento_proposta,
      valor_homologado = EXCLUDED.valor_homologado,
      estado_completude = EXCLUDED.estado_completude, orgao_cnpj = EXCLUDED.orgao_cnpj,
      numero_compra = EXCLUDED.numero_compra, processo = EXCLUDED.processo,
      amparo_legal = EXCLUDED.amparo_legal,
      informacao_complementar = EXCLUDED.informacao_complementar,
      portal_slug = EXCLUDED.portal_slug,
      updated_at = now()
    -- Só reescreve quando o conteúdo mudou (ou quando o portal passou a ser conhecido): rodadas
    -- repetidas não geram ruído nem histórico.
    WHERE editais.hash_conteudo IS DISTINCT FROM EXCLUDED.hash_conteudo
       OR (EXCLUDED.portal_slug IS NOT NULL
           AND editais.portal_slug IS DISTINCT FROM EXCLUDED.portal_slug)
    RETURNING (xmax = 0) AS novo
  )
  SELECT count(*) FILTER (WHERE novo)::INTEGER, count(*) FILTER (WHERE NOT novo)::INTEGER
    INTO v_inseridos, v_atualizados
    FROM gravados;

  inseridos := COALESCE(v_inseridos, 0);
  atualizados := COALESCE(v_atualizados, 0);
  RETURN NEXT;
END
$$;
ALTER FUNCTION coleta_gravar_editais(JSONB) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION coleta_gravar_editais(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION coleta_gravar_editais(JSONB) TO licite_core;
