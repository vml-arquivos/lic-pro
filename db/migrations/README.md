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

## Cobrança e detalhes do edital (0023 e 0024)

- `0023_cobranca.sql`: planos com preço/ciclo/benefícios/limites (curso e assinaturas, nascem
  desativados), cobranças, pagamentos e eventos do Asaas (RLS pelo sinalizador `app.billing_flow`),
  e as funções `billing_liberar_curso()` e `billing_definir_assinatura()` (SECURITY DEFINER, só
  para o `licite_core`). Assinatura passa a poder existir antes do cadastro da empresa.
- `0024_detalhes_edital.sql`: benefício ME/EPP e situação do item, data da última coleta de
  detalhes e a função `coleta_gravar_detalhes()` (itens e documentos do edital do catálogo).

## Teste grátis, cupons e assinantes (0025)

- `planos.trial_dias` e os planos de exemplo ainda desativados passam a ter só o que o sistema
  entrega hoje, com 7 dias de teste.
- Tabela `cupons` (RLS: leitura no fluxo de cobrança, escrita só da plataforma); `cobrancas`
  guarda `cupom_codigo` e `desconto_centavos`.
- `billing_iniciar_teste()` (a empresa começa o teste, uma vez por conta) e
  `admin_ajustar_assinatura()` (a equipe estende, cancela ou reativa). Leitura de `assinaturas`
  para a plataforma.

## Aluno: materiais e encontros (0026)

- Materiais de apoio, diagnóstico do aluno e encontros ao vivo da turma, com prazo de acesso.

## Colaboradores da Licite Comigo (0027 e 0028)

- `0027`: novo valor `colaborador` no tipo `papel_usuario`. Fica em arquivo próprio porque um
  valor novo de enum só pode ser usado depois de confirmado (cada migration roda numa transação).
- `0028`: o convite e o "ver como" aceitam `colaborador`; a trava que mantém a equipe na conta
  da plataforma passa a valer para `plataforma` e `colaborador`; as regras de alerta aceitam o
  tipo `sessao` (aviso de sessão de disputa ao vivo), e as entregas também.
- O colaborador usa as mesmas políticas de linha (RLS) do operador, dentro da conta da
  plataforma. Os nichos dele ficam em `usuarios.nicho_preferencias` e só a Administração altera.

## Usuários e registro de uso (0029)

- O convite aceita o tipo `equipe` (administrador do sistema, papel `plataforma` na conta da
  plataforma).
- `atividade_usuario` e `atividade_buscas`: o que cada usuário usou e buscou, para a ficha da
  Administração. Isolamento por conta (RLS) e leitura liberada à sessão da plataforma.

Todas rodam em ordem pelo `migrate.sh`, cada uma na sua transação. O CI confere que as 29
foram aplicadas. Migration já aplicada nunca é editada: mudança vira arquivo novo.
