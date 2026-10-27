-- Fase A (v2) — áreas, acesso da plataforma entre contas, turmas, matrículas e convites.
--
-- 1. plataforma_tenants: quais contas pertencem à equipe do produto.
-- 2. Leitura controlada entre contas, somente para a sessão da plataforma.
-- 3. Catálogo compartilhado (interino): editais coletados pela plataforma são legíveis por
--    todas as contas; a escrita continua restrita ao dono do registro.
-- 4. Turmas, matrículas e convites (matrícula sem depender de e-mail).
-- 5. Leads só acessíveis pela plataforma, também no banco.

-- ---------------------------------------------------------------------------
-- 1. Contas da plataforma
-- ---------------------------------------------------------------------------
-- Tabela sem RLS de propósito: guarda apenas ids de contas e precisa ser consultada pelas
-- policies de qualquer conta. Não contém dado pessoal. Só um administrador do banco grava.
CREATE TABLE IF NOT EXISTS plataforma_tenants (
  id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE plataforma_tenants OWNER TO licite_owner;
GRANT SELECT ON plataforma_tenants TO licite_core, licite_ingest, licite_ai;

CREATE OR REPLACE FUNCTION is_platform_tenant(target UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM plataforma_tenants p WHERE p.id = target);
$$;

-- A rota da API só liga `app.platform` depois de conferir o papel. Mesmo assim, o banco
-- exige que a conta atual seja da plataforma: uma conta cliente que forjasse a variável
-- continuaria sem enxergar nada de outras contas.
CREATE OR REPLACE FUNCTION app_is_platform_session() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.platform', true), '') = 'true'
     AND is_platform_tenant(app_tenant_id());
$$;

-- Papel `plataforma` só existe em conta da plataforma.
CREATE OR REPLACE FUNCTION usuarios_plataforma_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.papel::text = 'plataforma' AND NOT is_platform_tenant(NEW.tenant_id) THEN
    RAISE EXCEPTION 'papel plataforma exige conta da plataforma' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS usuarios_plataforma_guard ON usuarios;
CREATE TRIGGER usuarios_plataforma_guard
  BEFORE INSERT OR UPDATE OF papel, tenant_id ON usuarios
  FOR EACH ROW EXECUTE FUNCTION usuarios_plataforma_guard();

-- Preferência de "ver como" da equipe do produto (guardada no servidor).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS visualizar_como TEXT;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_visualizar_como_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_visualizar_como_check
  CHECK (visualizar_como IS NULL OR visualizar_como IN ('administracao', 'empresa', 'aluno', 'mentor'));

-- ---------------------------------------------------------------------------
-- 2. Leitura entre contas (somente SELECT) para a sessão da plataforma
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenants', 'usuarios', 'empresas', 'auditoria', 'oportunidades_salvas',
    'buscas_salvas', 'alerta_entregas', 'ana_conversas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_platform_read', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (app_is_platform_session())',
      table_name || '_platform_read', table_name
    );
  END LOOP;
END $$;

-- Ativar/desativar contas de qualquer cliente. A plataforma pode atualizar `usuarios` entre
-- contas, mas um gatilho restringe a mudança ao campo `ativo`. Nada além disso é gravável
-- em conta de outro cliente.
DROP POLICY IF EXISTS usuarios_platform_update ON usuarios;
CREATE POLICY usuarios_platform_update ON usuarios FOR UPDATE
  USING (app_is_platform_session())
  WITH CHECK (app_is_platform_session());

CREATE OR REPLACE FUNCTION usuarios_platform_update_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF app_is_platform_session()
     AND OLD.tenant_id IS DISTINCT FROM app_tenant_id()
     AND (to_jsonb(NEW) - 'ativo' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'ativo' - 'updated_at') THEN
    RAISE EXCEPTION 'a plataforma só pode ativar ou desativar contas de outros clientes'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS usuarios_platform_update_guard ON usuarios;
CREATE TRIGGER usuarios_platform_update_guard
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION usuarios_platform_update_guard();

-- ---------------------------------------------------------------------------
-- 3. Catálogo compartilhado (interino, até a Fase B criar a tabela global de editais)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'editais', 'itens_edital', 'edital_chunks', 'edital_versoes',
    'edital_documentos', 'edital_eventos'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_catalogo_compartilhado', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (is_platform_tenant(tenant_id))',
      table_name || '_catalogo_compartilhado', table_name
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Turmas, matrículas e convites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS turmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  mentor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  inicio DATE,
  fim DATE,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome),
  CHECK (fim IS NULL OR inicio IS NULL OR fim >= inicio)
);

CREATE TABLE IF NOT EXISTS matriculas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ativa'
    CHECK (status IN ('ativa', 'trancada', 'concluida', 'cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (turma_id, aluno_id)
);

CREATE TABLE IF NOT EXISTS convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('aluno', 'mentor', 'empresa')),
  email TEXT NOT NULL CHECK (position('@' in email) > 1),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  empresa_nome TEXT,
  turma_id UUID REFERENCES turmas(id) ON DELETE SET NULL,
  mentor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  revogado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_criado_id UUID,
  tenant_criado_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tipo <> 'empresa' OR empresa_nome IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS turmas_tenant_idx ON turmas (tenant_id, status, nome);
