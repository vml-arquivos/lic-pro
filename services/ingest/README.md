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

## Operação recorrente

Em produção, o compose sobe três processos separados: `ingest` (health/readiness HTTP), `ingest-worker` (Celery consumer da fila `ingest`) e `ingest-scheduler` (Celery Beat). O scheduler cria uma janela PNCP real conforme `INGEST_SCHEDULE_TENANT_ID`, modalidade, UF e `INGEST_WINDOW_DAYS`; sem esse tenant configurado, ele não inventa dados e retorna `not_configured`.

Cada execução usa uma chave de checkpoint `(tenant, fonte, modalidade, janela)` em `ingest_checkpoints`. Reprocessar a mesma janela incrementa a tentativa, reaproveita a página e usa o upsert idempotente do identificador oficial. Falhas fazem retry exponencial limitado por `INGEST_MAX_RETRIES`; depois, o erro é gravado em `ingest_dead_letters` e encaminhado à fila RabbitMQ `ingest.dlq` para inspeção operacional, sem descarte silencioso.

O endpoint `/ready` informa `last_execution` (`never`, `processando`, `concluida`, `erro` ou `unavailable`) além de banco e Redis. A readiness não transforma uma falha de uma janela em dado válido; o erro permanece visível para operação.

Para integrar o serviço a um ambiente, configure `PNCP_BASE_URL`, `COMPRAS_GOV_BASE_URL`, `INGEST_RATE_LIMIT_SECONDS`, `INGEST_MAX_RETRIES`, `INGEST_PAGE_SIZE` e `RABBITMQ_URL` a partir do `.env.example`. O publisher usa tópicos `edital.novo` e `edital.atualizado`.

## Smoke test opt-in

`services/ingest/scripts/smoke.py` nunca roda no CI nem na suíte automática. Execute apenas quando quiser validar uma fonte externa:

```bash
RUN_INGEST_SMOKE=1 pnpm ingest:smoke
```

O script faz no máximo uma requisição real ao endpoint de publicações do PNCP e uma ao catálogo de materiais do Compras.gov.br. A janela e modalidade do PNCP podem ser configuradas com `PNCP_SMOKE_START_DATE`, `PNCP_SMOKE_END_DATE`, `PNCP_SMOKE_MODALITY_CODE` e `PNCP_SMOKE_UF`. Ele compara os campos observados com o contrato esperado, reporta campos ausentes/novos e tenta normalizar o primeiro item PNCP. Um resultado diferente deve gerar revisão de fixture/normalizador antes de alterar o pipeline.
