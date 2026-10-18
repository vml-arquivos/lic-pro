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
6. Expandir o radar como produto de evidências: PNCP como fonte primária, Compras.gov.br como enriquecimento federal, filtros locais versionados, proveniência, buscas salvas, alertas in-app idempotentes e painéis separados por capacidade.

## Estrutura

- `services/core-api/src/config.ts`: contrato de configuração e bloqueio de combinação insegura.
- `services/core-api/tests/config.test.ts`: testes da política de produção.
- `apps/web/app/AppShell.tsx`: navegação funcional e acesso admin.
- `apps/web/app/workspace/HomeWorkspace.tsx`: home autenticada sem cartões demonstrativos em produção.
- `apps/web/app/(rotas)`: páginas funcionais e páginas demo condicionadas.
- `apps/web/public/manus-routes.json`: manifesto público das rotas reais.
- `apps/site/app/page.tsx`: home institucional.
- `apps/site/app/layout.tsx`, `robots.ts`, `sitemap.ts`: SEO técnico e metadados.
- `db/migrations/0013_feature_expansion.sql`: campos canônicos de fontes, documentos/eventos, buscas, alertas e checkpoints retomáveis.
- `services/ingest/src/clients.py`, `normalizer.py`, `storage.py`, `control.py`: conectores PNCP públicos, normalização sem inferência e persistência retomável.
- `services/core-api/src/search.ts`, `alerts.ts`, `capabilities.ts`, `server.ts`: filtros nacionais, alertas in-app e autorização por papel/escopo.
- `apps/web/app/components/ProtectedRemoteDashboard.tsx` e rotas de `admin`, `mentor`, `mentorado`, `profissional`, `alertas` e `buscas-salvas`: painéis reais sem dados fictícios.

## Estado após publicação

- A imagem funcional implantada em produção corresponde ao commit `65777a4`, com CI verde (`39141418481`) antes do deploy; o `main` recebeu depois o commit documental `843ebc3`. Os commits funcionais incluem o tratamento de `204 No Content` na paginação PNCP e a evolução de nichos, selects e painéis.
- A migration `0014_user_niche_preferences.sql` foi aplicada no deployment `3u9ssql4nonjobvh4me8gdst`; `licite-core-api` (`jmxla5ryeqjoeqeajf9e4eme`) e `licite-web` (`jbqyb69aiup7ew8vcctmi3hl`) terminaram com `Success` no Coolify. `licite-site` permanece saudável, sem alteração nesta etapa.
- `https://apilicitecomigo.buscarr.com.br/health` e `/ready` respondem com banco e Redis prontos.
- `https://applicitecomigo.buscarr.com.br/health` responde com o web saudável.
- Canonical, Open Graph, robots e sitemap do site usam `https://licitecomigo.buscarr.com.br`.
- SMTP continua adiado e o cadastro aberto permanece bloqueado; contas cliente/mentor dependem dos e-mails e concessões que ainda serão informados.
- RabbitMQ, ingest HTTP, scheduler e worker permanecem privados e `Running`; uma execução controlada do scheduler concluiu o checkpoint PNCP sem erro, com 25 editais já persistidos com `fonte='pncp'`.
- A IA não foi criada em produção: falta provider real de LLM/embeddings e credencial autorizada; não usar providers falsos, determinísticos ou o adapter OpenAI ainda não implementado.

## Evolução aprovada — nichos, filtros e painéis

O Radar terá filtros exclusivamente por seleção: de um a três nichos, UF, esfera, modalidade, modo de disputa, situação, instrumento, fonte, CATMAT/CATSER observado e prazo. Os nichos serão preferências de descoberta com origem declarada; não provam CNAE, habilitação ou elegibilidade. As preferências serão preenchidas no cadastro/onboarding e usadas como escopo padrão de Radar, buscas salvas e alertas.

O menu exporá somente rotas reais de Radar, pregões publicados, oportunidades salvas, alertas, buscas, empresas, Academia, Ana e painéis autorizados. A troca de contexto entre iniciante, mentorado e profissional será apenas uma preferência de jornada; não concederá papel técnico, empresa, concessão ou acesso tenant-wide. Módulos demo continuarão fora do menu em produção. A pesquisa e a implementação estão registradas em `docs/research/nichos-filtros-paineis-2026-10.md`.

## Expansão pesquisada

O blueprint versionado em `docs/research/expansao-fontes-paineis-2026-10.md` registra as fontes oficiais, limites de consulta, fronteiras de automação e o desenho de capacidades. O produto não deve prometer pregão em tempo real, lance, chat, proposta, scraping autenticado ou cobertura nacional sem contrato/fonte autorizada. O rótulo operacional para o baseline é “última captura” ou “atualização observada”, não “ao vivo”.
