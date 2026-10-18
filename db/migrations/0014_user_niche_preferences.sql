-- Preferências de descoberta do usuário: máximo lógico de três nichos,
-- sempre validadas pelo catálogo compartilhado antes da persistência.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS nicho_preferencias JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'usuarios'::regclass
       AND conname = 'usuarios_nicho_preferencias_array_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_nicho_preferencias_array_check
      CHECK (
        jsonb_typeof(nicho_preferencias) = 'array'
        AND jsonb_array_length(nicho_preferencias) <= 3
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS usuarios_nicho_preferencias_idx
  ON usuarios USING GIN (nicho_preferencias);

GRANT SELECT, UPDATE ON usuarios TO licite_core;
