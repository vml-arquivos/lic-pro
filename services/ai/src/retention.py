"""Auditável, idempotent retention job for Ana conversation data."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from psycopg import connect


class SqlConnection(Protocol):
    def execute(self, statement: str, parameters: tuple[Any, ...] = ()) -> Any:
        """Execute one parameterized SQL statement."""


@dataclass(frozen=True)
class RetentionStats:
    execution_id: str
    conversations_deleted: int
    messages_deleted: int
    tool_calls_deleted: int
    cutoff: datetime


def run_retention(
    connection: SqlConnection,
    *,
    retention_days: int,
    now: datetime | None = None,
) -> RetentionStats:
    if retention_days < 1:
        raise ValueError("ANA_HISTORY_RETENTION_DAYS deve ser maior que zero")
    current = now or datetime.now(UTC)
    cutoff = current - timedelta(days=retention_days)
    execution_id = str(uuid.uuid4())
    connection.execute("SELECT set_config('app.retention_job', 'true', false)")
    connection.execute(
        """
        INSERT INTO ana_retencao_execucoes (id, tenant_id, status)
        VALUES (%s, NULL, 'processando')
        """,
        (execution_id,),
    )
    try:
        tool_calls = connection.execute("DELETE FROM ana_tool_calls WHERE created_at < %s", (cutoff,)).rowcount
        messages = connection.execute("DELETE FROM ana_mensagens WHERE created_at < %s", (cutoff,)).rowcount
        conversations = connection.execute(
            """
            DELETE FROM ana_conversas
             WHERE (apagada_em IS NOT NULL AND apagada_em < %s)
                OR (apagada_em IS NULL AND updated_at < %s)
            """,
            (cutoff, cutoff),
        ).rowcount
        connection.execute(
            """
            UPDATE ana_retencao_execucoes
               SET fim_em = now(), status = 'concluida',
                   conversas_excluidas = %s,
                   mensagens_excluidas = %s,
                   tool_calls_excluidos = %s
             WHERE id = %s
            """,
            (conversations, messages, tool_calls, execution_id),
        )
        return RetentionStats(execution_id, conversations, messages, tool_calls, cutoff)
    except Exception as error:
        connection.execute(
            """
            UPDATE ana_retencao_execucoes
               SET fim_em = now(), status = 'erro', erro = %s
             WHERE id = %s
            """,
            (str(error)[:1000], execution_id),
        )
        raise


def run_from_environment() -> RetentionStats:
    database_url = os.environ.get("AI_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("AI_DATABASE_URL ou DATABASE_URL é obrigatório para retenção")
    retention_days = int(os.environ["ANA_HISTORY_RETENTION_DAYS"])
    with connect(database_url, autocommit=True) as connection:
        return run_retention(connection, retention_days=retention_days)


if __name__ == "__main__":
    stats = run_from_environment()
    print(
        f"retenção concluída: execução={stats.execution_id} "
        f"conversas={stats.conversations_deleted} mensagens={stats.messages_deleted} "
        f"tool_calls={stats.tool_calls_deleted}"
    )
