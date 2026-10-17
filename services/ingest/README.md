# Ingestão

Serviço Python para conectores públicos, normalização, deduplicação, upsert idempotente e publicação de eventos do Radar. A Fase 2 usa o endpoint documentado de consulta pública do PNCP e os endpoints documentados de CATMAT/CATSER e pesquisa de preços do Compras.gov.br. As fontes e os contratos estão registrados em [`docs/research/fase2-apis-oficiais.md`](../../docs/research/fase2-apis-oficiais.md).

Os testes usam fixtures locais e transportes falsos. Eles não fazem chamadas de rede.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
ruff check src tests
mypy src
pytest
```

Para integrar o serviço a um ambiente, configure `PNCP_BASE_URL`, `COMPRAS_GOV_BASE_URL`, `INGEST_RATE_LIMIT_SECONDS`, `INGEST_MAX_RETRIES`, `INGEST_PAGE_SIZE` e `RABBITMQ_URL` a partir do `.env.example`. O publisher usa tópicos `edital.novo` e `edital.atualizado`.
