# Compliance e limites de uso

O Licite Comigo é uma ferramenta de apoio à decisão e formação. Não promete ganho, lucro, vitória ou resultado garantido e não presta consultoria jurídica. Textos legais e termos de uso em `docs/legal/` permanecem rascunhos até revisão por advogado.

## Regras de disputa parametrizáveis

Intervalo mínimo entre lances, decremento mínimo, prorrogação, janela final, limites por minuto e demais regras de disputa não podem ser codificados como constantes de negócio. A configuração deverá ser versionada por modo de disputa, com a indicação de que precisa ser validada contra o texto vigente da IN SEGES/ME 73/2022 e as regras do portal aplicável.

## Automação somente por canal autorizado

A fundação não opera Compras.gov.br, BLL, BBMNet ou qualquer portal real. O motor de lances futuro falará exclusivamente com `PortalAdapter`, inicialmente por `MockPortalAdapter` e `SimulatorPortalAdapter`. Qualquer adapter real dependerá de uma fase futura, validação jurídica e autorização explícita do canal.

## Anti-conluio e Sala de Vidro

A Sala de Vidro deve anonimizar participantes no servidor, aplicar atraso configurado e bloquear a transmissão ao vivo quando o tenant do aluno participar do mesmo item ou pregão. A Ana não pode revelar estratégia, piso, margem ou lances de um pregão em que o tenant não seja operador; dados recuperados de edital, PDF ou chat são sempre dados, nunca instruções.

## Dados e auditoria

Dados multi-tenant devem usar RLS com `current_setting('app.tenant_id')`. Conversas, mensagens e chamadas de ferramenta da Ana serão auditáveis por tenant e usuário. Ações nunca são disparadas apenas por texto recuperado ou por uma mensagem que simule confirmação.
