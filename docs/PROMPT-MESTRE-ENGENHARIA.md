# Prompt mestre de engenharia — Licite Comigo

Este documento é para quem for mexer no sistema (pessoa ou assistente). Ele diz o que o
sistema é, como está montado, o que nunca pode quebrar e como entregar uma alteração sem
regressão: do código ao commit, push e redeploy.

**Cole a seção "Prompt para colar" no começo de qualquer pedido de alteração.** O resto é a
referência que o prompt aponta.

---

## 1. Prompt para colar

> Você vai alterar o repositório `vml-arquivos/lic-pro` (Licite Comigo), o sistema de mentoria
> de uma mentora de licitações. Antes de mexer em qualquer coisa, leia `docs/PROMPT-MESTRE-ENGENHARIA.md`
> inteiro e siga as regras dele.
>
> Faça **somente** o que for pedido, do jeito mais simples que funcione. Não renomeie, não
> reorganize e não "melhore" o que não foi pedido.
>
> Regras que não se negociam:
>
> 1. Migration já existente nunca é editada. Mudança de banco vira arquivo novo, com o próximo
>    número, e o contador do CI (passo "Verify schema migrations and role safety" de `.github/workflows/ci.yml`) sobe junto.
> 2. Toda tabela com dados de empresa tem `tenant_id` e RLS forçada. Nada de `BYPASSRLS` nem de
>    conectar a aplicação como dono do banco.
> 3. Página ou rota nova entra em `packages/shared/src/areas.ts` (menu e `PAGE_RULES`) e, se for
>    destino de navegação, em `packages/shared/src/hubs.ts`. Os testes do `shared` conferem isso.
> 4. Login, convite e recuperação de senha não podem mudar de comportamento sem pedido explícito.
> 5. Nenhum segredo vai para o código, para o commit ou para a conversa.
> 6. Cor, sombra e raio só pelos tokens de `apps/web/app/theme.css` (`--lc-*`).
>
> Para entregar: rode **na ordem** `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`,
> `pnpm typecheck`, `pnpm test` (com banco **novo**, ver seção 7) e `pnpm --filter @licitecomigo/web build`.
> Se qualquer passo falhar, corrija antes de seguir. Não entregue com teste pulado ou desligado.
>
> Terminada a alteração: mostre a lista de arquivos mudados, o texto do commit (resumo curto e
> descrição, em português simples) e o passo a passo de deploy da seção 9. Quem faz o commit e o
> push é o responsável pelo repositório; se você tiver acesso ao Git, faça na branch `main`
> somente se isso for pedido de forma expressa.
>
> Informe com honestidade o que **não** foi possível testar (por exemplo, chamadas reais ao
> governo a partir de ambiente sem internet liberada).

---

## 2. O que é o produto

Plataforma de inteligência e formação para licitações públicas brasileiras. É o **sistema
mentor** de uma mentora que ensina licitações. Tem quatro áreas, todas pelo mesmo login:

| Área            | Quem é                     | O que faz                                                              |
| --------------- | -------------------------- | ---------------------------------------------------------------------- |
| `administracao` | equipe do produto          | convida empresas/alunos/mentores, vê uso, coleta de editais, auditoria |
| `empresa`       | cliente (admin e operador) | Radar de editais, buscas, alertas, oportunidades, documentos, agenda   |
| `aluno`         | pessoa matriculada         | trilha da Academia, plano de 30 dias, prática com edital real          |
| `mentor`        | mentora e outros mentores  | acompanha alunos, devolutivas, sessões, certificados                   |

A inteligência artificial (a **Ana**) é a coordenadora: aparece como núcleo da "rede de
especialistas" (tela inicial e painéis) e como assistente flutuante.

## 3. Arquitetura

Monorepo `pnpm`.

```
apps/web            Next.js 14 (App Router, sempre dinâmico). App de todas as áreas.
apps/site           Site público (Next.js). Captação de leads e cadastro.
services/core-api   Fastify + TypeScript + zod + pg. Regras de negócio, login, RLS, coleta PNCP.
services/ai         Ana (assistente). Provedores configuráveis, nunca fixos no código.
services/ingest     Python/Celery/RabbitMQ. OPCIONAL: coleta externa antiga. A coleta padrão agora é nativa.
services/bid-engine, realtime-gw   Futuros. Fora do deploy do MVP.
packages/shared     Regras compartilhadas: áreas, menus, páginas, hubs (rede de especialistas).
packages/ui         Componentes visuais comuns.
db/                 migrate.sh, migrations/*.sql (22), seeds (só desenvolvimento).
infra/coolify       Checklist de deploy. `infra/reference` é só referência histórica.
```

