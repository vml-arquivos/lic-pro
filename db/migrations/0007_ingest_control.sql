-- Fase 3.2 item 1.5 — checkpoint, retry e dead-letter da ingestão.

CREATE TABLE ingest_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  fonte TEXT NOT NULL,
  modalidade TEXT NOT NULL,
  janela_inicio DATE NOT NULL,
  janela_fim DATE NOT NULL,
  cursor_pagina INTEGER NOT NULL DEFAULT 1 CHECK (cursor_pagina > 0),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'processando', 'concluida', 'erro')),
  tentativa INTEGER NOT NULL DEFAULT 0 CHECK (tentativa >= 0),
  ultima_execucao_em TIMESTAMPTZ,
  concluida_em TIMESTAMPTZ,
  ultimo_erro TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fonte, modalidade, janela_inicio, janela_fim)
);

CREATE TABLE ingest_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  checkpoint_id UUID NOT NULL REFERENCES ingest_checkpoints(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  erro TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolvida_em TIMESTAMPTZ
);

CREATE INDEX ingest_checkpoints_status_idx ON ingest_checkpoints (tenant_id, status, updated_at);
CREATE INDEX ingest_dead_letters_pending_idx ON ingest_dead_letters (tenant_id, resolvida_em, created_at);

ALTER TABLE ingest_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE ingest_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_dead_letters FORCE ROW LEVEL SECURITY;

CREATE POLICY ingest_checkpoints_tenant_isolation ON ingest_checkpoints
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY ingest_dead_letters_tenant_isolation ON ingest_dead_letters
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE ingest_checkpoints OWNER TO licite_owner;
ALTER TABLE ingest_dead_letters OWNER TO licite_owner;
GRANT SELECT, INSERT, UPDATE ON ingest_checkpoints, ingest_dead_letters TO licite_ingest;
