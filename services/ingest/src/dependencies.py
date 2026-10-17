from __future__ import annotations

import os
from typing import Any


async def check_dependencies() -> dict[str, Any]:
    database_url = os.getenv("DATABASE_URL")
    database = await _check_database(database_url)
    redis = await _check_redis(os.getenv("REDIS_URL"))
    last_execution = await _last_execution(database_url, os.getenv("INGEST_SCHEDULE_TENANT_ID"))
    return {
        "database": database,
        "redis": redis,
        "last_execution": last_execution,
        "ready": database and redis,
    }


async def _check_database(url: str | None) -> bool:
    if not url:
        return False
    try:
        import asyncpg  # type: ignore[import-untyped]

        connection = await asyncpg.connect(url, timeout=2)
        try:
            await connection.fetchval("SELECT 1")
        finally:
            await connection.close()
    except Exception:
        return False
    return True


async def _last_execution(url: str | None, tenant_id: str | None) -> dict[str, Any]:
    if not url or not tenant_id:
        return {"status": "never", "ultima_execucao_em": None, "concluida_em": None, "erro": None}
    try:
        import asyncpg

        connection = await asyncpg.connect(url, timeout=2)
        try:
            await connection.execute("SELECT set_config('app.tenant_id', $1, false)", tenant_id)
            row = await connection.fetchrow(
                """
                SELECT status, ultima_execucao_em, concluida_em, ultimo_erro
                  FROM ingest_checkpoints
                 WHERE tenant_id = $1
                 ORDER BY updated_at DESC
                 LIMIT 1
                """,
                tenant_id,
            )
        finally:
            await connection.close()
    except Exception as error:
        return {"status": "unavailable", "erro": str(error)[:300]}
    if row is None:
        return {"status": "never", "ultima_execucao_em": None, "concluida_em": None, "erro": None}
    return {
        "status": str(row["status"]),
        "ultima_execucao_em": (
            row["ultima_execucao_em"].isoformat() if row["ultima_execucao_em"] else None
        ),
        "concluida_em": row["concluida_em"].isoformat() if row["concluida_em"] else None,
        "erro": row["ultimo_erro"],
    }


async def _check_redis(url: str | None) -> bool:
    if not url:
        return False
    try:
        from redis.asyncio import Redis

        client: Any = Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        result = await client.ping()
        await client.aclose()
        return bool(result)
    except Exception:
        return False
