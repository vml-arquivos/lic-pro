# TODO — entrega funcional e publicação

## 1. Formatação e CI

- [x] Rodar `prettier --write` somente em `apps/web/app/AppShell.tsx`, `apps/web/app/ana/AnaWidget.tsx`, `apps/web/app/globals.css`, `apps/web/app/workspace/HomeWorkspace.tsx`, `apps/web/app/workspace/ModulePage.tsx` e `services/core-api/src/config.ts`.
- [x] Publicar essa formatação em commit separado.
- [x] Confirmar `format:check`, lint, typecheck, testes e build; acompanhar a CI verde.

## 2. Proteção de configuração do core-api

- [x] Em produção, recusar iniciar quando `EMAIL_PROVIDER=disabled` e `SIGNUP_ENABLED=true`.
- [x] Expor mensagem clara explicando que cadastro aberto precisa de envio de e-mail configurado, ou que o cadastro deve ser desativado.
- [x] Acrescentar teste automatizado para a combinação proibida e para combinações válidas.
- [x] Publicar a proteção em commit separado antes do deploy.

## 3. Escopo funcional sem dados fictícios

- [x] Manter no menu e no manifesto somente Início, Explorar licitações/Radar, Empresas, Leads para admin, Academia e ANA.
- [x] Manter Onboarding fora do menu, mas disponível no fluxo real.
- [x] Fazer automações, aprovações, jornada, oportunidade, edital, precificação, documentos, pregões, mercado, agenda, fornecedores, plano de 30 dias, mentoria e assinatura aparecerem apenas com `DEMO_MODE=true`.
- [x] Sem `DEMO_MODE`, as rotas experimentais devem responder 404; sem cartões com números, exemplos ou objetos demonstrativos na produção.
- [x] Exibir o alternador de público somente com `DEMO_MODE=true`.
- [x] Publicar o gating em commit separado.

## 4. Site institucional e SEO

- [x] Remover faixa de rascunho, slogan genérico e linguagem que pareça texto de IA.
- [x] Reescrever a home com headline objetiva, benefícios verificáveis, três passos, CTA para app/lista e FAQ curto.
- [x] Não exibir prova social, números, fotos ou resultados sem fonte real.
- [x] Definir metadata por rota pública, canonical absoluto, Open Graph, Twitter Card, robots com bloqueio de `/api/` e sitemap somente com páginas públicas reais.
- [x] Confirmar HTML inicial com conteúdo, status HTTP e documentos SEO servidos pelo domínio institucional.

## 5. Deploy e operação

- [x] Confirmar CI verde no commit final.
- [x] Publicar core-api e validar `/health` e `/ready`.
- [x] Manter SMTP adiado; não habilitar signup aberto enquanto o e-mail estiver desativado.
- [x] Publicar web/site e validar HTTPS, domínio, health do web e as rotas públicas de Leads e Academia/mentor.
- [x] Criar ou confirmar o administrador existente somente depois do core-api saudável.
- [x] Preservar todos os recursos do Coolify, inclusive `licite-db`.
- [ ] Provisionar contas separadas de cliente e mentor e suas concessões quando os respectivos e-mails forem informados; o signup permanece fechado enquanto SMTP estiver adiado.

## 6. Radar nacional, alertas e painéis por perfil

- [x] Pesquisar PNCP, Compras.gov.br Dados Abertos e referências de mercado sem copiar APIs ou automatizar operações autenticadas.
- [x] Registrar no blueprint a matriz de fontes, limites, proveniência, fronteiras de “pregão ao vivo” e capacidades por perfil.
- [x] Criar migration idempotente para campos canônicos de contratação, eventos/documentos, buscas salvas, regras/entregas de alertas e checkpoints retomáveis.
- [x] Ampliar o cliente PNCP para publicação, atualização e proposta com paginação 10–50, hash de consulta e retomada pela próxima página.
- [x] Persistir os campos observáveis do PNCP sem transformar ausência, sigilo ou atraso em valor inventado.
- [x] Expor filtros nacionais no Radar, buscas salvas, alertas in-app idempotentes e painéis protegidos para admin, operação, empresário, mentorado e mentor.
- [x] Manter o alternador de contexto dependente de público autorizado e sem concessão de acesso no cliente.
- [ ] Aplicar a migration 0013 em produção e verificar RLS/grants com uma consulta de integração no pgvector.
- [ ] Publicar os commits separados após CI verde e redeployar core-api/web; revalidar endpoints, painel e health/readiness no Coolify.
- [ ] Criar o job assíncrono de documentos, resultados, retificações, prazos 7/3/1 dias e entrega por outbox; SMTP continua fora desta etapa.
- [ ] Só anunciar “pregões ao vivo” após feed oficial autorizado; até lá, exibir status publicado, última captura e link para o portal oficial.
