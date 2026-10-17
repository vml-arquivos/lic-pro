"""Celery worker and scheduler for real public-source ingestion."""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any

from celery import Celery  # type: ignore[import-untyped]
from psycopg import connect

from .clients import PncpClient
from .control import CheckpointKey, PostgresIngestControl
from .events import RabbitMqEventPublisher
from .http import RateLimiter, ResilientJsonClient, UrllibJsonTransport
from .models import PncpPublicationQuery
from .pipeline import ingest_pncp
from .storage import SqlTenderWriter


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} é obrigatório para o worker de ingestão")
    return value


def _celery_config() -> dict[str, Any]:
    broker = os.getenv("RABBITMQ_URL") or "memory://"
    backend = os.getenv("REDIS_URL") or "cache+memory://"
    return {
        "broker_url": broker,
        "result_backend": backend,
        "task_default_queue": "ingest",
        "task_routes": {
            "ingest.run_checkpoint": {"queue": "ingest"},
            "ingest.dead_letter": {"queue": "ingest.dlq"},
            "ingest.schedule_radar": {"queue": "ingest.scheduler"},
        },
        "beat_schedule": {
            "radar-recorrente": {
                "task": "ingest.schedule_radar",
                "schedule": float(os.getenv("INGEST_SCHEDULE_SECONDS", "900")),
            }
        },
    }


celery_app = Celery("licite_comigo_ingest")
celery_app.config_from_object(_celery_config())


@celery_app.task(bind=True, name="ingest.run_checkpoint", max_retries=None)  # type: ignore[untyped-decorator]
def run_checkpoint(
    self: Any,
    tenant_id: str,
    modalidade: int,
    janela_inicio: str,
    janela_fim: str,
    uf: str | None = None,
) -> dict[str, int | str]:
    database_url = _required("DATABASE_URL")
    control = PostgresIngestControl(database_url)
    key = CheckpointKey(
        tenant_id=tenant_id,
        fonte="pncp",
        modalidade=str(modalidade),
        janela_inicio=date.fromisoformat(janela_inicio),
        janela_fim=date.fromisoformat(janela_fim),
    )
    checkpoint = control.claim(key)
    max_retries = int(os.getenv("INGEST_MAX_RETRIES", "3"))
    try:
        transport = UrllibJsonTransport(
            timeout_seconds=float(os.getenv("INGEST_HTTP_TIMEOUT_SECONDS", "30"))
        )
        http = ResilientJsonClient(
            transport,
            max_retries=max_retries,
            rate_limiter=RateLimiter(float(os.getenv("INGEST_RATE_LIMIT_SECONDS", "0.2"))),
        )
        client = PncpClient(http, os.getenv("PNCP_BASE_URL", "https://pncp.gov.br/api/consulta"))
        query = PncpPublicationQuery(
            start_date=key.janela_inicio,
            end_date=key.janela_fim,
            modality_code=modalidade,
            uf=uf or None,
        )
        with connect(database_url) as connection:
            connection.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant_id,))
            publisher = RabbitMqEventPublisher(_required("RABBITMQ_URL"))
            stats = ingest_pncp(
                client=client,
                query=query,
                tenant_id=tenant_id,
                writer=SqlTenderWriter(connection),
                publisher=publisher,
            )
        control.complete(checkpoint, page=checkpoint.pagina + 1)
        return {
            "checkpoint_id": checkpoint.id,
            "processed": stats.processed,
            "inserted": stats.inserted,
            "updated": stats.updated,
        }
    except Exception as error:
        control.fail(checkpoint, str(error))
        if self.request.retries < max_retries:
            raise self.retry(
                exc=error,
                countdown=min(60 * (2**self.request.retries), 1800),
            ) from error
        payload = {
            "tenant_id": tenant_id,
            "modalidade": modalidade,
            "janela_inicio": janela_inicio,
            "janela_fim": janela_fim,
            "uf": uf,
        }
        control.dead_letter(checkpoint, payload, str(error))
        dead_letter.apply_async(args=[payload, str(error)], queue="ingest.dlq")
        raise


@celery_app.task(name="ingest.dead_letter", ignore_result=False)  # type: ignore[untyped-decorator]
def dead_letter(payload: dict[str, Any], error: str) -> dict[str, Any]:
    """Terminal task routed to ingest.dlq for operational inspection."""
    return {"payload": payload, "erro": error, "status": "dead_letter"}


@celery_app.task(name="ingest.schedule_radar")  # type: ignore[untyped-decorator]
def schedule_radar() -> dict[str, str]:
    tenant_id = os.getenv("INGEST_SCHEDULE_TENANT_ID")
    if not tenant_id:
        return {"status": "not_configured"}
    today = date.today()
    start = today - timedelta(days=int(os.getenv("INGEST_WINDOW_DAYS", "1")))
    task = run_checkpoint.delay(
        tenant_id,
        int(os.getenv("INGEST_SCHEDULE_MODALITY_CODE", "6")),
        start.isoformat(),
        today.isoformat(),
        os.getenv("INGEST_SCHEDULE_UF") or None,
    )
    return {"status": "enqueued", "task_id": str(task.id)}
