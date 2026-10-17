# IA, Reader e Ana

A Fase 3 transforma este serviço em uma base segura para Reader/RAG e Ana:

- `POST /reader/ingest` extrai texto de PDF, preserva página, identifica headings/cláusulas, cria chunks estruturais e embeddings por provider configurável;
- `POST /reader/analyze` recupera chunks apenas dentro do tenant/edital e devolve resumo, riscos, pontos de atenção, checklist, perguntas e evidências;
- `POST /ana/chat/stream` devolve SSE e usa somente as ferramentas de leitura `buscar_editais`, `ler_analise_edital` e `explicar_conceito`;
- o provider de LLM inicial é `fake`, substituível por configuração após revisão de prompt, custos e privacidade;
- o texto da Ana deixa claro que a saída não é conclusão jurídica nem promessa de vitória.

A implementação usa stores em memória para testes e adapters SQL estreitos em `src/storage.py`. Em produção, a transação que chamar esses adapters deve configurar `app.tenant_id` e `app.user_id` antes da consulta.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
ruff check src tests
mypy src
pytest
uvicorn src.main:app --reload --port 8000
```
