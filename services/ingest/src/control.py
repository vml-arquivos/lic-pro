"""Persistent control plane for scheduled ingestion jobs."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from typing import Any
from uuid import UUID

from psycopg import connect

from .models import canonical_query_hash


@dataclass(frozen=True)
class CheckpointKey:
    tenant_id: str
    fonte: str
    modalidade: str
    janela_inicio: date
    janela_fim: date
    query_hash: str | None = None
    endpoint: str = "publicacao"
    filtros: dict[str, Any] = field(default_factory=dict)

    def resolved_query_hash(self) -> str:
        if self.query_hash:
            return self.query_hash
        identity_filters: dict[str, Any] = {
            "fonte": self.fonte,
            "modalidade": self.modalidade,
            "janela_inicio": self.janela_inicio.isoformat(),
            "janela_fim": self.janela_fim.isoformat(),
            **self.filtros,
        }
        return canonical_query_hash(identity_filters)

    @property
    def filters(self) -> dict[str, Any]:
        """English alias for integrations that use the original API naming."""

        return self.filtros


@dataclass(frozen=True)
class Checkpoint:
    id: str
    key: CheckpointKey
    pagina: int
    tentativa: int
    status: str
    lease_until: datetime | None = None
    heartbeat_at: datetime | None = None
    watermark: str | None = None

    @property
    def query_hash(self) -> str:
        return self.key.resolved_query_hash()

    @property
    def endpoint(self) -> str:
        return self.key.endpoint

    @property
    def filtros(self) -> dict[str, Any]:
        return self.key.filtros


class PostgresIngestControl:
    def __init__(self, database_url: str, *, lease_seconds: int = 300) -> None:
        self.database_url = database_url
        self.lease_seconds = max(1, lease_seconds)

    def claim(self, key: CheckpointKey) -> Checkpoint:
        query_hash = key.resolved_query_hash()
        with connect(self.database_url) as connection:
            connection.execute("SELECT set_config('app.tenant_id', %s, false)", (key.tenant_id,))
            row = connection.execute(
                """
                INSERT INTO ingest_checkpoints
                  (tenant_id, fonte, modalidade, janela_inicio, janela_fim,
                   query_hash, endpoint, filtros, status, tentativa,
                   ultima_execucao_em, lease_until, heartbeat_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb,
                        'processando', 1, now(),
                        now() + (%s * interval '1 second'), now())
                ON CONFLICT
                  (tenant_id, fonte, modalidade, janela_inicio, janela_fim, query_hash)
                DO UPDATE SET
                  endpoint = EXCLUDED.endpoint,
                  filtros = EXCLUDED.filtros,
                  status = 'processando',
                  tentativa = ingest_checkpoints.tentativa + 1,
                  ultima_execucao_em = now(),
                  lease_until = now() + (%s * interval '1 second'),
                  heartbeat_at = now(),
                  ultimo_erro = NULL,
                  updated_at = now()
                RETURNING id, cursor_pagina, tentativa, status,
                          lease_until, heartbeat_at, watermark
                """,
                (
                    key.tenant_id,
                    key.fonte,
                    key.modalidade,
                    key.janela_inicio,
                    key.janela_fim,
                    query_hash,
                    key.endpoint,
                    json.dumps(key.filtros, ensure_ascii=False, sort_keys=True),
                    self.lease_seconds,
                    self.lease_seconds,
                ),
            ).fetchone()
        if row is None:
            raise RuntimeError("checkpoint não criado")
        resolved_key = replace(key, query_hash=query_hash)
        return Checkpoint(
            str(row[0]),
            resolved_key,
            int(row[1]),
            int(row[2]),
            str(row[3]),
            _as_datetime(row[4]) if len(row) > 4 else None,
            _as_datetime(row[5]) if len(row) > 5 else None,
            _as_text(row[6]) if len(row) > 6 else None,
        )

    def complete(self, checkpoint: Checkpoint, *, page: int, watermark: str | None = None) -> None:
        """Persist the next page to request on the next execution."""

        self._execute(
            """
            UPDATE ingest_checkpoints
               SET cursor_pagina = %s, status = 'concluida',
                   concluida_em = now(), lease_until = NULL,
                   heartbeat_at = now(), watermark = COALESCE(%s, watermark),
                   updated_at = now()
             WHERE id = %s AND tenant_id = %s
            """,
            (max(1, page), watermark, checkpoint.id, checkpoint.key.tenant_id),
            checkpoint.key.tenant_id,
        )

    def advance(
        self, checkpoint: Checkpoint, *, next_page: int, watermark: str | None = None
    ) -> None:
        """Advance a running checkpoint atomically after a successfully read page."""

        self._execute(
            """
            UPDATE ingest_checkpoints
               SET cursor_pagina = %s, heartbeat_at = now(),
                   lease_until = now() + interval '5 minutes',
                   watermark = COALESCE(%s, watermark), updated_at = now()
             WHERE id = %s AND tenant_id = %s AND status = 'processando'
            """,
            (max(1, next_page), watermark, checkpoint.id, checkpoint.key.tenant_id),
            checkpoint.key.tenant_id,
        )

    def heartbeat(self, checkpoint: Checkpoint) -> None:
        self._execute(
            """
            UPDATE ingest_checkpoints
               SET heartbeat_at = now(),
                   lease_until = now() + interval '5 minutes', updated_at = now()
             WHERE id = %s AND tenant_id = %s
            """,
            (checkpoint.id, checkpoint.key.tenant_id),
            checkpoint.key.tenant_id,
        )

    def fail(self, checkpoint: Checkpoint, error: str) -> None:
        self._execute(
            """
            UPDATE ingest_checkpoints
               SET status = 'erro', ultimo_erro = %s, lease_until = NULL,
                   heartbeat_at = now(), updated_at = now()
             WHERE id = %s AND tenant_id = %s
            """,
            (error[:2000], checkpoint.id, checkpoint.key.tenant_id),
            checkpoint.key.tenant_id,
        )

    def dead_letter(self, checkpoint: Checkpoint, payload: dict[str, Any], error: str) -> None:
        self._execute(
            """
            INSERT INTO ingest_dead_letters (tenant_id, checkpoint_id, payload, erro, tentativas)
            VALUES (%s, %s, %s::jsonb, %s, %s)
            """,
            (
                checkpoint.key.tenant_id,
                checkpoint.id,
                json.dumps(payload, ensure_ascii=False),
                error[:4000],
                checkpoint.tentativa,
            ),
            checkpoint.key.tenant_id,
        )

    def last_execution(self, tenant_id: str) -> dict[str, Any]:
        with connect(self.database_url) as connection:
            connection.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant_id,))
            row = connection.execute(
                """
                SELECT status, ultima_execucao_em, concluida_em, ultimo_erro
                  FROM ingest_checkpoints
                 WHERE tenant_id = %s
                 ORDER BY updated_at DESC
                 LIMIT 1
                """,
                (tenant_id,),
            ).fetchone()
        if row is None:
            return {
                "status": "never",
                "ultima_execucao_em": None,
                "concluida_em": None,
                "erro": None,
            }
        return {
            "status": str(row[0]),
            "ultima_execucao_em": row[1].isoformat() if isinstance(row[1], datetime) else row[1],
            "concluida_em": row[2].isoformat() if isinstance(row[2], datetime) else row[2],
            "erro": row[3],
        }

    def _execute(self, statement: str, values: tuple[Any, ...], tenant_id: str) -> None:
        with connect(self.database_url) as connection:
            connection.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant_id,))
            connection.execute(statement, values)


class InMemoryIngestControl:
    def __init__(self) -> None:
        self.checkpoints: dict[tuple[str, str, str, date, date, str], Checkpoint] = {}
        self.dead_letters: list[tuple[Checkpoint, dict[str, Any], str]] = []

    def claim(self, key: CheckpointKey) -> Checkpoint:
        identity = self._identity(key)
        previous = self.checkpoints.get(identity)
        resolved_key = replace(key, query_hash=key.resolved_query_hash())
        checkpoint = Checkpoint(
            id=previous.id if previous else str(UUID(int=len(self.checkpoints) + 1)),
            key=resolved_key,
            pagina=previous.pagina if previous else 1,
            tentativa=(previous.tentativa + 1) if previous else 1,
            status="processando",
            lease_until=previous.lease_until if previous else None,
            heartbeat_at=previous.heartbeat_at if previous else None,
            watermark=previous.watermark if previous else None,
        )
        self.checkpoints[identity] = checkpoint
        return checkpoint

    def complete(self, checkpoint: Checkpoint, *, page: int, watermark: str | None = None) -> None:
        self._replace(checkpoint, max(1, page), "concluida", watermark=watermark)

    def advance(
        self, checkpoint: Checkpoint, *, next_page: int, watermark: str | None = None
    ) -> None:
        self._replace(checkpoint, max(1, next_page), "processando", watermark=watermark)

    def heartbeat(self, checkpoint: Checkpoint) -> None:
        self._replace(checkpoint, checkpoint.pagina, checkpoint.status)

    def fail(self, checkpoint: Checkpoint, error: str) -> None:
        del error
        self._replace(checkpoint, checkpoint.pagina, "erro")

    def dead_letter(self, checkpoint: Checkpoint, payload: dict[str, Any], error: str) -> None:
        self.dead_letters.append((checkpoint, payload, error))

    def last_execution(self, tenant_id: str) -> dict[str, Any]:
        rows = [
            checkpoint
            for checkpoint in self.checkpoints.values()
            if checkpoint.key.tenant_id == tenant_id
        ]
        if not rows:
            return {"status": "never"}
        return {"status": rows[-1].status}

    @staticmethod
    def _identity(key: CheckpointKey) -> tuple[str, str, str, date, date, str]:
        return (
            key.tenant_id,
            key.fonte,
            key.modalidade,
            key.janela_inicio,
            key.janela_fim,
            key.resolved_query_hash(),
        )

    def _replace(
        self,
        checkpoint: Checkpoint,
        page: int,
        status: str,
        *,
        watermark: str | None = None,
    ) -> None:
        identity = self._identity(checkpoint.key)
        self.checkpoints[identity] = Checkpoint(
            checkpoint.id,
            checkpoint.key,
            page,
            checkpoint.tentativa,
            status,
            checkpoint.lease_until,
            checkpoint.heartbeat_at,
            watermark if watermark is not None else checkpoint.watermark,
        )


def _as_datetime(value: Any) -> datetime | None:
    return value if isinstance(value, datetime) else None


def _as_text(value: Any) -> str | None:
    return str(value) if value is not None else None
