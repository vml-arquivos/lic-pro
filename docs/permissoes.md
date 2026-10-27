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

- A área é calculada no servidor a partir do papel do token. Nenhuma tela ou preferência do
  usuário muda a área.
- Hoje cada empresa tem **um usuário**. A tabela `empresa_usuarios` fica pronta para equipes
  no futuro.
- Só a Administração define o tipo de conta. Não existe "mudar público" para o usuário.
- Aluno só entra por matrícula feita pela Administração (convite). Empresa e mentor também
  entram por convite. O cadastro aberto continua desligado (`SIGNUP_ENABLED=false`).

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
não tem esse limite.

## Páginas por área

| Página                                                                                | Administração | Empresa | Aluno | Mentor |
| ------------------------------------------------------------------------------------- | :-----------: | :-----: | :---: | :----: |
| `/admin`, `/admin/*`, `/leads`                                                        |      sim      |   não   |  não  |  não   |
| `/painel`, `/conta`, `/ana`, `/onboarding`                                            |      sim      |   sim   |  sim  |  sim   |
| `/radar`, `/pregoes`                                                                  |      sim      |   sim   |  sim  |  não   |
| `/oportunidades`, `/agenda`, `/documentos`, `/buscas-salvas`, `/alertas`, `/empresas` |      sim      |   sim   |  não  |  não   |
| `/academia`                                                                           |      sim      |   sim   |  sim  |  sim   |
| `/mentor`, `/academia/mentor`                                                         |      sim      |   não   |  não  |  sim   |

Regras e menus ficam em `packages/shared/src/areas.ts`, com testes. As páginas conferem a
área no servidor; a API confere de novo.

## Rotas da API (papel × rota)

| Rota                                                                                                 | plataforma | admin | operador | mentor | aluno |
| ---------------------------------------------------------------------------------------------------- | :--------: | :---: | :------: | :----: | :---: |
| `GET /admin/leads`                                                                                   |     ✔      |       |          |        |       |
| `GET /admin/users/audit`                                                                             |     ✔      |       |          |        |       |
| `GET /operations/ingest`                                                                             |     ✔      |       |          |        |       |
| `GET /admin/coleta/status`, `POST /admin/coleta/run` (coleta nativa do PNCP)                         |     ✔      |       |          |        |       |
| `GET /users`                                                                                         |     ✔      |       |          |   ✔    |       |
| `GET /mentor/companies`, `GET /mentor/dashboard`                                                     |     ✔      |       |          |   ✔    |       |
| `GET /mentorado/dashboard`                                                                           |     ✔      |       |          |        |   ✔   |
| `GET /professional/dashboard`                                                                        |     ✔      |   ✔   |    ✔     |        |       |
| `GET/POST /opportunities`, `GET/PATCH/DELETE /opportunities/:id`                                     |     ✔      |   ✔   |    ✔     |        |       |
| `GET /checklist-models`, `POST /opportunities/:id/checklists`, `/checklists/*`, `/checklist-items/*` |     ✔      |   ✔   |    ✔     |        |       |
| `GET /agenda`, `/agenda/prazos*`, `/tasks*`                                                          |     ✔      |   ✔   |    ✔     |        |       |
| `GET/POST/PATCH/DELETE /empresa/documentos*`, `GET /empresa/inicio`                                  |     ✔      |   ✔   |    ✔     |        |       |
| `DELETE /mentor/concessions/:id`                                                                     |     ✔      |       |          |        |       |
| `PATCH /me/view-as`                                                                                  |     ✔      |       |          |        |       |
| `GET /platform/overview, /companies, /students, /mentors, /classes, /invitations`                    |     ✔      |       |          |        |       |
| `POST /platform/invitations` (+ `/:id/revoke`, `/:id/reissue`)                                       |     ✔      |       |          |        |       |
| `POST /platform/classes`, `PATCH /platform/classes/:id`                                              |     ✔      |       |          |        |       |
| `PATCH /platform/users/:id/active`                                                                   |     ✔      |       |          |        |       |

Rotas públicas do convite: `POST /auth/invitations/preview` e `POST /auth/invitations/accept`
(limite de tentativas por IP; resposta genérica para convite inválido).

## Pontos de atenção

- A sessão (JWT) continua válida até vencer, mesmo se a conta for desativada. Para corte
  imediato, é preciso lista de sessões revogadas (item futuro).
- Depois de promover uma conta para `plataforma`, a pessoa precisa sair e entrar de novo
  para o token trazer o papel novo.
- Os links de Termos e Privacidade da página de convite apontam para o domínio do app; as
  páginas jurídicas vivem no site. Ajustar quando o texto jurídico estiver revisado.
