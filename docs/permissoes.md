# Permissões por área e papel

Este documento descreve quem pode o quê. A tabela de rotas abaixo é a mesma que o teste
`services/core-api/tests/permissions-matrix.test.ts` verifica (papel × rota). Mudar uma
exige mudar a outra.

## Áreas e papéis

| Área          | Papel no banco (`papel_usuario`) | Quem é                                |
| ------------- | -------------------------------- | ------------------------------------- |
| Administração | `plataforma`                     | Equipe do Licite Comigo               |
| Empresa       | `admin` (e `operador`)           | Cliente que busca e filtra licitações |
| Aluno         | `aluno`                          | Aluno do curso / mentoria             |
| Mentor        | `mentor`                         | Quem acompanha os alunos              |
| Colaborador   | `colaborador`                    | Equipe de operação do Licite Comigo   |

- A área é calculada no servidor a partir do papel do token. Nenhuma tela ou preferência do
  usuário muda a área.
- Hoje cada empresa tem **um usuário**. A tabela `empresa_usuarios` fica pronta para equipes
  no futuro.
- Só a Administração define o tipo de conta. Não existe "mudar público" para o usuário.
- O colaborador vive na conta da plataforma, mas **não** é Administração: não vê financeiro,
  leads, cobrança, outras contas nem o curso. Usa as mesmas políticas de banco do operador e
  tem os nichos travados pela Administração (Administração → Colaboradores).
- Aluno só entra por matrícula feita pela Administração (convite). Empresa, mentor e
  colaborador também entram por convite. O cadastro aberto continua desligado (`SIGNUP_ENABLED=false`).

## Endereços por painel

Cada painel pode ter o seu próprio endereço (`PANEL_URL_ADMIN`, `PANEL_URL_EMPRESA`,
`PANEL_URL_ALUNO` e, opcionalmente, `PANEL_URL_MENTOR` e `PANEL_URL_COLABORADOR`). É o mesmo aplicativo, mas em cada
endereço só existe o painel dele. Sem essas variáveis nada muda e o sistema segue com um
endereço só.

- **Páginas**: cada endereço abre só o menu do seu painel. O resto responde 404, não "acesso
  negado": a página não existe ali. Regras em `packages/shared/src/panels.ts`, com testes.
- **Login**: empresa, aluno e mentor só entram no endereço da própria área. Quem tenta o
  endereço errado recebe o aviso e o link do painel certo, e nenhum cookie é gravado.
- **Equipe**: a Administração entra no seu endereço e também em cada painel, pela porta dele,
  para dar suporte e testar. Ali vê só aquele painel (sem "ver como") e cada requisição vai
  para a auditoria com a área daquele painel.
- **Sessão**: o cookie não tem `Domain`, então cada endereço tem a sua sessão. Entrar na
  Administração não abre a Empresa.
- **API**: nos endereços de Empresa e Aluno as rotas `/admin`, `/platform` e `/operations`
  não existem. O banco continua isolando por papel e por conta.
- **Links enviados**: convites, e-mails de confirmação, recuperação de senha e alertas apontam
  para o painel de quem recebe. Mentor sem endereço próprio usa o do Aluno.
- **Mentor**: faz parte do lado do curso. Sem `PANEL_URL_MENTOR`, entra pelo endereço do Aluno.
- **Colaborador**: sem `PANEL_URL_COLABORADOR`, entra pelo endereço da Administração e vê só o
  painel dele (menu de Operação), nunca as páginas de Administração.
- **Endereço antigo**: um endereço que não esteja em `PANEL_URL_*` continua funcionando como
  antes (todas as áreas). Depois de configurar os novos, retire o antigo do web.

## O que a Administração enxerga

- **Leitura** entre contas (empresas, usuários, buscas, alertas, auditoria), sempre com
  registro de auditoria. Isso vale só para a sessão da plataforma e é conferido pelo banco.
- **Escrita** entre contas: apenas ativar/desativar usuários. Turmas, matrículas e convites
  ficam na própria conta da plataforma.
- **Leads do site**: só a Administração. O aplicativo não tem leitura direta da tabela;
  a listagem passa por função que confere a sessão.
