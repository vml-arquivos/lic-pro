# Migrations

As migrations são SQL versionado e são aplicadas em ordem lexicográfica. Em um volume PostgreSQL novo, o `docker-compose.yml` monta este diretório no entrypoint do container.

Para aplicar manualmente:

```bash
for file in db/migrations/*.sql; do
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file "$file"
done
```

O teste de integração `services/core-api/tests/rls.integration.test.ts` é executado quando `TEST_DATABASE_URL` está configurada. Sem essa variável, ele fica explicitamente marcado como skipped, evitando que testes locais dependam de um banco externo.

## Fase A — áreas e acessos (0015 e 0016)

- `0015_platform_role.sql` só acrescenta o valor `plataforma` ao enum `papel_usuario`. Fica em
  arquivo próprio porque o PostgreSQL não deixa usar um valor novo de enum na mesma transação.
- `0016_platform_access.sql` cria `plataforma_tenants`, as políticas de leitura da plataforma,
  o catálogo compartilhado, `turmas`, `matriculas`, `convites` e a proteção dos leads.

Depois de aplicar as duas, promova o administrador existente:

```bash
MIGRATION_DATABASE_URL=... PLATFORM_ADMIN_EMAIL=voce@exemplo.com pnpm admin:promote-platform
```

A pessoa precisa sair e entrar de novo. Em banco novo, `BOOTSTRAP_PLATFORM=true` no bootstrap
cria a conta da equipe direto.

## Fases B a E e coleta (0017 a 0022)

- `0017_radar_completo.sql`: campos do órgão, histórico de mudanças do edital, estado do usuário
  por edital e perfil do Radar (compatibilidade explicável).
- `0018_municipios_ibge_dados.sql`: carga dos municípios (código IBGE, UF, região, coordenadas
  aproximadas) para busca por proximidade.
- `0019_alertas_completos.sql`: frequência, tipos e destinatários dos alertas, preferências,
  registro das rodadas do motor e função `alertas_motor_alvos()`.
- `0020_aluno_mentor_completo.sql`: plano de 30 dias, práticas com edital, devolutivas, notas,
  sessões e certificados internos.
- `0021_empresa_completo.sql`: decisão e histórico das oportunidades, documentos da empresa
  com validade, lembretes enviados e função `lembretes_alvos()`.

- `0022_coleta_pncp.sql`: registro das execuções da coleta nativa do PNCP e a função
  `coleta_gravar_editais(jsonb)` (SECURITY DEFINER, só para a empresa-catálogo da plataforma).

Todas rodam em ordem pelo `migrate.sh`, cada uma na sua transação. O CI confere que as 22
foram aplicadas. Migration já aplicada nunca é editada: mudança vira arquivo novo.
