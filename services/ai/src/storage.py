"""SQL adapters kept behind narrow protocols for tenant-safe persistence."""

from __future__ import annotations

from typing import Any, Protocol

from .models import DocumentChunk, StoredAnalysis


class SqlExecutor(Protocol):
    def execute(self, statement: str, parameters: list[Any]) -> Any:
        """Execute a parameterized statement in a tenant-scoped transaction."""


class SqlChunkStore:
    def __init__(self, executor: SqlExecutor) -> None:
        self.executor = executor

    def save(self, chunks: list[DocumentChunk]) -> None:
        for chunk in chunks:
            vector = "[" + ",".join(str(value) for value in chunk.embedding) + "]" if chunk.embedding else None
            self.executor.execute(
                """
                INSERT INTO edital_chunks
                  (tenant_id, edital_id, pagina, secao, clausula, conteudo, embedding, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8::jsonb)
                """,
                [
                    chunk.tenant_id,
                    chunk.edital_id,
                    chunk.pagina,
                    chunk.secao,
                    chunk.clausula,
                    chunk.conteudo,
                    vector,
                    chunk.metadata,
                ],
            )


class SqlAnalysisStore:
    def __init__(self, executor: SqlExecutor) -> None:
        self.executor = executor

    def save(self, analysis: StoredAnalysis) -> None:
        self.executor.execute(
            """
            INSERT INTO analises_ia
              (tenant_id, edital_id, status, resultado, modelo, prompt_version)
            VALUES ($1, $2, 'concluida', $3::jsonb, $4, $5)
            """,
            [
                analysis.tenant_id,
                analysis.edital_id,
                analysis.resultado.model_dump_json(),
                analysis.modelo,
                analysis.prompt_version,
            ],
        )


class SqlConversationStore:
    def __init__(self, executor: SqlExecutor) -> None:
        self.executor = executor

    def append(self, tenant_id: str, user_id: str, conversa_id: str, role: str, text: str) -> None:
        self.executor.execute(
            """
            INSERT INTO ana_conversas (id, tenant_id, usuario_id)
            VALUES ($3, $1, $2)
            ON CONFLICT (id) DO NOTHING
            """,
            [tenant_id, user_id, conversa_id],
        )
        self.executor.execute(
            """
            INSERT INTO ana_mensagens (tenant_id, conversa_id, tipo, conteudo)
            VALUES ($1, $2, $3::tipo_mensagem_ana, $4)
            """,
            [tenant_id, conversa_id, "usuario" if role == "usuario" else "assistente", text],
        )


class SqlToolCallAuditor:
    def __init__(self, executor: SqlExecutor) -> None:
        self.executor = executor

    def record(self, tenant_id: str, conversa_id: str, tool: str, argument: str) -> None:
        self.executor.execute(
            """
            INSERT INTO ana_tool_calls (tenant_id, conversa_id, ferramenta, nivel, argumentos, confirmado)
            VALUES ($1, $2, $3, 'leitura', $4::jsonb, false)
            """,
            [tenant_id, conversa_id, tool, '{"argument": ' + _json_string(argument) + "}"],
        )


def _json_string(value: str) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)
