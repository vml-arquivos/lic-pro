-- Guarda no banco o que foi lido das fontes oficiais (concorrentes, preços pagos, resultados),
-- para o dado sobreviver a reinício e deploy e valer para todas as contas. Só dado público das
-- fontes; nada de cliente. Sem Redis ligado, é aqui que o cache compartilhado fica.
CREATE TABLE IF NOT EXISTS cache_fontes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS cache_fontes_expira_idx ON cache_fontes (expira_em);
ALTER TABLE cache_fontes OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON cache_fontes TO licite_core;

