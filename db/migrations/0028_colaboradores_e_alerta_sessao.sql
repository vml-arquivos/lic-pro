-- Colaboradores da operação e alerta de sessão ao vivo.

-- 1. Convite de colaborador (a pessoa entra na conta da plataforma).
ALTER TABLE convites DROP CONSTRAINT IF EXISTS convites_tipo_check;
ALTER TABLE convites ADD CONSTRAINT convites_tipo_check
  CHECK (tipo IN ('aluno', 'mentor', 'empresa', 'colaborador'));

-- 2. A equipe da plataforma pode "ver como" Colaborador.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_visualizar_como_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_visualizar_como_check
  CHECK (visualizar_como IS NULL
         OR visualizar_como IN ('administracao', 'empresa', 'aluno', 'mentor', 'colaborador'));

-- 3. Colaborador só existe na conta da plataforma.
CREATE OR REPLACE FUNCTION usuarios_plataforma_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.papel::text IN ('plataforma', 'colaborador') AND NOT is_platform_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'papel % exige conta da plataforma', NEW.papel::text
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Alerta de sessão ao vivo: aviso antes e no começo da disputa.
ALTER TABLE alertas_regras DROP CONSTRAINT IF EXISTS alertas_regras_tipos_check;
ALTER TABLE alertas_regras ADD CONSTRAINT alertas_regras_tipos_check
  CHECK (tipos <@ ARRAY['novos', 'alteracao', 'prazo', 'sessao']::text[]);
ALTER TABLE alerta_entregas DROP CONSTRAINT IF EXISTS alerta_entregas_tipo_check;
ALTER TABLE alerta_entregas ADD CONSTRAINT alerta_entregas_tipo_check
  CHECK (tipo IN ('novo', 'alteracao', 'prazo', 'sessao'));
