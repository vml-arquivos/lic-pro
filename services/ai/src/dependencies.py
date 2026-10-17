"""Dependency checks kept separate from application endpoints."""

from __future__ import annotations

import os
from typing import Any


async def check_dependencies() -> dict[str, bool]:
    database = await _check_database(os.getenv("DATABASE_URL"))
    redis = await _check_redis(os.getenv("REDIS_URL"))
    return {"database": database, "redis": redis, "ready": database and redis}


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
