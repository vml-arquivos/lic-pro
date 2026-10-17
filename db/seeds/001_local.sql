-- Seed local somente. Não usar em produção sem revisão.
BEGIN;
SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000002', true);

INSERT INTO tenants (id, nome, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Licite Comigo Local', 'licite-comigo-local')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, slug = EXCLUDED.slug;

INSERT INTO usuarios (id, tenant_id, email, nome, papel, perfil_jornada, onboarding_concluido, password_hash)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'admin@local.test',
  'Admin Local',
  'admin',
  'profissional',
  true,
  'dev-only-no-login'
)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, papel = EXCLUDED.papel;

INSERT INTO glossario_termos (termo, definicao_simples, definicao_tecnica, referencia, status)
VALUES ('edital', 'Documento com regras e prazos da oportunidade.', 'Instrumento convocatório da contratação pública.', 'Revisar norma vigente', 'rascunho_para_revisao')
ON CONFLICT (termo) DO NOTHING;
COMMIT;
