# Mapa de acessos e painéis

Cinco áreas separadas. Cada pessoa vê só a sua. Com endereços por painel (veja
`docs/permissoes.md`, "Endereços por painel"), cada área tem a sua porta:

| Painel           | Endereço sugerido                           | Quem entra                          |
| ---------------- | ------------------------------------------- | ----------------------------------- |
| Administração    | `admin.seudominio`                          | Equipe do Licite Comigo             |
| Empresa          | `app.seudominio`                            | Empresas assinantes                 |
| Aluno (e Mentor) | `aluno.seudominio`                          | Alunos do curso e mentores          |
| Colaborador      | `equipe.seudominio` (ou o da Administração) | Equipe de operação do Licite Comigo |

Sem esses endereços, a equipe pode "ver como" cada área no mesmo endereço.

## Administração (equipe do Licite Comigo)

Menu: Visão geral · Leads · Empresas clientes · Alunos e turmas · Mentores · Colaboradores · Fontes de dados · Financeiro · Planos e preços · Assinantes · Cupons · Auditoria.
Também acessa Radar, Academia, Ana e a própria conta.

- **Visão geral**: empresas clientes, alunos e mentores ativos, convites pendentes, leads,
  editais no catálogo, uso (buscas, alertas, Ana) e situação da coleta.
- **Empresas clientes**: convidar empresa (um usuário por empresa), ver nichos, uso e situação;
  ativar/desativar.
- **Alunos e turmas**: criar turma (com mentor), matricular aluno (gera convite), acompanhar
  progresso, reenviar ou revogar convites. Cada turma tem prazo de acesso, prazo de mentoria e
  link do grupo de conversa. Aluno com prazo vencido fica só com leitura e o aviso de renovar.
- **Materiais**: biblioteca do aluno (guias, checklists, modelos, listas, lei). "Carregar catálogo
  inicial" traz os itens do curso sem mexer no que já existe. Item sem texto e sem link fica
  oculto até a equipe anexar o link do arquivo.
- **Mentores**: convidar, ver alunos ativos, ativar/desativar.
- **Fontes de dados**: coleta de editais do governo (PNCP) com botão "Sincronizar agora", últimas execuções, editais no catálogo, abertos e novos em 24 h.
- **Financeiro**: receita do mês e de 30 dias, receita recorrente (MRR), assinantes ativos e em
  atraso, vendas do curso, conversão, cobranças recentes e liberação manual (Pix fora do sistema).
- **Planos e preços**: preço, benefícios e limites do curso e das assinaturas; ativar para vender.
- **Assinantes**: quem está em teste, ativo, em atraso ou encerrado; estender o teste, cancelar ou
  reativar de cortesia.
- **Cupons**: criar código de desconto (percentual ou valor fixo), por plano, com limite de usos e
  validade; ver quantos usos e pagamentos.
- **Auditoria**: ações da administração e do "ver como".
- **Leads**: contatos captados pelo site.

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
Documentos · Pregões publicados · Preços de referência · Dados da empresa · Academia · Ana ·
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

1. A Administração cria a turma e gera o convite (empresa, aluno, mentor ou colaborador).
2. O link vale 7 dias, é de uso único e aparece só na criação. Funciona sem e-mail configurado;
   quando o e-mail estiver ativo, o convite também é enviado.
3. A pessoa abre o link, aceita os termos, cria a senha e entra na própria área.

## Fica para as próximas fases

- Catálogo global de editais (hoje compartilhado a partir da conta da plataforma).
- Equipe dentro da empresa (vários usuários e papéis).
- Mais limites por plano (hoje só buscas salvas) e nota fiscal.
- Revogação imediata de sessão.
