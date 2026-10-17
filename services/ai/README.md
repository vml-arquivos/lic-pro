# IA, Reader e Ana

A Fase 3 transforma este serviço em uma base segura para Reader/RAG e Ana:

- `POST /reader/ingest` extrai texto de PDF, preserva página, identifica headings/cláusulas, cria chunks estruturais e embeddings por provider configurável; o pedido de OCR retorna `ocr_not_configured` enquanto não houver worker habilitado, sem fingir fallback;
- `POST /reader/analyze` recupera chunks apenas dentro do tenant/edital e devolve resumo, riscos, pontos de atenção, checklist, perguntas e evidências;
- `POST /ana/chat/stream` devolve SSE, respeita rate limit/cotas e usa somente as ferramentas de leitura `buscar_editais`, `ler_analise_edital` e `explicar_conceito`;
- o provider de LLM inicial é `fake`, substituível por configuração após revisão de prompt, custos e privacidade; o prompt enviado pelo usuário (`pergunta`) é separado da fonte persistida e toda resposta deve citar evidências;
- o texto da Ana deixa claro que a saída não é conclusão jurídica nem promessa de vitória;
- `ANA_HISTORY_RETENTION_DAYS` configura `python -m src.retention`, job que exclui histórico expirado, grava contadores/status em `ana_retencao_execucoes` e registra falhas. Ele deve ser agendado fora do processo web, por cron/Coolify Job ou scheduler operacional revisado.

A implementação usa stores em memória para testes e adapters PostgreSQL em `src/postgres.py`. Em produção, as conexões usam a role `licite_ai`, configuram `app.tenant_id`/`app.user_id` em cada transação e gravam chunks, análises, mensagens e tool calls nas tabelas protegidas por RLS.

Dados pessoais desnecessários não devem ser enviados ao LLM. `src/privacy.py` mascara CPF e e-mail antes de argumentos de auditoria. Os documentos LGPD são rascunhos em `docs/legal/` e precisam de revisão por advogado.

```bash
pip install -e '.[dev]'
ruff check src tests
mypy src
pytest
uvicorn src.main:app --reload --port 8000
```
