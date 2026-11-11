# Mapa de acessos e painéis

Dois módulos, cada um com a sua administração (veja `modulos-curso-e-profissional.md`). Cada
pessoa vê só a sua área. Com endereços por painel (veja `docs/permissoes.md`, "Endereços por
painel"), cada área tem a sua porta:

| Módulo       | Painel                                 | Endereço sugerido                           | Quem entra                          |
| ------------ | -------------------------------------- | ------------------------------------------- | ----------------------------------- |
| Profissional | Administração profissional             | `admin.seudominio`                          | Equipe do Licite Comigo             |
| Profissional | Empresa                                | `app.seudominio`                            | Empresas assinantes                 |
| Profissional | Colaborador                            | `equipe.seudominio` (ou o da Administração) | Equipe de operação do Licite Comigo |
| Curso        | Aluno, Mentor e Administração do curso | `mentoria.seudominio`                       | Alunos, mentores e a equipe         |

Sem esses endereços, a equipe pode "ver como" cada área no mesmo endereço.

## Administração profissional (equipe do Licite Comigo)

Menu: Visão geral · Leads de empresas · Fontes de dados · Financeiro · Assinantes · Cupons ·
Planos e preços · Auditoria · Empresas clientes · Colaboradores · Equipe administrativa.
Também acessa Radar, Academia, Ana e a própria conta.

- **Visão geral**: empresas clientes, leads de empresas, editais no catálogo, uso (buscas,
  alertas, Ana) e situação da coleta. Mostra um aviso quando o banco está desatualizado
  (migrations por aplicar).
- **Empresas clientes**: convidar empresa (um usuário por empresa), ver nichos, uso e situação;
  ativar/desativar.
- **Fontes de dados**: coleta de editais do governo (PNCP) com botão "Sincronizar agora", últimas execuções, editais no catálogo, abertos e novos em 24 h.
- **Financeiro**: receita do mês e de 30 dias, receita recorrente (MRR), assinantes ativos e em
  atraso, conversão, cobranças recentes das assinaturas e liberação manual (Pix fora do sistema).
  Só dinheiro das empresas.
- **Planos e preços**: preço, benefícios e limites das assinaturas; ativar para vender.
- **Assinantes**: quem está em teste, ativo, em atraso ou encerrado; estender o teste, cancelar ou
  reativar de cortesia.
- **Cupons**: códigos de desconto das assinaturas (percentual ou valor fixo), com limite de usos e
  validade; ver quantos usos e pagamentos.
- **Auditoria**: ações das duas administrações e do "ver como".
- **Leads de empresas**: contatos de empresas captados pelo site.
- **Colaboradores e Equipe administrativa**: convites, nichos liberados, ficha e senha.

## Administração do curso (a mesma equipe, no módulo do curso)

Menu: Visão geral · Leads de alunos · Vendas do curso · Cupons do curso · Preço do curso ·
Alunos e turmas · Mentores · Materiais · Encontros ao vivo. Também acessa Academia, Ana e a
própria conta. Páginas em `/gestao`.

- **Visão geral**: alunos ativos, turmas, mentores, convites pendentes, leads de alunos.
- **Alunos e turmas**: criar turma (com mentor), matricular aluno (gera convite), acompanhar
  progresso, reenviar ou revogar convites. Cada turma tem prazo de acesso, prazo de mentoria e
  link do grupo de conversa. Aluno com prazo vencido fica só com leitura e o aviso de renovar.
- **Materiais**: biblioteca do aluno (guias, checklists, modelos, listas, lei). "Carregar catálogo
  inicial" traz os itens do curso sem mexer no que já existe. Item sem texto e sem link fica
  oculto até a equipe anexar o link do arquivo.
- **Mentores**: convidar, ver alunos ativos, ativar/desativar.
- **Vendas do curso**: receita do curso, vendidos, aguardando pagamento, conversão, cobranças
  recentes e liberação manual. Só dinheiro do curso.
- **Preço do curso** e **Cupons do curso**: só o plano do curso; o cupom criado ali só vale
  para ele.
- **Leads de alunos**: interessados no curso (perfis mentorado e iniciante).
- Antigos endereços `/admin/alunos`, `/admin/mentores` e `/admin/materiais` redirecionam para cá.

## Empresa

Menu: Início · Explorar licitações · Buscas salvas · Alertas · Oportunidades · Pregões
publicados · Preços · Dados da empresa · Academia · Ana · Assinatura · Minha conta.

Radar limitado a 1–3 nichos. Começa vazio e se preenche com o catálogo coletado.

## Aluno

Menu: Início · Meu diagnóstico · Plano de 30 dias · Academia · Materiais · Praticar com editais ·
Mentoria · Encontros ao vivo · Certificado · Explorar licitações · Pregões publicados · Preços ·
Ana · Minha conta.
A compra do curso é pública em `/curso`; ao pagar, a pessoa recebe o link para criar a senha.

O painel mostra progresso, avisos e nichos de prática. Entra só por matrícula.

- **Diagnóstico**: o aluno diz se vai atuar como fornecedor ou como assessor em licitações e
  responde perguntas do ponto de partida. O mentor vê as respostas na ficha do aluno.
- **Materiais**: lê a biblioteca por etapa (começar, encontrar, documentos, proposta, sessão, depois
  de ganhar, assessor, leis). O caminho escolhido no diagnóstico mostra primeiro o que serve a ele.
- **Encontros ao vivo**: agenda dos encontros em grupo da turma, com link e atalho para o grupo.

## Mentor

Menu: Início · Meus alunos · Devolutivas · Sessões · Encontros ao vivo · Academia · Materiais ·
Ana · Minha conta.

O painel mostra os alunos vinculados, quem está sem estudar há 7 dias e o progresso.
Em Encontros ao vivo o mentor marca o encontro (para uma turma ou todas); os alunos são avisados.

## Colaborador (equipe de operação do Licite Comigo)

Menu: Início · Explorar licitações · Buscas salvas · Alertas · Oportunidades · Agenda ·
Documentos · Pregões publicados · Preços pagos · Dados da empresa · Academia · Ana ·
Minha conta.

O Licite Comigo também atua com licitações: o colaborador busca, consulta e acompanha editais
em nome da operação, dentro da conta da plataforma, sem ver financeiro, leads, cobrança, outras
contas nem o curso.

- **Nichos travados**: a Administração libera os nichos de cada colaborador em Administração →
  Colaboradores. O Radar, os Pregões e as buscas só mostram esses nichos; ele não os troca.
- **Avisos por nicho**: em Alertas, marca por nicho o que quer receber (aberturas, mudanças no
  edital, prazos chegando e sessão ao vivo). Empresas clientes têm a mesma tela.
- **Sessão ao vivo**: aviso 1 hora antes, 15 minutos antes e no começo da sessão de disputa.
  Lances e chat do pregoeiro em tempo real dependem de integração com o portal (fase futura).
- **Primeiro uso**: cadastrar o CNPJ do Licite Comigo em Dados da empresa; sem ele não há onde
  salvar oportunidades, agenda e documentos.

## Como a pessoa entra

1. A Administração cria a turma e gera o convite (empresa, aluno, mentor, colaborador ou administrador).
2. O link vale 7 dias, é de uso único e aparece só na criação. Funciona sem e-mail configurado;
   quando o e-mail estiver ativo, o convite também é enviado.
3. A pessoa abre o link, aceita os termos, cria a senha (mínimo de 8 caracteres) e entra na própria área.
4. Quem esqueceu ou perdeu o acesso recebe da Administração um link de nova senha, pela ficha ou
   pela lista do seu tipo de usuário.

## Fica para as próximas fases

- Catálogo global de editais (hoje compartilhado a partir da conta da plataforma).
- Equipe dentro da empresa (vários usuários e papéis).
- Mais limites por plano (hoje só buscas salvas) e nota fiscal.
- Revogação imediata de sessão.
