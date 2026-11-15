-- 0033 — Segmentos e produtos/serviços no perfil do Radar
--
-- O perfil passa a guardar, além dos nichos, os segmentos (ex.: "Software e sistemas") e os
-- produtos/serviços que a empresa vende. Só acrescenta colunas com valor padrão vazio: perfis
-- existentes continuam como estão.
ALTER TABLE perfis_radar ADD COLUMN IF NOT EXISTS segmentos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE perfis_radar ADD COLUMN IF NOT EXISTS itens TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE perfis_radar DROP CONSTRAINT IF EXISTS perfis_radar_segmentos_max;
ALTER TABLE perfis_radar ADD CONSTRAINT perfis_radar_segmentos_max CHECK (cardinality(segmentos) <= 12);
ALTER TABLE perfis_radar DROP CONSTRAINT IF EXISTS perfis_radar_itens_max;
ALTER TABLE perfis_radar ADD CONSTRAINT perfis_radar_itens_max CHECK (cardinality(itens) <= 30);