- **Ver como**: troca o menu e as telas para uma das áreas. Não troca a autoridade da
  requisição; a escolha é registrada na auditoria (`acting_as`).

## Catálogo de editais

Enquanto o catálogo global não existe, os editais coletados na conta da plataforma ficam
legíveis para todas as contas (somente leitura). O que cada conta salva, busca ou configura
continua isolado por conta.

## Radar e nichos

Empresa e aluno usam o Radar limitado a 1–3 nichos (aluno somente leitura). A Administração
não tem esse limite. O colaborador só enxerga os nichos que a Administração liberou para ele
(a tela Minha conta mostra os nichos sem permitir troca; a API responde `niches_locked`).

## Preços pagos

- Página `/precos` (Empresa, Aluno, Colaborador e Administração): escolhe-se nicho, item, estado e
  período em listas. A lista de itens vem dos editais já coletados do nicho (código CATMAT e valor
  estimado típico); digitar o código é só plano B.
- "Quanto o governo pagou": preços praticados do Compras.gov.br para o item escolhido.
- "Pregões já fechados no nicho": valor estimado × valor homologado dos editais do catálogo.
- Dentro do edital (PNCP, com itens buscados): "Ver valores fechados" mostra, item a item, o valor
  estimado, o valor fechado, o desconto e o vencedor, direto do PNCP.
- Quem tem nichos travados (aluno e colaborador) só vê os do próprio perfil; sem nicho escolhido,
  a API responde `niche_preferences_required`.

## Alertas e sessão ao vivo

- Tipos de aviso: `novos` (aberturas), `alteracao` (mudanças no edital), `prazo` (prazos
  chegando) e `sessao` (sessão de disputa). Empresa e colaborador escolhem, por nicho, o que
  querer em Alertas → "Avisos por nicho" (cria a busca do nicho e a regra de alerta).
- `sessao` avisa 1 hora antes, 15 minutos antes e no começo da sessão, usando a data de
  abertura da disputa do edital. É sempre imediato e não repete. Os lances e o chat ao vivo do
  pregoeiro não são lidos: isso depende de integração com o portal da disputa.
- O motor roda a cada 5 minutos por padrão (`ALERT_ENGINE_INTERVAL_SECONDS`).

## Páginas por área

| Página                                                                                | Administração | Empresa | Aluno | Mentor | Colaborador |
| ------------------------------------------------------------------------------------- | :-----------: | :-----: | :---: | :----: | :---------: |
| `/admin`, `/admin/*`, `/leads`                                                        |      sim      |   não   |  não  |  não   |     não     |
| `/painel`, `/conta`, `/ana`, `/onboarding`                                            |      sim      |   sim   |  sim  |  sim   |     sim     |
| `/radar`, `/pregoes`                                                                  |      sim      |   sim   |  sim  |  não   |     sim     |
| `/oportunidades`, `/agenda`, `/documentos`, `/buscas-salvas`, `/alertas`, `/empresas` |      sim      |   sim   |  não  |  não   |     sim     |
| `/academia`                                                                           |      sim      |   sim   |  sim  |  sim   |     sim     |
| `/mentor`, `/academia/mentor`                                                         |      sim      |   não   |  não  |  sim   |     não     |
| `/diagnostico`, `/encontros`                                                          |      sim      |   não   |  sim  |  não   |     não     |
| `/materiais`                                                                          |      sim      |   não   |  sim  |  sim   |     não     |
| `/admin/materiais`                                                                    |      sim      |   não   |  não  |  não   |     não     |
| `/admin/colaboradores`                                                                |      sim      |   não   |  não  |  não   |     não     |
| `/mentor/encontros`                                                                   |      sim      |   não   |  não  |  sim   |     não     |

Regras e menus ficam em `packages/shared/src/areas.ts`, com testes. As páginas conferem a
área no servidor; a API confere de novo.

## Rotas da API (papel × rota)

