# MVP 1 — fluxos e limites

## Sessão e conta

`/login` usa `POST /api/auth/login`, que encaminha para o core API e grava o JWT em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. O token carrega `sub`, `tenantId`, `empresaId` quando houver vínculo, `role`, `exp`, issuer e audience. O seed local só executa com `DEMO_MODE=true`; sua senha demo não é uma credencial de produção.

O onboarding (`/onboarding`) salva perfil de jornada e respostas no core API. O diagnóstico (`/me/diagnostico`) e o vínculo de empresa definem o contexto operacional, mas não substituem autorização RBAC nem RLS.

## Empresa, mentor e pipeline

Uma empresa é identificada por CNPJ normalizado, pertence a um tenant e pode ter vários usuários. Um mentor não ganha acesso por estar no mesmo tenant: um admin precisa criar `POST /mentor/concessions` com `mentor_id`, `empresa_id` e escopo. O painel `/academia/mentor` consulta somente `/mentor/dashboard` e `/mentor/companies`.

O Radar busca editais ingeridos em `/api/core/editais`. O detalhe permite salvar `POST /api/core/opportunities`, alterar status e observações, consultar checklists/prazos/tarefas e manter o link da fonte oficial. O MVP não envia proposta, não publica lance e não acessa portais externos.

## Reader e correção

O upload passa por `/api/reader/ingest`, com limite de bytes/páginas, timeout e tenant derivado do JWT. A pergunta da análise passa por `/api/reader/analyze` sem aceitar `tenant_id` ou `user_id` do corpo como identidade. Cada evidência carrega página, trecho, fonte, confiança e status de validação. Correções do edital ou de um chunk passam pelo core API e entram na auditoria com request ID; a fonte original permanece consultável.

OCR não é inferido: sem worker configurado, `ocr_enabled=true` retorna `ocr_not_configured`. O provider fake/determinístico é permitido apenas em desenvolvimento/testes; o boot de produção falha se continuar configurado.

## Academia e demo

A Academia usa `rascunho_para_revisao` até que o conteúdo seja aprovado editorialmente. A interface mostra o aviso de revisão e, com `DEMO_MODE=true`, também exibe que os dados são apenas demonstrativos. O sistema não publica automaticamente conteúdo de ensino nem transforma uma explicação em orientação jurídica.
