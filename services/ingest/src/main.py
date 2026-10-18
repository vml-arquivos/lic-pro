"""FastAPI health surface for the ingestion workers."""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .dependencies import check_dependencies


@dataclass(frozen=True)
class ServiceHealth:
    service: str
    status: str = "ok"


def health() -> ServiceHealth:
    return ServiceHealth(service="ingest")


def validate_runtime_environment() -> None:
    if os.getenv("NODE_ENV") != "production":
        return
    required = [
        "DATABASE_URL",
        "REDIS_URL",
        "RABBITMQ_URL",
        "PNCP_BASE_URL",
        "COMPRAS_GOV_BASE_URL",
    ]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Variáveis obrigatórias ausentes no ingest: {', '.join(missing)}")


validate_runtime_environment()
app = FastAPI(title="Licite Comigo Ingest", version="0.3.1")


@app.get("/health")
def health_route() -> ServiceHealth:
    return health()


@app.get("/ready")
async def ready_route() -> JSONResponse:
    result = await check_dependencies()
    return JSONResponse(
        {"service": "ingest", **result}, status_code=200 if result["ready"] else 503
    )


if __name__ == "__main__":
    print(health())
