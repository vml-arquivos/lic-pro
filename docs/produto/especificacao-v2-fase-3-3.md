# CONTEXTO

Projeto Licite Comigo (monorepo pnpm; apps/web, services core-api, ai, ingest, bid-engine, realtime-gw; Postgres 16 + pgvector, Redis, RabbitMQ). MVP 1 entregue. A produção será no Coolify com **um recurso por serviço, build por Dockerfile (SEM Docker Compose em produção)**. Execute a **FASE 3.3** abaixo e PARE ao final. Não inicie o MVP 2.

# REGRAS

Um commit por item, Conventional Commits em português, `git push origin main` ao final. Sem segredos no repositório. Você não tem acesso ao Coolify nem ao servidor. Sem automação de portais reais e sem lances. Textos em português do Brasil. Seja honesto sobre o que já existia e o que não testou.

# A) DEPLOY POR DOCKERFILE

A1. Dockerfiles prontos para produção, com contexto na raiz do repositório, multi-stage, usuário não-root, porta lida de env, `HEALTHCHECK` compatível: `apps/web`, `apps/site` (novo), `services/core-api`, `services/ai`, `services/ingest` (HTTP), `services/ingest/Dockerfile.worker`, `services/ingest/Dockerfile.scheduler`, `db/Dockerfile.migrate`.
A2. `db/Dockerfile.migrate`: imagem com psql + migrations; aplica as migrations com advisory lock, provisiona as roles de aplicação e suas senhas por env, e termina com código 0. Opção `MIGRATE_IDLE_AFTER=true` mantém o container ocioso após o sucesso (para o Coolify não reiniciar em loop). Nunca roda dentro de outro serviço.
A3. Todo serviço HTTP expõe `/health` e `/ready`. Worker e scheduler não têm HTTP; documente isso.
A4. Em produção, falhar no boot com mensagem listando as variáveis obrigatórias ausentes; sem fallback silencioso para provider falso. Nenhuma URL ou segredo hardcoded; variáveis `NEXT_PUBLIC_*` só se inevitável, documentando como build arg.
A5. Mover o antigo `docker-compose.prod.yml` para `infra/reference/` (marcado "não usado em produção"). Manter o compose de desenvolvimento.
A6. Reescrever `infra/coolify/README.md` para o fluxo por recurso: tabela (recurso, Dockerfile, Base Directory, porta, domínio, health, variáveis), ordem de criação, URLs internas dos bancos, uso de imagem `pgvector/pgvector:pg16`, backups, caminhos monitorados para evitar rebuild de tudo, checklist de verificação pós-deploy com comandos para o terminal do Coolify (inclusive consulta de `pg_roles`).
A7. Teste de CI que falha se uma variável lida por um serviço não estiver no `.env.example`, com a lista de quais serviços usam cada variável.

# B) CONTAS E ACESSO

B1. Comando one-shot `pnpm admin:bootstrap` que cria o primeiro tenant e admin por env (`BOOTSTRAP_TENANT_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`): idempotente, recusa senha fraca, não usa o seed demo, não loga senha.
B2. Cadastro self-service atrás de `SIGNUP_ENABLED` (padrão false): cria tenant + usuário admin; verificação de e-mail; recuperação de senha; aceite de Termos e Privacidade com versão e data registradas; senha forte; rate limit; sem enumeração de usuários; auditoria. Provider de e-mail por env (SMTP); `fake` só em desenvolvimento.
B3. Login por e-mail e senha, sem pedir tenant ID na interface (resolver o tenant com segurança; se o e-mail existir em mais de um tenant, o usuário escolhe). O login com tenant ID pode continuar apenas para o seed demo.

# C) SITE INSTITUCIONAL (apps/site)

C1. Next.js em recurso próprio, domínio `SITE_URL`, link para o app em `APP_URL`. Páginas: Início, Para quem é (Empresário, Mentorado, Iniciante), Como funciona (3 passos), Recursos (Radar de licitações, Análise de edital com fontes, Ana, Agenda e prazos), Mentoria de 30 dias (sem promessa de resultado), Planos (placeholder claro até definição), Perguntas frequentes, Sobre, Contato, Termos e Privacidade (rascunhos para revisão jurídica).
C2. Conversão: CTAs em toda a página; formulário de lead (nome, e-mail, WhatsApp, perfil, consentimento LGPD); botão de WhatsApp por link (`WHATSAPP_NUMBER`, sem API); CTA "Entrar" para `APP_URL`; CTA "Criar conta" só aparece com `SIGNUP_ENABLED` e, caso contrário, vira "Entrar na lista de espera". Captura de UTM e origem.
C3. Leads: endpoint público `POST /public/leads` na core-api, com role/grant de INSERT apenas em tabela `leads` (sem leitura pública), honeypot, rate limit por IP, validação, deduplicação por e-mail em janela, auditoria, e consentimento registrado. Lista de leads no painel admin do app. Notificação por e-mail opcional por env.
C4. Honestidade obrigatória: NÃO inventar depoimentos, números, logos de clientes, prêmios ou garantias. Blocos de prova social só renderizam com conteúdo real configurado. Sem promessa de ganho, lucro, vitória ou contrato. O slogan fica em variável de brand marcada "rascunho para revisão jurídica". Aviso: ferramenta de apoio, não é consultoria jurídica.
C5. Técnica: SEO (metadata, sitemap.xml, robots.txt, canonical, Open Graph, JSON-LD de Organization e FAQPage), responsivo, acessível, alvo de Lighthouse mobile ≥ 90 (relate o resultado medido, sem inventar), banner de cookies e analytics opcionais por env sem rastreamento antes do consentimento. Usar apenas tokens de `packages/ui/brand/`.

# D) SEGURANÇA DO BANCO (migration 0008)

D1. Garantir INSERT e UPDATE em `concessoes_mentor` para criar e revogar via endpoint, com teste.
D2. Escopo por empresa em `checklist_itens` e `rotina_execucoes` (coluna `empresa_id` ou policy via tabela-mãe) e revisão da policy de `notificacoes`; testes: usuário da empresa A não lê dados da B no mesmo tenant; mentor sem concessão não lê nada.
D3. Confirmar e documentar em ADR se `editais` é global; se a ingestão roda por tenant, refatorar para ingestão única por fonte/modalidade/janela, e reavaliar `edital_versoes`.
D4. Alinhar `usuarios.publico` a `empresa | mentoria`, deixando "mentor" só no RBAC, com migração dos dados e testes.

# E) INTERFACE DO APP

Copie o protótipo v2 e a especificação (anexos) para `docs/produto/`. Aplique o shell do protótipo (sidebar escura, topbar, Início com as 8 ações e destaque "ANA recomenda", chip flutuante da Ana, Central de Automações e Aprovações) usando tokens em `packages/ui/brand/`: navy #10273b, teal #0f937f, mint #dff9ef, ink #172a37, muted #718191, line #dce5ea, bg #f4f7f8, acento do logo #57deb9, gradiente #102d42 → #176c69, cabeçalho da Ana #0e6f67, fonte Inter com fallback Segoe UI/Arial. O menu mostra só o que existe; o resto é "Em breve". Proibido em produção: "Aprovar simulação", dados fictícios sem DEMO_MODE e "tempo real" sem integração.

# FINAL

Rode lint, testes e build de todos os workspaces (Node e Python) e construa cada Dockerfile localmente para confirmar que a imagem sobe e responde `/health`. Informe o que foi feito por item, o que já existia, comandos para testar, hashes dos commits, confirmação do push e pendências. Depois PARE.
