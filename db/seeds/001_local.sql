-- Seed local somente. Não usar em produção sem revisão.
BEGIN;
SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000002', true);
SELECT set_config('app.auth_flow', 'true', true);

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
  'scrypt$16384$8$1$bGljaXRlLWNvbWlnby1sb2NhbC1zYWx0$Hkc28dUl61j-hf-QCX1ZJQgPiNgjl3yb2cdx-xF5vtDJ57qYCGdTmubKsQAmHQ8LpB1GjxuEBK2TppPINjCG7Q'
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  papel = EXCLUDED.papel,
  password_hash = EXCLUDED.password_hash;

INSERT INTO auth_credentials (tenant_id, usuario_id, email, password_hash, email_verificado_em)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'admin@local.test',
  'scrypt$16384$8$1$bGljaXRlLWNvbWlnby1sb2NhbC1zYWx0$Hkc28dUl61j-hf-QCX1ZJQgPiNgjl3yb2cdx-xF5vtDJ57qYCGdTmubKsQAmHQ8LpB1GjxuEBK2TppPINjCG7Q',
  now()
)
ON CONFLICT (tenant_id, usuario_id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  email_verificado_em = EXCLUDED.email_verificado_em,
  ativo = true;

INSERT INTO empresas (id, tenant_id, cnpj, razao_social, nome_fantasia, porte, segmento, cidade, uf)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000000191',
  'Empresa Demo Licite Comigo Ltda.',
  'Empresa Demo',
  'micro',
  'servicos administrativos',
  'Brasília',
  'DF'
)
ON CONFLICT (id) DO UPDATE SET razao_social = EXCLUDED.razao_social;

SELECT set_config('app.empresa_id', '00000000-0000-0000-0000-000000000003', true);

INSERT INTO empresa_usuarios (tenant_id, empresa_id, usuario_id, papel)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'proprietario'
)
ON CONFLICT (tenant_id, empresa_id, usuario_id) DO UPDATE SET papel = EXCLUDED.papel, ativo = true;

INSERT INTO planos (id, slug, nome, descricao, limites)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'local-demo',
  'Plano local demo',
  'Plano exclusivamente local para validar o fluxo do MVP 1.',
  '{"empresas": 1, "usuarios": 5, "ia_mensal": 100}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET limites = EXCLUDED.limites;

INSERT INTO assinaturas (id, tenant_id, empresa_id, plano_id, status, limites_snapshot)
VALUES (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  'trial',
  '{"empresas": 1, "usuarios": 5, "ia_mensal": 100}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, limites_snapshot = EXCLUDED.limites_snapshot;

INSERT INTO glossario_termos (termo, definicao_simples, definicao_tecnica, referencia, status)
VALUES ('edital', 'Documento com regras e prazos da oportunidade.', 'Instrumento convocatório da contratação pública.', 'Revisar norma vigente', 'rascunho_para_revisao')
ON CONFLICT (termo) DO NOTHING;
COMMIT;
