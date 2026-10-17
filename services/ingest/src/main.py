"""FastAPI health surface for the ingestion workers."""

from __future__ import annotations

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
