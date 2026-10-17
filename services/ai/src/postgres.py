"""Synchronous PostgreSQL adapters used behind the FastAPI service boundary."""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

from psycopg import connect
from psycopg.rows import dict_row

from .ana import ConversationStore, ToolCallAuditor
from .models import DocumentChunk, ReaderResult, StoredAnalysis
from .privacy import mask_sensitive
from .reader import AnalysisStore, ChunkStore


class PostgresChunkStore(ChunkStore):
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def save(self, chunks: Sequence[DocumentChunk]) -> None:
        with connect(self.database_url) as connection:
            if chunks:
                _set_context(connection, chunks[0].tenant_id)
            with connection.cursor() as cursor:
                for chunk in chunks:
                    vector = "[" + ",".join(str(value) for value in chunk.embedding) + "]" if chunk.embedding else None
                    cursor.execute(
                        """
                        INSERT INTO edital_chunks
                          (tenant_id, edital_id, pagina, secao, clausula, conteudo, embedding, metadata)
                        VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s::jsonb)
                        """,
                        (
                            chunk.tenant_id,
                            chunk.edital_id,
                            chunk.pagina,
                            chunk.secao,
                            chunk.clausula,
                            chunk.conteudo,
                            vector,
                            json.dumps(chunk.metadata),
                        ),
                    )

    def list_for_edital(self, tenant_id: str, edital_id: str) -> list[DocumentChunk]:
        with connect(self.database_url, row_factory=dict_row) as connection:
            _set_context(connection, tenant_id)
            rows = connection.execute(
                """
                SELECT tenant_id::text, edital_id::text, pagina, secao, clausula, conteudo, metadata
                  FROM edital_chunks
                 WHERE tenant_id = %s AND edital_id = %s
                 ORDER BY pagina NULLS LAST, created_at
                """,
                (tenant_id, edital_id),
            ).fetchall()
        return [
            DocumentChunk(
                tenant_id=str(row["tenant_id"]),
                edital_id=str(row["edital_id"]),
                pagina=row["pagina"],
                secao=row["secao"],
                clausula=row["clausula"],
                conteudo=row["conteudo"],
                metadata=row["metadata"],
            )
            for row in rows
        ]


class PostgresAnalysisStore(AnalysisStore):
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def save(self, analysis: StoredAnalysis) -> None:
        with connect(self.database_url) as connection:
            _set_context(connection, analysis.tenant_id)
            connection.execute(
                """
                INSERT INTO analises_ia
                  (tenant_id, edital_id, status, resultado, modelo, prompt_version)
                VALUES (%s, %s, 'concluida', %s::jsonb, %s, %s)
                """,
                (
                    analysis.tenant_id,
                    analysis.edital_id,
                    analysis.resultado.model_dump_json(),
                    analysis.modelo,
                    analysis.prompt_version,
                ),
            )

    def get(self, tenant_id: str, edital_id: str) -> StoredAnalysis | None:
        with connect(self.database_url, row_factory=dict_row) as connection:
            _set_context(connection, tenant_id)
            row = connection.execute(
                """
                SELECT resultado, modelo, prompt_version
                  FROM analises_ia
                 WHERE tenant_id = %s AND edital_id = %s
                 ORDER BY updated_at DESC
                 LIMIT 1
                """,
                (tenant_id, edital_id),
            ).fetchone()
        if row is None:
            return None
        return StoredAnalysis(
            tenant_id=tenant_id,
            edital_id=edital_id,
            resultado=ReaderResult.model_validate(row["resultado"]),
            modelo=row["modelo"] or "desconhecido",
            prompt_version=row["prompt_version"] or "desconhecido",
        )


class PostgresConversationStore(ConversationStore):
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def append(self, tenant_id: str, user_id: str, conversa_id: str, role: str, text: str) -> None:
        message_type = "usuario" if role == "usuario" else "assistente"
        with connect(self.database_url) as connection:
            _set_context(connection, tenant_id, user_id)
            owner = connection.execute(
                """
                SELECT 1 FROM ana_conversas
                 WHERE id = %s AND tenant_id = %s AND usuario_id = %s
                """,
                (conversa_id, tenant_id, user_id),
            ).fetchone()
            if owner is None:
                exists = connection.execute(
                    "SELECT 1 FROM ana_conversas WHERE id = %s AND tenant_id = %s",
                    (conversa_id, tenant_id),
                ).fetchone()
                if exists is not None:
                    raise PermissionError("conversa pertence a outro usuário")
                connection.execute(
                    """
                INSERT INTO ana_conversas (id, tenant_id, usuario_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                    (conversa_id, tenant_id, user_id),
                )
            connection.execute(
                """
                INSERT INTO ana_mensagens (tenant_id, conversa_id, tipo, conteudo)
                VALUES (%s, %s, %s::tipo_mensagem_ana, %s)
                """,
                (tenant_id, conversa_id, message_type, text),
            )


class PostgresToolCallAuditor(ToolCallAuditor):
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def record(self, tenant_id: str, conversa_id: str, tool: str, argument: str) -> None:
        with connect(self.database_url) as connection:
            _set_context(connection, tenant_id)
            connection.execute(
                """
                INSERT INTO ana_tool_calls
                  (tenant_id, conversa_id, ferramenta, nivel, argumentos, confirmado)
                VALUES (%s, %s, %s, 'leitura', %s::jsonb, false)
                """,
                (tenant_id, conversa_id, tool, json.dumps({"argument": mask_sensitive(argument)})),
            )


def _set_context(connection: Any, tenant_id: str, user_id: str | None = None) -> None:
    connection.execute("SELECT set_config('app.tenant_id', %s, false)", (tenant_id,))
    if user_id:
        connection.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
