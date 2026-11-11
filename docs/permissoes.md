# Permissões por área e papel

Este documento descreve quem pode o quê. A tabela de rotas abaixo é a mesma que o teste
`services/core-api/tests/permissions-matrix.test.ts` verifica (papel × rota). Mudar uma
exige mudar a outra.

## Áreas e papéis

O produto tem dois módulos, cada um com a sua administração. Dinheiro, leads, cupons e planos de
um módulo nunca aparecem no outro (veja `docs/produto/modulos-curso-e-profissional.md`).

| Módulo       | Área               | Papel no banco (`papel_usuario`) | Quem é                                |
| ------------ | ------------------ | -------------------------------- | ------------------------------------- |
| Profissional | Painel admin       | `plataforma`                     | Equipe do Licite Comigo               |
| Profissional | Empresa            | `admin` (e `operador`)           | Cliente que busca e filtra licitações |
| Profissional | Colaborador        | `colaborador`                    | Equipe de operação do Licite Comigo   |
| Curso        | Painel da mentoria | `plataforma` (só "ver como")     | Equipe do Licite Comigo               |
| Curso        | Aluno              | `aluno`                          | Aluno do curso / mentoria             |
| Curso        | Mentor             | `mentor`                         | Quem acompanha os alunos              |

O Painel da mentoria (`curso`) não tem papel próprio no banco: é a mesma equipe
(`plataforma`) trabalhando no módulo do curso.

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
`PANEL_URL_ALUNO` e, opcionalmente, `PANEL_URL_CURSO`, `PANEL_URL_MENTOR` e
`PANEL_URL_COLABORADOR`). É o mesmo aplicativo, mas em cada
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
- **API**: nos endereços de Empresa (e de Mentor/Colaborador, quando próprios) as rotas
  `/admin`, `/platform` e `/operations` não existem. Elas existem na Administração,
  na Administração da mentoria e, quando esta não tem endereço próprio, no endereço do Aluno (onde
  ela vive). O core-api exige o papel `plataforma` em cada uma, e o banco continua isolando por
  papel e por conta.
- **Links enviados**: convites, e-mails de confirmação, recuperação de senha e alertas apontam
  para o painel de quem recebe. Mentor sem endereço próprio usa o do Aluno.
- **Mentor**: faz parte do lado do curso. Sem `PANEL_URL_MENTOR`, entra pelo endereço do Aluno.
- **Administração da mentoria**: sem `PANEL_URL_CURSO`, vive no endereço do Aluno e só a equipe
  (`plataforma`) a vê; ao entrar ali a equipe cai na Administração da mentoria (`/gestao`). Com
  `PANEL_URL_CURSO`, ela ganha endereço próprio e o endereço do Aluno volta a ter só aluno e
  mentor.
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
| `/admin`, `/admin/*`, `/leads` (Administração)                                        |      sim      |   não   |  não  |  não   |     não     |
| `/gestao`, `/gestao/*` (Administração da mentoria; só a área `curso`)                 |      não      |   não   |  não  |  não   |     não     |
| `/painel`, `/conta`, `/ana`, `/onboarding`                                            |      sim      |   sim   |  sim  |  sim   |     sim     |
| `/radar`, `/pregoes`                                                                  |      sim      |   sim   |  sim  |  não   |     sim     |
| `/oportunidades`, `/agenda`, `/documentos`, `/buscas-salvas`, `/alertas`, `/empresas` |      sim      |   sim   |  não  |  não   |     sim     |
| `/academia`                                                                           |      sim      |   sim   |  sim  |  sim   |     sim     |
| `/mentor`, `/academia/mentor`                                                         |      sim      |   não   |  não  |  sim   |     não     |
| `/diagnostico`, `/encontros`                                                          |      sim      |   não   |  sim  |  não   |     não     |
| `/materiais`                                                                          |      sim      |   não   |  sim  |  sim   |     não     |
| `/admin/colaboradores`                                                                |      sim      |   não   |  não  |  não   |     não     |
| `/admin/equipe`, `/admin/usuarios/:id` (ficha do usuário)                             |      sim      |   não   |  não  |  não   |     não     |
| `/mentor/encontros`                                                                   |      sim      |   não   |  não  |  sim   |     não     |

Regras e menus ficam em `packages/shared/src/areas.ts`, com testes. As páginas conferem a
área no servidor; a API confere de novo.

## Rotas da API (papel × rota)

