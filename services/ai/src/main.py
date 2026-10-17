"""FastAPI entry point for Reader/RAG and Ana's read-only assistant."""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .ana import AnaService, InMemoryConversationStore, InMemoryToolCallAuditor
from .ingestion import DeterministicEmbeddingProvider, chunk_pages, embed_chunks, extract_pdf_pages
from .models import AnaChatRequest, ReaderAnalyzeRequest, ReaderResult
from .providers import build_llm_provider
from .reader import InMemoryAnalysisStore, InMemoryChunkStore, ReaderAgent


@dataclass(frozen=True)
class ServiceHealth:
    service: str
    status: str = "ok"


def health() -> ServiceHealth:
    return ServiceHealth(service="ai")


chunks = InMemoryChunkStore()
analyses = InMemoryAnalysisStore()
reader = ReaderAgent(build_llm_provider("fake"), chunks, analyses)
ana = AnaService(analyses, InMemoryConversationStore(), InMemoryToolCallAuditor())
app = FastAPI(title="Licite Comigo AI", version="0.2.0")


@app.get("/health")
def health_route() -> ServiceHealth:
    return health()


@app.post("/reader/ingest")
async def reader_ingest(
    file: Annotated[UploadFile, File(...)],
    tenant_id: Annotated[str, Form(...)],
    edital_id: Annotated[str, Form(...)],
    ocr_enabled: Annotated[bool, Form()] = False,
) -> dict[str, int | bool]:
    _uuid(tenant_id, "tenant_id")
    _uuid(edital_id, "edital_id")
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="envie um PDF")
    content = await file.read()
    pages = extract_pdf_pages(content)
    if not pages and ocr_enabled:
        raise HTTPException(status_code=422, detail="OCR ainda depende de worker configurado")
    raw_chunks = chunk_pages(pages, tenant_id, edital_id)
    embedded = embed_chunks(raw_chunks, DeterministicEmbeddingProvider())
    chunks.save(embedded)
    return {"paginas": len(pages), "chunks": len(embedded), "ocr_solicitado": ocr_enabled}


@app.post("/reader/analyze")
def reader_analyze(request: ReaderAnalyzeRequest) -> ReaderResult:
    _uuid(request.tenant_id, "tenant_id")
    _uuid(request.edital_id, "edital_id")
    return reader.analyze(request.tenant_id, request.edital_id, request.pergunta)


@app.post("/ana/chat/stream")
def ana_chat_stream(request: AnaChatRequest) -> StreamingResponse:
    _uuid(request.tenant_id, "tenant_id")
    _uuid(request.user_id, "user_id")
    if request.conversa_id:
        _uuid(request.conversa_id, "conversa_id")
    response = ana.chat(request.tenant_id, request.user_id, request.conversa_id, request.mensagem)

    def stream() -> Iterator[str]:
        yield f"data: {json.dumps(response.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


def _uuid(value: str, field: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"{field} inválido") from error


if __name__ == "__main__":
    print(health())
