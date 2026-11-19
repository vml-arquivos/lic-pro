-- Checkpoints de recuperação da coleta, separados por catálogo, feed e janela exata.
CREATE TABLE IF NOT EXISTS coleta_pncp_pendencias (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feed TEXT NOT NULL CHECK (feed IN ('publicacao', 'atualizacao')),
  modalidade INTEGER NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  pagina INTEGER NOT NULL CHECK (pagina > 0),
  tentar_em TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, feed, modalidade, inicio, fim)
);
ALTER TABLE coleta_pncp_pendencias OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON coleta_pncp_pendencias TO licite_core;
