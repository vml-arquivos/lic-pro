"""Persistent control plane for scheduled ingestion jobs."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

from psycopg import connect


@dataclass(frozen=True)
class CheckpointKey:
    tenant_id: str
    fonte: str
    modalidade: str
    janela_inicio: date
    janela_fim: date


@dataclass(frozen=True)
class Checkpoint:
    id: str
    key: CheckpointKey
    pagina: int
    tentativa: int
    status: str


class PostgresIngestControl:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def claim(self, key: CheckpointKey) -> Checkpoint:
        with connect(self.database_url) as connection:
            connection.execute("SELECT set_config('app.tenant_id', %s, false)", (key.tenant_id,))
            row = connection.execute(
                """
                INSERT INTO ingest_checkpoints
                  (tenant_id, fonte, modalidade, janela_inicio, janela_fim,
                   status, tentativa, ultima_execucao_em)
                VALUES (%s, %s, %s, %s, %s, 'processando', 1, now())
                ON CONFLICT (tenant_id, fonte, modalidade, janela_inicio, janela_fim) DO UPDATE SET
                  status = 'processando',
                  tentativa = ingest_checkpoints.tentativa + 1,
                  ultima_execucao_em = now(),
                  ultimo_erro = NULL,
                  updated_at = now()
                RETURNING id, cursor_pagina, tentativa, status
                """,
                (
                    key.tenant_id,
                    key.fonte,
                    key.modalidade,
                    key.janela_inicio,
                    key.janela_fim,
                ),
            ).fetchone()
        if row is None:
            raise RuntimeError("checkpoint não criado")
        return Checkpoint(str(row[0]), key, int(row[1]), int(row[2]), str(row[3]))

    def complete(self, checkpoint: Checkpoint, *, page: int) -> None:
        self._execute(
            """
            UPDATE ingest_checkpoints
               SET cursor_pagina = %s, status = 'concluida',
                   concluida_em = now(), updated_at = now()
             WHERE id = %s AND tenant_id = %s
            """,
            (page, checkpoint.id, checkpoint.key.tenant_id),
            checkpoint.key.tenant_id,
        )

    def fail(self, checkpoint: Checkpoint, error: str) -> None:
        self._execute(
            """
            UPDATE ingest_checkpoints
               SET status = 'erro', ultimo_erro = %s, updated_at = now()
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
                json.dumps(payload),
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
        self.checkpoints: dict[tuple[str, str, str, date, date], Checkpoint] = {}
        self.dead_letters: list[tuple[Checkpoint, dict[str, Any], str]] = []

    def claim(self, key: CheckpointKey) -> Checkpoint:
        identity = (key.tenant_id, key.fonte, key.modalidade, key.janela_inicio, key.janela_fim)
        previous = self.checkpoints.get(identity)
        checkpoint = Checkpoint(
            id=previous.id if previous else str(UUID(int=len(self.checkpoints) + 1)),
            key=key,
            pagina=previous.pagina if previous else 1,
            tentativa=(previous.tentativa + 1) if previous else 1,
            status="processando",
        )
        self.checkpoints[identity] = checkpoint
        return checkpoint

    def complete(self, checkpoint: Checkpoint, *, page: int) -> None:
        self._replace(checkpoint, page, "concluida")

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

    def _replace(self, checkpoint: Checkpoint, page: int, status: str) -> None:
        identity = (
            checkpoint.key.tenant_id,
            checkpoint.key.fonte,
            checkpoint.key.modalidade,
            checkpoint.key.janela_inicio,
            checkpoint.key.janela_fim,
        )
        self.checkpoints[identity] = Checkpoint(
            checkpoint.id,
            checkpoint.key,
            page,
            checkpoint.tentativa,
            status,
        )