| Rota                                                                                                                               | plataforma | admin | operador | colaborador | mentor | aluno |
| ---------------------------------------------------------------------------------------------------------------------------------- | :--------: | :---: | :------: | :---------: | :----: | :---: |
| `GET /admin/leads`                                                                                                                 |     ✔      |       |          |             |        |       |
| `GET /admin/users/audit`                                                                                                           |     ✔      |       |          |             |        |       |
| `GET /operations/ingest`                                                                                                           |     ✔      |       |          |             |        |       |
| `GET /admin/coleta/status`, `POST /admin/coleta/run` (coleta nativa do PNCP)                                                       |     ✔      |       |          |             |        |       |
| `GET /users`                                                                                                                       |     ✔      |       |          |             |   ✔    |       |
| `GET /mentor/companies`, `GET /mentor/dashboard`                                                                                   |     ✔      |       |          |             |   ✔    |       |
| `GET /mentorado/dashboard`                                                                                                         |     ✔      |       |          |             |        |   ✔   |
| `GET /professional/dashboard`                                                                                                      |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET/POST /opportunities`, `GET/PATCH/DELETE /opportunities/:id`                                                                   |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET /checklist-models`, `POST /opportunities/:id/checklists`, `/checklists/*`, `/checklist-items/*`                               |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET /agenda`, `/agenda/prazos*`, `/tasks*`                                                                                        |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `GET/POST/PATCH/DELETE /empresa/documentos*`, `GET /empresa/inicio`                                                                |     ✔      |   ✔   |    ✔     |      ✔      |        |       |
| `DELETE /mentor/concessions/:id`                                                                                                   |     ✔      |       |          |             |        |       |
| `PATCH /me/view-as`                                                                                                                |     ✔      |       |          |             |        |       |
| `GET /platform/overview, /companies, /students, /mentors, /classes, /invitations`                                                  |     ✔      |       |          |             |        |       |
| `GET /platform/migracoes` (aviso de migrations por aplicar)                                                                        |     ✔      |       |          |             |        |       |
| `POST /platform/invitations` (+ `/:id/revoke`, `/:id/reissue`)                                                                     |     ✔      |       |          |             |        |       |
| `POST /platform/classes`, `PATCH /platform/classes/:id`                                                                            |     ✔      |       |          |             |        |       |
| `PATCH /platform/users/:id/active`                                                                                                 |     ✔      |       |          |             |        |       |
| `GET /admin/planos`, `PUT /admin/planos`, `GET /admin/financeiro`, `POST /admin/cobrancas/:id/liberar-manual`                      |     ✔      |       |          |             |        |       |
| `GET /admin/assinantes`, `POST /admin/assinaturas/:id/ajustar`, `GET/PUT /admin/cupons`, `POST /admin/integracoes/testar`          |     ✔      |       |          |             |        |       |
| `GET /aluno/progresso` (Academia, para qualquer área)                                                                              |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /platform/colaboradores`, `PUT /platform/colaboradores/:id/nichos`                                                            |     ✔      |       |          |             |        |       |
| `GET /platform/team`, `GET /platform/users/:id/ficha`, `PATCH /platform/users/:id`, `POST /platform/users/:id/password-reset-link` |     ✔      |       |          |             |        |       |
| `POST /billing/teste-gratis`                                                                                                       |            |   ✔   |          |             |        |       |
| `GET /billing/minha-assinatura`                                                                                                    |            |   ✔   |    ✔     |             |        |       |
| `POST /billing/assinar`, `POST /billing/cancelar`                                                                                  |            |   ✔   |          |             |        |       |
| `GET /precos/referencia` (preço de referência, Compras.gov.br)                                                                     |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /precos/itens` (itens do nicho com valor típico)                                                                              |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /precos/fechados` (pregões fechados: estimado × homologado)                                                                   |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `GET /editais/:id/resultados` (valor fechado e vencedor por item, PNCP)                                                            |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |
| `POST /editais/:id/detalhes/atualizar` (itens e documentos do PNCP)                                                                |     ✔      |   ✔   |    ✔     |      ✔      |   ✔    |   ✔   |

Rotas públicas da venda: `GET /public/planos`, `POST /public/checkout/curso` (limite por IP),
`POST /public/compra` (acompanha pelo código da compra), `POST /public/cupom/validar` (limite por IP) e `POST /webhooks/asaas` (confere o
token secreto, reconsulta o pagamento no Asaas e ignora evento repetido). Plano só limita a
conta que tem assinatura registrada: contas antigas continuam sem limite.