Banco: PostgreSQL 16 + pgvector. Papéis: `licite_owner` (dono dos objetos, ninguém conecta),
`licite_core`, `licite_ingest`, `licite_ai`, `licite_admin` (só migrations e scripts). A API
conecta como `licite_core`, sem superusuário e sem `BYPASSRLS`. RLS é **forçada** nas tabelas com
`tenant_id`; o tenant da sessão vem de `app_tenant_id()`.

### 3.1 Login e áreas

- Uma tela só: `/login`. A área vem do **papel da conta**, não de URL diferente.
- Cadeia: `apps/web /api/auth/login` → `core-api /auth/login`. Respostas: 401
  `invalid_credentials`, 403 `email_not_verified`, 409 escolha de empresa, 429 limite, 503 API
  indisponível. A tela traduz cada uma (`loginErrorText` em `login/LoginForm.tsx`).
- Quem decide o que cada área enxerga: `packages/shared/src/areas.ts` (`MENUS`, `PAGE_RULES`,
  `requiresSession`). O `middleware` do web e o `AppShell` usam essas regras.
- A equipe (papel `plataforma`) usa "Ver como" para abrir as outras áreas.

### 3.2 Catálogo de editais

- Editais pertencem a um tenant. O tenant **catálogo** é o da plataforma
  (`plataforma_tenants`); a política `*_catalogo_compartilhado` (migration 0016) deixa todas as
  empresas **lerem** esse catálogo, sem poder escrever.
- **Coleta nativa do PNCP** (`services/core-api/src/pncp-sync.ts`): roda dentro do core-api, sem
  fila. Ao subir, espera 60 s e roda; depois a cada `PNCP_SYNC_INTERVAL_MINUTES`. Consulta os
  feeds de publicação e de atualização, por modalidade (padrão 6, 8, 4), em páginas de 50, com
  novas tentativas em 429/5xx/rede. Grava pela função `coleta_gravar_editais(jsonb)`
  (SECURITY DEFINER, só aceita o tenant da plataforma). Cada rodada fica em
  `coleta_pncp_execucoes` (ok / parcial / erro / sem_catalogo / rodando).
- Trava: `pg_try_advisory_lock` com a chave `licite-comigo:pncp-sync`. Duas instâncias não rodam juntas.
- Admin: **Administração → Fontes de dados** mostra o catálogo, as últimas execuções e o botão
  "Sincronizar agora" (`POST /admin/coleta/run`, 1 a 30 dias).
- Se o PNCP mudar nomes de campos, o ajuste é só em `normalizePncp()`.

### 3.3 Rede de especialistas (visual)

- Configuração em **dados**, não em JSX: `packages/shared/src/hubs.ts` (`HUB_NODES` por área,
  `HUB_VISITOR`, `HUB_CTA`).
- Componente: `apps/web/app/components/NetworkHub.tsx` (SVG com linhas tracejadas animadas;
  layout em arco; vira lista no celular). `AreaHub.tsx` escolhe os nós pela área.
- Para adicionar um nó: acrescente em `HUB_NODES[<área>]` com `label`, `caption`, `icon` (nome de
  `Icon.tsx`), `tone` e `href` que aquela área **possa abrir**. O teste `hubs.test.ts` falha se
  o destino não existir no menu daquela área, se houver destino repetido ou se a área passar de
  12 nós.
- Foto da mentora no centro (opcional): defina `MENTORA_FOTO_URL` (caminho em `apps/web/public`
  começando com `/`, ou `https://`). Sem foto, aparece o orbe.

### 3.4 Sistema de design

- Tokens e estilos: `apps/web/app/theme.css` (importado por último em `layout.tsx`). Legados
  (`--workspace-*`, `--lc-color-*`) apontam para os tokens novos.
- Ícones: `apps/web/app/components/Icon.tsx`. O campo `icon` do menu é **nome**, não emoji.
- Animação respeita `prefers-reduced-motion`. Verifique 1360, 820 e 390 px; sem rolagem
  horizontal.

## 4. Mapa de acessos

Resumo em `docs/produto/mapa-de-acessos-e-paineis.md`; matriz de permissões por rota em
`docs/permissoes.md`. O teste `permissions-matrix.test.ts` falha se uma rota sair da matriz.

