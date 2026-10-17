# CONTEXTO

Projeto **Licite Comigo** (monorepo pnpm; apps/web Next.js; services core-api, ingest, ai, bid-engine, realtime-gw; Postgres 16 + pgvector, Redis, RabbitMQ; deploy no Coolify). Fases 0, 1, 2, 2B, 3 e 3.1 estão entregues. O produto passa a seguir a **especificação v2** e o **protótipo v2** anexados. Execute a **FASE 3.2 (correções) + MVP 1** descritos abaixo e PARE ao final. Não inicie o MVP 2.

# REGRAS

1. Git: um commit por item, Conventional Commits em português, `git push origin main` ao final; se o push falhar, informe o erro exato.
2. Nunca commitar segredos; tudo por env e `.env.example` atualizado.
3. Você NÃO faz deploy e NÃO tem acesso ao Coolify nem a credenciais de infraestrutura.
4. NÃO automatize portais reais, NÃO envie lances, NÃO assine, NÃO protocole nada. Conflitos entre os anexos e estas regras: estas regras e a conformidade prevalecem.
5. Primeiro, copie os dois anexos para `docs/produto/` e faça commit. Leia a especificação inteira (inclusive a seção 13) antes de codar.
6. Seja honesto: diga o que já existia, o que mudou e o que não conseguiu testar.

# PARTE 1 — CORREÇÕES (Fase 3.2)

1.1 Autenticação do `ai`: validar o JWT da sessão (segredo/chave por env) e derivar tenant e usuário SOMENTE do token, nunca de header ou body. Teste com token ausente, inválido, expirado e com tenant adulterado.
1.2 O browser deve falar apenas com o `web`: crie proxy same-origin (route handlers) para a Ana e para o Reader, e remova a exposição pública do `ai`. Elimine a dependência de `NEXT_PUBLIC_*` em runtime. Se mantiver acesso direto, exija JWT e CORS restrito.
1.3 Compose de produção e `.env.example`: adicionar variáveis do provider de LLM e de embeddings, `ANA_HISTORY_RETENTION_DAYS` e as de validação do JWT no `ai`. Em `NODE_ENV=production`, falhar no boot se faltar variável obrigatória; proibir fallback silencioso para provider falso.
1.4 Job de retenção do histórico da Ana: implementar com registro de cada execução e teste, ou registrar como pendência explícita.
1.5 Ingestão em produção: adicionar `ingest-worker` e `ingest-scheduler` (Celery worker + beat) ao compose, com checkpoint por fonte/modalidade, idempotência, retry com backoff, dead-letter queue, e `/ready` refletindo a última execução.
1.6 Colocar `bid-engine` e `realtime-gw` em `profiles: [future]` no compose de produção (não sobem por padrão).
1.7 README: documentar como autenticar localmente após `db:seed`.

# PARTE 2 — REORIENTAÇÃO

ADR-0012: o escopo passa a seguir a especificação v2. As antigas Fases 4 a 6 (motor de lances, Cockpit, Sala de Vidro, simulador de pregão) ficam suspensas. "Pregões ao vivo" = link oficial + aviso de limitação; texto "acompanhamento em tempo real" é proibido sem integração homologada. Atualize COMPLIANCE.md, ANA.md e ARCHITECTURE.md.

# PARTE 3 — MODELO DE DADOS (migrations + RLS + testes de isolamento)

3.1 Separar `publico` (`empresa` | `mentoria`, derivado da assinatura) de `nivel` (`iniciante` | `experiente`, derivado do diagnóstico). Migrar `perfil_jornada` preservando dados (mentorado → publico=mentoria; iniciante/profissional → publico=empresa com nivel correspondente). Qualquer "alternar público" existe apenas com `DEMO_MODE=true`.
3.2 Tenant = conta contratante. Criar `empresas` (CNPJ, N:1 com tenant), `vinculos_usuario_empresa`, `planos` e `assinaturas` (limites de CNPJs e usuários; sem cobrança real).
3.3 Mentor: acesso a dados de mentorados somente por `concessoes_mentor` (empresa, escopo, validade, revogável), implementado em RLS sem BYPASSRLS. Testes: sem concessão não vê nada; concessão revogada corta o acesso; nunca mistura dados de empresas.
3.4 Novas tabelas, todas com RLS: `oportunidades_salvas` (status do pipeline conforme a seção 4 da spec), `checklists` e `checklist_itens` (origem, página/trecho, confiança, responsável, status, evidência, atualizado_em), `prazos_agenda`, `tarefas`, `edital_versoes` (retificações), `rotinas`, `rotina_execucoes`, `aprovacoes`. Auditoria de toda ação da Ana: usuário/empresa, rotina, versão dos dados, fonte, justificativa, status, horário, responsável.
3.5 Reader: todo item extraído carrega `fonte` (página/trecho), `confianca` e `status_validacao` (`extraido` | `confirmado_usuario` | `corrigido`). O usuário pode corrigir.
3.6 Deduplicação de oportunidades pelo identificador oficial (ex.: numeroControlePNCP).

