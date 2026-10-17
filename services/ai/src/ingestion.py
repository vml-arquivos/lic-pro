"""PDF extraction, structural chunking and embedding boundaries."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Callable, Sequence
from io import BytesIO
from typing import Protocol

from pypdf import PdfReader

from .models import DocumentChunk, PageText

_HEADING = re.compile(
    r"^\s*(?P<head>(?:cláusula|clausula|item|seção|secao|capítulo|capitulo)\b|\d+(?:\.\d+)*\.?\s+).{2,}$",
    re.IGNORECASE,
)


class EmbeddingProvider(Protocol):
    dimension: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Return one vector per text."""


class DeterministicEmbeddingProvider:
    """Offline-safe baseline; replace through config with a reviewed provider."""

    dimension = 1024

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            seed = hashlib.sha256(text.encode("utf-8")).digest()
            values = [((seed[index % len(seed)] / 255.0) * 2.0) - 1.0 for index in range(self.dimension)]
            norm = math.sqrt(sum(value * value for value in values)) or 1.0
            vectors.append([value / norm for value in values])
        return vectors


def extract_pdf_pages(content: bytes, *, ocr: Callable[[bytes, int], str] | None = None) -> list[PageText]:
    reader = PdfReader(BytesIO(content))
    pages: list[PageText] = []
    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text and ocr is not None:
            text = ocr(content, index).strip()
        if text:
            pages.append(PageText(pagina=index, texto=text))
    return pages


def chunk_pages(pages: Sequence[PageText], tenant_id: str, edital_id: str) -> list[DocumentChunk]:
    """Split at semantic headings and paragraphs instead of arbitrary token windows."""
    chunks: list[DocumentChunk] = []
    current: list[str] = []
    current_page: int | None = None
    section: str | None = None
    clause: str | None = None

    def flush() -> None:
        nonlocal current, current_page
        content = "\n".join(line.strip() for line in current if line.strip()).strip()
        if content:
            chunks.append(
                DocumentChunk(
                    tenant_id=tenant_id,
                    edital_id=edital_id,
                    pagina=current_page,
                    secao=section,
                    clausula=clause,
                    conteudo=content,
                    metadata={"chunking": "structural-heading-paragraph"},
                )
            )
        current = []
        current_page = None

    for page in pages:
        for raw_line in page.texto.splitlines():
            line = raw_line.strip()
            if not line:
                if current:
                    flush()
                continue
            heading = _HEADING.match(line)
            if heading:
                flush()
                section = line
                clause = line if line.lower().startswith(("cláusula", "clausula")) else clause
            if current_page is None:
                current_page = page.pagina
            current.append(line)
        if current:
            flush()

    flush()
    return chunks


def embed_chunks(chunks: Sequence[DocumentChunk], provider: EmbeddingProvider) -> list[DocumentChunk]:
    embeddings = provider.embed([chunk.conteudo for chunk in chunks])
    if len(embeddings) != len(chunks):
        raise ValueError("provider de embeddings retornou quantidade diferente de chunks")
    return [
        DocumentChunk(
            tenant_id=chunk.tenant_id,
            edital_id=chunk.edital_id,
            pagina=chunk.pagina,
            secao=chunk.secao,
            clausula=chunk.clausula,
            conteudo=chunk.conteudo,
            metadata=chunk.metadata,
            embedding=tuple(vector),
        )
        for chunk, vector in zip(chunks, embeddings, strict=True)
    ]
