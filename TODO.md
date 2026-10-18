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
