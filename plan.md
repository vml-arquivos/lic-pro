# Plano — escopo funcional, proteção de produção e site institucional

## Objetivo

Publicar somente o que funciona hoje no Licite Comigo. O app deve oferecer Início, Radar, Empresas, Leads para administradores, Academia e ANA. Onboarding permanece acessível por fluxo interno, mas fora do menu principal. As telas ainda demonstrativas só podem ser acessadas com `DEMO_MODE=true`.

O site institucional será reescrito com comunicação objetiva, visual claro e teal/verde como ação, inspirado na estrutura enxuta observada em https://lisix.com.br/ sem copiar textos, marca ou ativos. A página não exibirá slogans genéricos, números, depoimentos ou dados que não existam.

## Design

- **Movimento:** SaaS editorial de mercado público, leve, funcional e orientado à decisão.
- **Princípios:** clareza antes de persuasão; poucas escolhas por tela; fontes e limites explícitos; dados reais separados de demonstrações.
- **Cor:** fundo branco e cinza muito claro para leitura; azul-marinho para confiança e rodapé; teal/verde para CTAs e estados de ação.
- **Layout:** header curto, hero em duas colunas, blocos editoriais com bastante respiro, cartões apenas quando ajudam a comparar e faixa escura final.
- **Assinaturas:** botão teal de ação, pequenos rótulos em caixa alta e painéis com bordas finas; sem ornamentos que pareçam produto não implementado.
- **Interação:** links levam a telas funcionais; qualquer recurso experimental fica condicionado a `DEMO_MODE` e identificado apenas em desenvolvimento.
- **Tipografia:** Inter, pesos 400–800, títulos curtos e sem superlativos; corpo com largura confortável.
- **Posicionamento:** apoio para organizar oportunidades, fontes, editais e próximos passos em licitações públicas brasileiras.
- **Voz:** direta, sóbria e útil. Exemplos: “Encontre oportunidades compatíveis” e “Leia o edital com a fonte ao lado”.

## Implementação

1. Formatar os seis arquivos que reprovam o `format:check` e publicar em commit próprio.
2. Proteger o `core-api` contra `NODE_ENV=production`, `EMAIL_PROVIDER=disabled` e `SIGNUP_ENABLED=true`, com teste unitário e mensagem de inicialização explícita.
3. Restringir menu, manifesto e rotas do app às capacidades reais. Páginas experimentais devolverão 404 fora do modo demo; o alternador de público seguirá a mesma regra.
4. Reescrever a home do site, metadata, sitemap e robots com conteúdo público real e sem texto de rascunho.
5. Confirmar checks locais e CI verde antes de qualquer deploy. Depois publicar core-api, site e web no Coolify e verificar saúde pública.

## Estrutura

- `services/core-api/src/config.ts`: contrato de configuração e bloqueio de combinação insegura.
- `services/core-api/tests/config.test.ts`: testes da política de produção.
- `apps/web/app/AppShell.tsx`: navegação funcional e acesso admin.
- `apps/web/app/workspace/HomeWorkspace.tsx`: home autenticada sem cartões demonstrativos em produção.
- `apps/web/app/(rotas)`: páginas funcionais e páginas demo condicionadas.
- `apps/web/public/manus-routes.json`: manifesto público das rotas reais.
- `apps/site/app/page.tsx`: home institucional.
- `apps/site/app/layout.tsx`, `robots.ts`, `sitemap.ts`: SEO técnico e metadados.

## Estado após publicação

- Código publicado no `main` até `d4ad468`, com CI verde antes do deploy.
- `licite-core-api`, `licite-web` e `licite-site` estão saudáveis no Coolify.
- `https://apilicitecomigo.buscarr.com.br/health` e `/ready` respondem com banco e Redis prontos.
- `https://applicitecomigo.buscarr.com.br/health` responde com o web saudável.
- Canonical, Open Graph, robots e sitemap do site usam `https://licitecomigo.buscarr.com.br`.
- SMTP continua adiado e o cadastro aberto permanece bloqueado; contas cliente/mentor dependem dos e-mails e concessões que ainda serão informados.