# PARTE 4 — MVP 1 (escopo da etapa)

4.1 Conta, empresa/CNPJ e diagnóstico de prontidão (checklist).
4.2 Explorar licitações: filtros mínimos da spec (palavra-chave, produto/serviço, UF/cidade, órgão/UASG, modalidade, situação, datas, faixa de valor, plataforma, exclusividade ME/EPP quando informada). Cada resultado mostra órgão, objeto, identificador, fonte oficial, modalidade, valores, datas e portal; campos ausentes aparecem como "não informado"; carimbo de última atualização; duplicados agrupados.
4.3 Salvar oportunidade, pipeline de status e agenda com prazos e alertas in-app.
4.4 Analisar edital: upload de PDF, link ou número; OCR por flag; extração com fonte e confiança; checklist específico do edital (sem exigências genéricas que não constem do instrumento); retificação dispara reanálise e mostra exatamente o que mudou, preservando versões anteriores.
4.5 Política central de autonomia (um único módulo, com testes): Nível A automático (buscar dados públicos, classificar, alertas, tarefas internas, sumários); Nível B rascunho com aprovação explícita; Nível C (envio em portal, assinatura, lance, impugnação, recurso, desembolso, contratação) sempre recusado. Teste: Nível C é recusado em todos os caminhos, e nenhuma ação ocorre sem registro de auditoria.
4.6 Central de Automações (real e mínima): radar recorrente Nível A com liga/desliga, filtros, última consulta REAL, próxima execução, falhas e histórico. Demais rotinas aparecem como "indisponível nesta versão". Aprovações: fila com Aprovar / Devolver / Rejeitar, exercitada por um tipo real ("confirmar oportunidade recomendada"), com resumo em linguagem simples, fonte e riscos.
4.7 Notificações apenas in-app. WhatsApp fica fora desta etapa.
4.8 Ana: resumidora com fontes, contextual por tela, mantendo as regras vigentes (somente leitura/Nível A, sem parecer jurídico, sem inventar, injection tratada como dado).
4.9 Nenhum dado fictício em produção. Seeds de demonstração apenas com `DEMO_MODE=true` e rotulados "Exemplo".

Fora do escopo: precificação, fornecedores, minutas, plano de 30 dias completo, mentoria completa, assinatura/cobrança/NFS-e, mercado e concorrentes, pregões ao vivo. Se o item aparecer no menu, é placeholder honesto "Em breve".

# PARTE 5 — INTERFACE

Aplicar o shell do protótipo: sidebar escura, topbar, tela Início com as 8 ações principais e o destaque "ANA recomenda", chip flutuante da Ana em todas as telas autenticadas, Central de Automações e Aprovações. O menu mostra só o que existe. Tokens PROVISÓRIOS em `packages/ui/brand/` (nenhuma cor hardcoded em componente): navy #10273b, teal #0f937f, mint #dff9ef, ink #172a37, muted #718191, line #dce5ea, bg #f4f7f8, acento do logo #57deb9, gradiente do destaque #102d42 → #176c69, cabeçalho da Ana #0e6f67, fonte Inter com fallback Segoe UI/Arial. Wordmark "Licite" + "Comigo" (parte final no acento). O slogan fica em variável configurável de brand, marcado como "rascunho para revisão jurídica". Proibido em produção: "Aprovar simulação", "tempo real" sem integração e qualquer promessa de resultado.

# PARTE 6 — DOCUMENTAÇÃO E LGPD

Atualizar o mapa de dados e a política (rascunhos, para revisão por advogado) com dados de empresa/CNPJ, documentos enviados, concessões de mentor e notificações. Registrar WhatsApp como futuro, dependente de consentimento.

# FINAL

Rode lint, testes e build de todos os workspaces (Node e Python). Informe: (1) o que foi feito por item, indicando o que já existia; (2) comandos para rodar e testar; (3) hashes dos commits e confirmação do push; (4) pendências e o que não foi testado. Depois PARE e aguarde minha revisão.