| Rota                                                                                                                      | plataforma | admin | operador | colaborador | mentor | aluno |
| ------------------------------------------------------------------------------------------------------------------------- | :--------: | :---: | :------: | :---------: | :----: | :---: |
| `GET /admin/leads`                                                                                                        |     ✔      |       |          |             |        |       |
| `GET /admin/users/audit`                                                                                                  |     ✔      |       |          |             |        |       |
| `GET /operations/ingest`                                                                                                  |     ✔      |       |          |             |        |       |
| `GET /admin/coleta/status`, `POST /admin/coleta/run` (coleta nativa do PNCP)                                              |     ✔      |       |          |             |        |       |
| `GET /users`                                                                                                              |     ✔      |       |          |             |   ✔    |       |
| `GET /mentor/companies`, `GET /mentor/dashboard`                                                                          |     ✔      |       |          |             |   ✔    |       |
| `GET /mentorado/dashboard`                                                                                                |     ✔      |       |          |             |        |   ✔   |
| `GET /professional/dashboard`                                                                                             |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET/POST /opportunities`, `GET/PATCH/DELETE /opportunities/:id`                                                          |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET /checklist-models`, `POST /opportunities/:id/checklists`, `/checklists/*`, `/checklist-items/*`                      |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET /agenda`, `/agenda/prazos*`, `/tasks*`                                                                               |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET/POST/PATCH/DELETE /empresa/documentos*`, `GET /empresa/inicio`                                                       |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `DELETE /mentor/concessions/:id`                                                                                          |     ✔      |       |          |             |        |       |
| `PATCH /me/view-as`                                                                                                       |     ✔      |       |          |             |        |       |
| `GET /platform/overview, /companies, /students, /mentors, /classes, /invitations`                                         |     ✔      |       |          |             |        |       |
| `POST /platform/invitations` (+ `/:id/revoke`, `/:id/reissue`)                                                            |     ✔      |       |          |             |        |       |
| `POST /platform/classes`, `PATCH /platform/classes/:id`                                                                   |     ✔      |       |          |             |        |       |
| `PATCH /platform/users/:id/active`                                                                                        |     ✔      |       |          |             |        |       |
| `GET /admin/planos`, `PUT /admin/planos`, `GET /admin/financeiro`, `POST /admin/cobrancas/:id/liberar-manual`             |     ✔      |       |          |             |        |       |
| `GET /admin/assinantes`, `POST /admin/assinaturas/:id/ajustar`, `GET/PUT /admin/cupons`, `POST /admin/integracoes/testar` |     ✔      |       |          |             |        |       |
| `GET /aluno/progresso` (Academia, para qualquer área)                                                                     |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /platform/colaboradores`, `PUT /platform/colaboradores/:id/nichos`                                                   |     ✔      |       |          |             |        |       |
| `POST /billing/teste-gratis`                                                                                              |            |   ✔   |          |             |        |       |
| `GET /billing/minha-assinatura`                                                                                           |            |   ✔   |    ✔     |             |        |       |
| `POST /billing/assinar`, `POST /billing/cancelar`                                                                         |            |   ✔   |          |             |        |       |
| `GET /precos/referencia` (preço de referência, Compras.gov.br)                                                            |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /precos/itens` (itens do nicho com valor típico)                                                                     |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /precos/fechados` (pregões fechados: estimado × homologado)                                                          |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /editais/:id/resultados` (valor fechado e vencedor por item, PNCP)                                                   |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `POST /editais/:id/detalhes/atualizar` (itens e documentos do PNCP)                                                       |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |

Rotas públicas da venda: `GET /public/planos`, `POST /public/checkout/curso` (limite por IP),
`POST /public/compra` (acompanha pelo código da compra), `POST /public/cupom/validar` (limite por IP) e `POST /webhooks/asaas` (confere o
token secreto, reconsulta o pagamento no Asaas e ignora evento repetido). Plano só limita a
conta que tem assinatura registrada: contas antigas continuam sem limite.

Rotas públicas do convite: `POST /auth/invitations/preview` e `POST /auth/invitations/accept`
(limite de tentativas por IP; resposta genérica para convite inválido).

## Pontos de atenção

- A sessão (JWT) continua válida até vencer, mesmo se a conta for desativada. Para corte
  imediato, é preciso lista de sessões revogadas (item futuro).
- Depois de promover uma conta para `plataforma`, a pessoa precisa sair e entrar de novo
  para o token trazer o papel novo.
- Os links de Termos e Privacidade da página de convite apontam para o domínio do app; as
  páginas jurídicas vivem no site. Ajustar quando o texto jurídico estiver revisado.
