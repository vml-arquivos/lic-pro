-- Fase 3.1 item 1 — roles de aplicação sem bypass de RLS.
-- Execute migrations com licite_owner ou com o superusuário de bootstrap.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_owner') THEN
    CREATE ROLE licite_owner NOSUPERUSER NOBYPASSRLS LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_core') THEN
    CREATE ROLE licite_core NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_ingest') THEN
    CREATE ROLE licite_ingest NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_ai') THEN
    CREATE ROLE licite_ai NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_bid') THEN
    CREATE ROLE licite_bid NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'licite_realtime') THEN
    CREATE ROLE licite_realtime NOSUPERUSER NOBYPASSRLS NOLOGIN;
  END IF;
END $$;

ALTER ROLE licite_owner NOSUPERUSER NOBYPASSRLS LOGIN;
ALTER ROLE licite_core NOSUPERUSER NOBYPASSRLS NOLOGIN;
ALTER ROLE licite_ingest NOSUPERUSER NOBYPASSRLS NOLOGIN;
ALTER ROLE licite_ai NOSUPERUSER NOBYPASSRLS NOLOGIN;
ALTER ROLE licite_bid NOSUPERUSER NOBYPASSRLS NOLOGIN;
ALTER ROLE licite_realtime NOSUPERUSER NOBYPASSRLS NOLOGIN;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO licite_core, licite_ingest, licite_ai, licite_bid, licite_realtime;

ALTER TABLE tenants OWNER TO licite_owner;
ALTER TABLE usuarios OWNER TO licite_owner;
ALTER TABLE editais OWNER TO licite_owner;
ALTER TABLE itens_edital OWNER TO licite_owner;
ALTER TABLE edital_chunks OWNER TO licite_owner;
ALTER TABLE analises_ia OWNER TO licite_owner;
ALTER TABLE pregoes_ativos OWNER TO licite_owner;
ALTER TABLE estrategias_lances OWNER TO licite_owner;
ALTER TABLE lances_log OWNER TO licite_owner;
ALTER TABLE mentorias_sessao OWNER TO licite_owner;
ALTER TABLE ana_conversas OWNER TO licite_owner;
ALTER TABLE ana_mensagens OWNER TO licite_owner;
ALTER TABLE ana_tool_calls OWNER TO licite_owner;
ALTER TABLE auditoria OWNER TO licite_owner;
ALTER TABLE trilhas OWNER TO licite_owner;
ALTER TABLE modulos OWNER TO licite_owner;
ALTER TABLE aulas OWNER TO licite_owner;
ALTER TABLE progresso_aula OWNER TO licite_owner;
ALTER TABLE glossario_termos OWNER TO licite_owner;
ALTER TABLE mentor_mentorado OWNER TO licite_owner;
ALTER TABLE quizzes OWNER TO licite_owner;
ALTER TABLE quiz_questoes OWNER TO licite_owner;
ALTER TABLE quiz_tentativas OWNER TO licite_owner;

-- core-api: CRUD da conta, leitura de editais e Academia, histórico próprio da Ana.
GRANT SELECT, INSERT, UPDATE ON tenants, usuarios TO licite_core;
GRANT SELECT ON editais, itens_edital, analises_ia TO licite_core;
GRANT SELECT ON trilhas, modulos, aulas, glossario_termos, quizzes, quiz_questoes TO licite_core;
GRANT SELECT, INSERT, UPDATE ON progresso_aula, quiz_tentativas TO licite_core;
GRANT SELECT ON mentor_mentorado TO licite_core;
GRANT SELECT, UPDATE ON ana_conversas TO licite_core;
GRANT SELECT ON ana_mensagens, ana_tool_calls TO licite_core;
GRANT INSERT ON auditoria TO licite_core;

-- ingest: somente os dados públicos que o pipeline normaliza.
GRANT SELECT, INSERT, UPDATE ON editais, itens_edital TO licite_ingest;

-- ai/Ana: leitura da fonte, escrita de chunks/análises e histórico/auditoria.
GRANT SELECT ON editais, itens_edital, glossario_termos TO licite_ai;
GRANT SELECT, INSERT ON edital_chunks TO licite_ai;
GRANT SELECT, INSERT, UPDATE ON analises_ia TO licite_ai;
GRANT SELECT, INSERT, UPDATE ON ana_conversas TO licite_ai;
GRANT SELECT, INSERT ON ana_mensagens, ana_tool_calls TO licite_ai;
GRANT SELECT ON trilhas, modulos, aulas, quizzes, quiz_questoes TO licite_ai;

-- bid-engine não recebe UPDATE/DELETE em lances_log; o trigger também é append-only.
GRANT SELECT, INSERT ON pregoes_ativos, estrategias_lances, lances_log TO licite_bid;
GRANT SELECT ON editais, itens_edital TO licite_bid;

-- realtime-gw só observa estado permitido.
GRANT SELECT ON pregoes_ativos, estrategias_lances, lances_log TO licite_realtime;

ALTER DEFAULT PRIVILEGES FOR ROLE licite_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE licite_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