Rotas públicas do convite: `POST /auth/invitations/preview` e `POST /auth/invitations/accept`
(limite de tentativas por IP; resposta genérica para convite inválido).

## Usuários, ficha e senha (Administração)

- Cada tipo de usuário tem a sua página: Empresas clientes, Alunos e turmas, Mentores,
  Colaboradores e Equipe administrativa (grupo "Usuários" do menu). Em todas: **Ver ficha**,
  **Editar** (nome, e-mail de acesso e, para empresa, o nome da empresa), **Link de senha**,
  **Desativar/Reativar** e os convites de cadastro (**Novo link**, **Revogar**).
- **Link de senha**: `POST /platform/users/:id/password-reset-link` gera um link de uso único,
  válido por 48 horas, que abre `/password-reset` no painel da pessoa. O link só aparece na
  resposta (e vai por e-mail se o SMTP estiver ligado). Um novo link invalida o anterior. Conta
  desativada não recebe link. Fica registrado na auditoria da conta da pessoa.
- **Editar**: `PATCH /platform/users/:id`. A gravação roda dentro da conta da pessoa (como nos
  fluxos de autenticação); o e-mail novo precisa estar livre em todo o sistema e passa a ser o
  login. A senha não muda.
- **Ficha** (`GET /platform/users/:id/ficha`): dados, último acesso, uso por área nos últimos 30
  dias, nichos, buscas salvas e últimas buscas, oportunidades, alertas, conversas com a Ana
  (só contagem, nunca o conteúdo) e histórico. Para empresa, a ficha soma todos os usuários da
  conta.
- **Registro de uso** (migration 0029): `atividade_usuario` (entradas e uso por área e por dia) e
  `atividade_buscas` (termo e filtros das buscas do Radar e de Preços pagos). Não guarda
  documentos, mensagens da Ana nem senhas. Cada usuário só enxerga o próprio; a Administração lê
  tudo. Chamadas de fundo (sessão, avisos) não contam.
- **Senha**: mínimo de 8 caracteres, sem exigência de símbolos e sem limite prático (teto
  técnico de 1024 só para proteger o servidor). A regra vem de `packages/shared` e vale para
  cadastro, convite, redefinição e "Minha conta".

## Pontos de atenção

- A sessão (JWT) continua válida até vencer, mesmo se a conta for desativada. Para corte
  imediato, é preciso lista de sessões revogadas (item futuro).
- Depois de promover uma conta para `plataforma`, a pessoa precisa sair e entrar de novo
  para o token trazer o papel novo.
- Os links de Termos e Privacidade da página de convite apontam para o domínio do app; as
  páginas jurídicas vivem no site. Ajustar quando o texto jurídico estiver revisado.

## Escopo da equipe administrativa (migration 0031)

Cada conta `plataforma` tem um **escopo**: `tudo`, `curso` ou `profissional`.

- `tudo`: Painel admin e Painel da mentoria (quem já era da equipe continua assim).
- `profissional`: só o Painel admin (empresas, colaboradores, licitações). Não vê dinheiro nem contas do curso.
- `curso`: só o Painel da mentoria (alunos, mentores, vendas e cupons do curso).

O convite pede o acesso (padrão: `profissional`, o menor acesso). Só quem tem acesso total muda o
escopo de outra conta (Painel admin → Equipe administrativa). O servidor aplica o escopo em toda
rota administrativa (rota nova de admin sem regra fica negada para quem tem escopo) e o painel
errado manda a pessoa para o endereço certo. Antes da migration 0031 o sistema trata todos como `tudo`.

## Análise de oportunidades (`/analise`)

Disponível para Empresa, Colaborador e Painel admin. Ranking por foco (mais interessantes, mais
lucrativas, mais fáceis, melhor preço), comparação lado a lado de 2 a 4 editais e simulador de
proposta. As notas são **estimativas de apoio**, não previsão de vitória: o lucro usa a margem
informada e o desconto típico do órgão (≥3 pregões homologados; senão premissa de 10%), e o preço
é comparado à mediana do catálogo de itens (≥3 amostras).

## Meu perfil (Radar, Análise e Pregões)

O perfil (nichos, estados, faixa de valor e palavras de interesse) é preenchido uma vez, no topo
do Radar, e vira uma linha-resumo. Radar, Análise e Pregões publicados já filtram por ele
(caixa "Filtrar pelo meu perfil"; o filtro escolhido à mão vale mais que o perfil). Colaborador
não edita nichos: eles vêm do Painel admin. Listas longas mostram 10 itens por página.
