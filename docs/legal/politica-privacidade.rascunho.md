# RASCUNHO — Política de Privacidade do Licite Comigo

**Status: RASCUNHO PARA REVISÃO POR ADVOGADO. Não publicar como política definitiva.**

Este documento descreve uma proposta inicial de tratamento de dados para a plataforma. A redação final, bases legais, prazos e canais devem ser revisados por profissional habilitado antes de qualquer uso público.

## Dados tratados

- identificação de conta: nome, e-mail, tenant, perfil de jornada, papel e onboarding;
- dados de uso: conversas com Ana, mensagens, chamadas de ferramentas, progresso acadêmico e auditoria;
- dados de documentos: editais públicos, anexos, trechos extraídos, embeddings e análises geradas;
- dados técnicos: logs operacionais, IP, user-agent e métricas de segurança, com retenção mínima necessária.

CPF, dados bancários e documentos pessoais não são necessários para o Reader. Se aparecerem em um PDF ou mensagem, devem ser minimizados antes de qualquer provider de LLM e mascarados em logs. Não enviar dados pessoais desnecessários ao provider.

## Onde os dados ficam

Dados transacionais, RLS, conversas e auditoria ficam no PostgreSQL com volume persistente. Embeddings ficam em pgvector. Redis contém apenas estado efêmero e locks; RabbitMQ transporta eventos. O provider de LLM, quando habilitado, pode receber somente o contexto mínimo aprovado para a tarefa; a localização, retenção e suboperadores precisam ser confirmados antes da configuração.

## Retenção e direitos

O histórico da Ana tem retenção configurável pela variável `ANA_HISTORY_RETENTION_DAYS`; o job de retenção deve registrar a execução e aplicar exclusão/anonimização revisada. A plataforma deverá disponibilizar acesso, correção, eliminação, portabilidade e oposição conforme a base legal aplicável, com autenticação e escopo do próprio usuário/tenant.

## Segurança

Roles de aplicação são `NOSUPERUSER` e `NOBYPASSRLS`. O Reader e a Ana são somente leitura nesta fase. Conversas e tool calls são auditáveis por tenant. Logs devem usar mascaramento de CPF e e-mail; segredos jamais devem ser registrados.

## Revisão pendente

Revisar controlador/operador, bases legais, transferência internacional, cookies, encarregado, prazos, incidentes, canal de atendimento e texto final com advogado antes de publicar.
