"""FastAPI entry point for Reader/RAG and Ana's read-only assistant."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from .ana import AnaService, InMemoryConversationStore, InMemoryToolCallAuditor
from .auth import AuthDependency
from .dependencies import check_dependencies
from .ingestion import chunk_pages, embed_chunks, extract_pdf_pages
from .limits import InMemoryUsageStore, LimitExceeded, RateLimiter, ServiceLimits, estimate_tokens
from .models import AnaChatRequest, ReaderAnalyzeRequest, ReaderResult
from .postgres import (
    PostgresAnalysisStore,
    PostgresChunkStore,
    PostgresConversationStore,
    PostgresToolCallAuditor,
)
from .providers import build_embedding_provider, build_llm_provider
from .reader import InMemoryAnalysisStore, InMemoryChunkStore, ReaderAgent
from .usage import PostgresUsageStore


@dataclass(frozen=True)
class ServiceHealth:
    service: str
    status: str = "ok"


def health() -> ServiceHealth:
    return ServiceHealth(service="ai")


limits = ServiceLimits.from_env()
rate_limiter = RateLimiter(limits)
database_url = os.getenv("DATABASE_URL")
chunks = PostgresChunkStore(database_url) if database_url else InMemoryChunkStore()
analyses = PostgresAnalysisStore(database_url) if database_url else InMemoryAnalysisStore()
reader = ReaderAgent(
    build_llm_provider(
        os.getenv("LLM_PROVIDER", "fake"),
        model=os.getenv("LLM_MODEL", "offline-reader-v1"),
    ),
    chunks,
    analyses,
)
embedding_provider = build_embedding_provider(os.getenv("EMBEDDING_PROVIDER", "deterministic"))
history = PostgresConversationStore(database_url) if database_url else InMemoryConversationStore()
auditor = PostgresToolCallAuditor(database_url) if database_url else InMemoryToolCallAuditor()
ana = AnaService(analyses, history, auditor)
usage = PostgresUsageStore(database_url, limits) if database_url else InMemoryUsageStore(limits)
app = FastAPI(title="Licite Comigo AI", version="0.3.2")


@app.get("/health")
def health_route() -> ServiceHealth:
    return health()


@app.get("/ready")
async def ready_route() -> JSONResponse:
    result = await check_dependencies()
    return JSONResponse(result | {"service": "ai"}, status_code=200 if result["ready"] else 503)


@app.post("/reader/ingest")
async def reader_ingest(
    auth: AuthDependency,
    file: Annotated[UploadFile, File(...)],
    edital_id: Annotated[str, Form(...)],
    ocr_enabled: Annotated[bool, Form()] = False,
) -> dict[str, int | bool]:
    _uuid(edital_id, "edital_id")
    _guard_rate(auth.tenant_id, auth.user_id)
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="envie um PDF")
    content = await file.read(limits.max_pdf_bytes + 1)
    if len(content) > limits.max_pdf_bytes:
        raise HTTPException(status_code=413, detail="pdf_too_large")
    try:
        pages = await asyncio.wait_for(
            asyncio.to_thread(extract_pdf_pages, content), timeout=limits.reader_timeout_seconds
        )
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="reader_timeout") from error
    if len(pages) > limits.max_pdf_pages:
        raise HTTPException(status_code=413, detail="pdf_too_many_pages")
    if not pages and ocr_enabled:
        raise HTTPException(status_code=422, detail="OCR ainda depende de worker configurado")
    raw_chunks = chunk_pages(pages, auth.tenant_id, edital_id)
    embedded = embed_chunks(raw_chunks, embedding_provider)
    chunks.save(embedded)
    return {"paginas": len(pages), "chunks": len(embedded), "ocr_solicitado": ocr_enabled}


@app.post("/reader/analyze")
def reader_analyze(request: ReaderAnalyzeRequest, auth: AuthDependency) -> ReaderResult:
    _uuid(request.edital_id, "edital_id")
    _guard_rate(auth.tenant_id, auth.user_id)
    _consume_usage(auth.tenant_id, auth.user_id, request.pergunta, 1)
    return reader.analyze(auth.tenant_id, request.edital_id, request.pergunta)


@app.post("/ana/chat/stream")
def ana_chat_stream(request: AnaChatRequest, auth: AuthDependency) -> StreamingResponse:
    if request.conversa_id:
        _uuid(request.conversa_id, "conversa_id")
    _guard_rate(auth.tenant_id, auth.user_id)
    _consume_usage(auth.tenant_id, auth.user_id, request.mensagem, 1)
    response = ana.chat(auth.tenant_id, auth.user_id, request.conversa_id, request.mensagem)

    def stream() -> Iterator[str]:
        yield f"data: {json.dumps(response.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


def _guard_rate(tenant_id: str, user_id: str) -> None:
    try:
        rate_limiter.check(tenant_id, user_id)
    except LimitExceeded as error:
        raise HTTPException(status_code=429, detail=error.code, headers={"Retry-After": "60"}) from error


def _consume_usage(tenant_id: str, user_id: str, prompt: str, output_tokens: int) -> None:
    try:
        usage.consume(tenant_id, user_id, estimate_tokens(prompt), output_tokens)
    except LimitExceeded as error:
        raise HTTPException(status_code=429, detail=error.code) from error


def _uuid(value: str, field: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"{field} inválido") from error


if __name__ == "__main__":
    print(health())
