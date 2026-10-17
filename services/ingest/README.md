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

## Smoke test opt-in

`services/ingest/scripts/smoke.py` nunca roda no CI nem na suíte automática. Execute apenas quando quiser validar uma fonte externa:

```bash
RUN_INGEST_SMOKE=1 pnpm ingest:smoke
```

O script faz no máximo uma requisição real ao endpoint de publicações do PNCP e uma ao catálogo de materiais do Compras.gov.br. A janela e modalidade do PNCP podem ser configuradas com `PNCP_SMOKE_START_DATE`, `PNCP_SMOKE_END_DATE`, `PNCP_SMOKE_MODALITY_CODE` e `PNCP_SMOKE_UF`. Ele compara os campos observados com o contrato esperado, reporta campos ausentes/novos e tenta normalizar o primeiro item PNCP. Um resultado diferente deve gerar revisão de fixture/normalizador antes de alterar o pipeline.

## Agendamento proposto

O agendamento de produção deve ser feito por Celery Beat ou pelo scheduler do Coolify, separado do processo HTTP. Cada execução recebe uma janela `inicio/fim` e uma modalidade/fonte; antes de buscar, grava ou atualiza um checkpoint por `(fonte, modalidade, janela)` com estado `processando`. Ao concluir cada página, salva o cursor/página e, ao finalizar, marca `concluido`. Falha deixa o checkpoint retomável, com backoff, sem publicar evento duplicado.

A identidade `(tenant_id, fonte, id_externo, hash_conteudo)` e o upsert idempotente já estão implementados em `src/normalizer.py`, `src/storage.py` e `src/pipeline.py`; portanto uma reexecução de janela não deve criar edital duplicado. A tabela de checkpoints e o worker Celery Beat entram quando a operação recorrente for habilitada; até lá, não há agendamento automático escondido.