URLs (produção atual): site `licitecomigo.buscarr.com.br`, app `applicitecomigo.buscarr.com.br`,
API `apilicitecomigo.buscarr.com.br`. Todas as áreas entram pelo **app**, em `/login`.

Diagnóstico sem segredo: `GET <app>/api/diagnostico` devolve se o web enxerga o core-api e se o
banco está pronto. Saúde: `<app>/health`, `<app>/ready`, `<api>/health`, `<api>/ready`.

## 5. Variáveis de ambiente

Fonte da verdade: `.env.example`. O script `pnpm env:check` falha se uma variável usada por
serviço não estiver lá. **Variável nova = entra no `.env.example` e no `scripts/check-env-contract.py`.**

Regras de produção que derrubam o core-api se erradas:

- `EMAIL_PROVIDER` só pode ser `smtp` ou `disabled`. `fake` é proibido. `disabled` é proibido
  com `SIGNUP_ENABLED=true`.
- `JWT_SECRET` forte e igual entre serviços que validam o token.
- `DATABASE_URL` do core-api usa `licite_core`. `MIGRATION_DATABASE_URL` usa `licite_admin` e
  nunca `licite_owner`.
- `PNCP_SYNC_ENABLED=false` desliga a coleta nativa.

## 6. Migrations (regras)

1. Só se **acrescenta**. Nunca editar migration já aplicada em algum ambiente.
2. Nome `NNNN_descricao.sql`, número seguinte, sem pular.
3. Cada arquivo roda numa transação. Escreva de forma que reexecutar não quebre quando possível
   (`IF NOT EXISTS`, `CREATE OR REPLACE`).
4. Tabela nova com dados de empresa: `tenant_id`, `ENABLE` e `FORCE ROW LEVEL SECURITY`, políticas
   e `GRANT` mínimos para o papel que usa.
5. Função `SECURITY DEFINER`: dono `licite_owner`, `SET search_path = public, pg_temp`,
   `REVOKE ... FROM PUBLIC`, `GRANT EXECUTE` só ao papel necessário.
6. Suba o número esperado no passo "Verify schema migrations and role safety" do `.github/workflows/ci.yml` e atualize
   `db/migrations/README.md`.
7. Aplicação em produção é pelo serviço `migrate` (nunca à mão no banco).

## 7. Qualidade: o que rodar antes de entregar

```sh
pnpm install --frozen-lockfile
pnpm format:check          # se falhar: pnpm format
pnpm lint
pnpm typecheck
pnpm env:check
pnpm test                  # banco NOVO (abaixo)
pnpm --filter @licitecomigo/web build
```

**Testes de integração usam banco novo.** Rodar sobre um banco que já recebeu muita execução
de teste pode falhar por acúmulo de dados (já aconteceu no Radar) e isso não é regressão.
Crie um banco vazio, aplique as migrations com `sh db/migrate.sh` e aponte:

```sh
TEST_DATABASE_URL=postgresql://licite_core@HOST/licite_ci
TEST_ADMIN_DATABASE_URL=postgresql://licite_admin@HOST/licite_ci
TEST_APP_ROLE=licite_core
```

Meta atual: core-api 509 testes e shared 18 passando. Teste novo limpa o que criou.

Regressão visual (quando mexer em tema, menu ou páginas): abra com Playwright as páginas das
quatro áreas em 1360, 820 e 390 px e confira rolagem horizontal = 0 e console sem erro.

## 8. Como estender (receitas)

**Página nova numa área**

1. Crie a página em `apps/web/app/<rota>/page.tsx`.
2. Acrescente o item em `MENUS[<área>]` e a regra em `PAGE_RULES` (`areas.ts`).
3. Se for destino de navegação, crie o nó em `hubs.ts`.
4. Se chamar endpoint novo, registre na matriz `docs/permissoes.md` e no teste de permissões.
5. Teste: `pnpm --filter @licitecomigo/shared test` e o teste da rota.

**Endpoint novo**: rota em `services/core-api/src`, validação `zod`, papel exigido explícito,
conexão pelo contexto da requisição (RLS), teste de integração e linha na matriz.

**Nova fonte de dados do governo**: copie o padrão de `pncp-sync.ts` (normalizador puro com
teste, gravação por função SECURITY DEFINER, registro de execução, trava, nova tentativa).

**Mudar o visual**: só em `theme.css` e componentes de `components/`. Nada de cor solta.

