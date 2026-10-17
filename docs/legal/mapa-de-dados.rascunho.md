# RASCUNHO — Mapa de dados do Licite Comigo

**Status: RASCUNHO PARA REVISÃO POR ADVOGADO.**

| Dado/fluxo                  | Origem                     | Tabela/serviço             | Finalidade               | Destino externo                                     | Retenção proposta            |
| --------------------------- | -------------------------- | -------------------------- | ------------------------ | --------------------------------------------------- | ---------------------------- |
| nome, e-mail, papel, tenant | usuário/admin              | `usuarios`, core-api       | conta, RBAC, onboarding  | nenhum por padrão                                   | conta + prazo legal          |
| mensagem para Ana           | usuário                    | `ana_mensagens`, AI        | histórico e continuidade | provider de LLM somente se configurado e minimizado | `ANA_HISTORY_RETENTION_DAYS` |
| tool call da Ana            | AI                         | `ana_tool_calls`           | auditoria e segurança    | nenhum por padrão                                   | política de auditoria        |
| edital público e anexos     | PNCP/Compras.gov.br/upload | `editais`, `edital_chunks` | Radar e Reader           | provider LLM somente contexto mínimo aprovado       | ciclo do edital + política   |
| resultado da análise        | Reader                     | `analises_ia`              | apoio à leitura          | nenhum por padrão                                   | ciclo do edital + política   |
| tokens e chamadas           | AI                         | `uso_ia`                   | custo, abuso e cota      | nenhum por padrão                                   | período financeiro           |
| logs                        | serviços                   | observabilidade            | segurança e operação     | provedor de logs configurado                        | mínimo necessário            |

## Minimização

Antes de enviar contexto ao LLM, selecionar somente chunks necessários à pergunta, retirar CPF/e-mail quando não forem parte indispensável da tarefa e não incluir histórico completo por padrão. Logs usam mascaramento determinístico para CPF e e-mail. O Reader deve preservar evidência de página sem transformar conteúdo do PDF em instrução de sistema.

## Revisão pendente

Validar bases legais, transferências internacionais, provedores, suboperadores, prazos, eliminação, anonimização, classificação de documentos e controles de acesso antes do lançamento.