CREATE INDEX IF NOT EXISTS matriculas_turma_idx ON matriculas (tenant_id, turma_id, status);
CREATE INDEX IF NOT EXISTS matriculas_aluno_idx ON matriculas (tenant_id, aluno_id);
CREATE INDEX IF NOT EXISTS convites_tenant_idx ON convites (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS convites_email_idx ON convites (tenant_id, lower(email));

ALTER TABLE turmas OWNER TO licite_owner;
ALTER TABLE matriculas OWNER TO licite_owner;
ALTER TABLE convites OWNER TO licite_owner;

ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas FORCE ROW LEVEL SECURITY;
ALTER TABLE matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE matriculas FORCE ROW LEVEL SECURITY;
ALTER TABLE convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE convites FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS turmas_tenant_isolation ON turmas;
CREATE POLICY turmas_tenant_isolation ON turmas
  USING (tenant_id = app_tenant_id() AND (app_role() = 'admin' OR mentor_id = app_user_id()))
  WITH CHECK (tenant_id = app_tenant_id() AND app_role() = 'admin' AND is_platform_tenant(tenant_id));

-- matriculas consulta turmas; turmas não consulta matriculas (evita recursão de policy).
DROP POLICY IF EXISTS matriculas_tenant_isolation ON matriculas;
CREATE POLICY matriculas_tenant_isolation ON matriculas
  USING (
    tenant_id = app_tenant_id()
    AND (
      app_role() = 'admin'
      OR aluno_id = app_user_id()
      OR EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas.turma_id AND t.mentor_id = app_user_id())
    )
  )
  WITH CHECK (tenant_id = app_tenant_id() AND app_role() = 'admin' AND is_platform_tenant(tenant_id));

-- Convites: a equipe da plataforma gerencia; o aceite público roda no fluxo de autenticação
-- (app.auth_flow), como os demais fluxos sem sessão.
DROP POLICY IF EXISTS convites_tenant_isolation ON convites;
CREATE POLICY convites_tenant_isolation ON convites
  USING (
    (tenant_id = app_tenant_id() AND app_role() = 'admin' AND is_platform_tenant(tenant_id))
    OR current_setting('app.auth_flow', true) = 'true'
  )
  WITH CHECK (
    (tenant_id = app_tenant_id() AND app_role() = 'admin' AND is_platform_tenant(tenant_id))
    OR current_setting('app.auth_flow', true) = 'true'
  );

GRANT SELECT, INSERT, UPDATE ON turmas, matriculas, convites TO licite_core;
-- O aceite de convite de aluno vincula aluno e mentor. A gravação passa a exigir o papel
-- administrativo da própria conta (a leitura continua só por conta).
GRANT SELECT, INSERT, UPDATE ON mentor_mentorado TO licite_core;
DROP POLICY IF EXISTS mentor_mentorado_tenant_isolation ON mentor_mentorado;
CREATE POLICY mentor_mentorado_tenant_isolation ON mentor_mentorado
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id() AND app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 5. Leads: a leitura passa a existir só para a sessão da plataforma
-- ---------------------------------------------------------------------------
-- Antes, qualquer papel `admin` (inclusive o de uma empresa cliente) lia todos os leads.
-- A API continua gravando; a leitura e a checagem de duplicidade passam por funções que
-- conferem a sessão. O aplicativo não tem mais SELECT direto em `leads`.
REVOKE SELECT, UPDATE ON leads FROM licite_core;

CREATE OR REPLACE FUNCTION lead_recebido_recentemente(lead_email TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads
     WHERE lower(email) = lower(lead_email) AND created_at > now() - interval '24 hours'
  );
$$;

CREATE OR REPLACE FUNCTION plataforma_listar_leads(limite INTEGER DEFAULT 200)
RETURNS TABLE (
  id UUID, nome TEXT, email TEXT, whatsapp TEXT, perfil TEXT,
  consentimento_versao TEXT, consentimento_em TIMESTAMPTZ, origem TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, status TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.id, l.nome, l.email, l.whatsapp, l.perfil, l.consentimento_versao,
         l.consentimento_em, l.origem, l.utm_source, l.utm_medium, l.utm_campaign,
         l.status, l.created_at
    FROM leads l
   WHERE app_is_platform_session()
   ORDER BY l.created_at DESC
   LIMIT LEAST(GREATEST(limite, 1), 500);
$$;

ALTER FUNCTION lead_recebido_recentemente(TEXT) OWNER TO licite_owner;
ALTER FUNCTION plataforma_listar_leads(INTEGER) OWNER TO licite_owner;
REVOKE ALL ON FUNCTION lead_recebido_recentemente(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION plataforma_listar_leads(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lead_recebido_recentemente(TEXT) TO licite_core;
GRANT EXECUTE ON FUNCTION plataforma_listar_leads(INTEGER) TO licite_core;

-- ---------------------------------------------------------------------------
-- 6. Fontes de dados na Administração
-- ---------------------------------------------------------------------------
-- A API lê o estado da ingestão (checkpoints e dead-letters) para o painel "Fontes de dados".
-- Até aqui só o serviço de ingestão tinha SELECT; a RLS por conta continua valendo.
GRANT SELECT ON ingest_checkpoints, ingest_dead_letters TO licite_core;

-- A tela de Auditoria lê o registro. O aplicativo continua sem UPDATE nem DELETE em `auditoria`
-- (o registro segue só de acréscimo); a leitura segue limitada pela RLS por conta.
GRANT SELECT ON auditoria TO licite_core;