## 9. Commit, push e redeploy sem risco

**Commit** (português simples, curto, sem texto de máquina):

```
Resumo (até 70 caracteres): o que mudou para o usuário.

Descrição: 2 a 5 linhas. O que foi feito, o que precisa de migration ou variável nova.
```

**Push**: na `main`. O CI roda: formatação, lint, tipos, testes com banco novo, contagem de
migrations, build.

**Redeploy no Coolify, nesta ordem** (cada passo só depois do anterior ficar saudável):

1. `migrate` (one-shot). Confirme código 0. Se falhar, **pare**; não suba os outros serviços.
2. `core-api`. Espere `/ready` responder.
3. `web` (app). Depois `site`, se mudou.
4. `ai` e `ingest` só se foram alterados.

**Conferência depois do deploy** (2 minutos):

```sh
curl -fsS https://apilicitecomigo.buscarr.com.br/ready
curl -fsS https://applicitecomigo.buscarr.com.br/api/diagnostico
psql "$MIGRATION_DATABASE_URL" -c "select count(*) from schema_migrations;"   # esperado: 22
```

Depois entre em `/login` com a conta da equipe, abra **Administração → Fontes de dados** e clique
em **Sincronizar agora**. O resultado esperado é uma execução `ok` e o catálogo com editais.

**Reversão**: o Coolify guarda o deploy anterior; reimplante-o. Migration não se desfaz: se uma
migration nova for ruim, a correção é outra migration. Por isso migrations são pequenas e aditivas.

## 10. Contas e login (recuperação)

Causas mais comuns de "e-mail ou senha incorretos" quando a senha está certa:

1. Migrations 0015 em diante **não aplicadas** (conta sem papel `plataforma` ou tabelas ausentes).
2. core-api **não subiu** por configuração de e-mail (ver seção 5).
3. Conta sem e-mail verificado.
4. Conta não promovida para `plataforma`.

Scripts (rodam **dentro do contêiner do core-api**, que só tem Node; use a URL do `licite_admin`):

```sh
# redefinir senha
MIGRATION_DATABASE_URL=... RESET_EMAIL=... RESET_PASSWORD=... node dist/admin-reset-password.js
# promover para a equipe (depois a pessoa sai e entra de novo)
MIGRATION_DATABASE_URL=... PLATFORM_ADMIN_EMAIL=... node dist/platform-promote.js
# criar a primeira conta da equipe em banco novo
MIGRATION_DATABASE_URL=... BOOTSTRAP_PLATFORM=true BOOTSTRAP_TENANT_NAME=... \
  BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... node dist/admin-bootstrap.js
```

Para saber se o erro é senha ou servidor, abra `<app>/api/diagnostico`: se `coreApiRespondeu` for
`false`, o problema é o servidor, não a senha.

## 11. Estado honesto (o que ainda não está pronto)

- **PNCP ao vivo**: a coleta foi testada contra um PNCP simulado (390 editais, idempotência,
  falha de fonte, permissões). A chamada real ao governo **precisa ser confirmada na VPS**
  (Administração → Fontes de dados → Sincronizar agora). O ambiente de desenvolvimento não
  alcança os sites do governo.
- **Compras.gov.br** (pesquisa de preços, atas, contratos, PCA): ainda não coletado. O PNCP cobre
  os editais da Lei 14.133; o restante é trabalho futuro.
- **Benefícios ME/EPP** e outros filtros jurídicos finos: futuro.
- **E-mail**: depende de SMTP configurado. Sem ele, verificação e recuperação não chegam.
- **WhatsApp**: indisponível.
- **Textos jurídicos** (termos, privacidade): aguardam revisão jurídica.
- **Catálogo compartilhado** é uma solução provisória: todas as empresas leem os editais do
  tenant da plataforma.
- Sessão (JWT) continua válida até vencer mesmo com a conta desativada.

## 12. Antes de chamar de "pronto para produção"

- [ ] CI verde na `main` (22 migrations aplicadas).
- [ ] `/ready` da API e `/api/diagnostico` do app respondendo.
- [ ] Login com cada papel: equipe, empresa, aluno, mentor.
- [ ] Sincronizar agora = execução `ok`, editais aparecendo no Radar da empresa.
- [ ] SMTP real configurado e e-mail de teste recebido.
- [ ] Backup do Postgres fora da VPS e restauração testada.
- [ ] Textos jurídicos revisados.
