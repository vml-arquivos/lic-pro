"""Provider boundary for LLM and embeddings; no fake fallback in production."""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from typing import Any, Protocol

from .ingestion import DeterministicEmbeddingProvider, EmbeddingProvider
from .models import DocumentChunk


class LLMProvider(Protocol):
    name: str
    model: str

    def complete_json(self, *, system: str, prompt: str, chunks: Sequence[DocumentChunk]) -> Mapping[str, Any]:
        """Return JSON-compatible structured output."""


class FakeLLMProvider:
    name = "fake"

    def __init__(self, model: str = "offline-reader-v1") -> None:
        self.model = model

    def complete_json(self, *, system: str, prompt: str, chunks: Sequence[DocumentChunk]) -> Mapping[str, Any]:
        del system, prompt
        evidence = [
            {
                "pagina": chunk.pagina,
                "secao": chunk.secao,
                "clausula": chunk.clausula,
                "trecho": chunk.conteudo[:240],
                "fonte": chunk.fonte or f"página {chunk.pagina or 'não informada'}",
                "confianca": chunk.confianca or 0.75,
                "status_validacao": chunk.status_validacao,
            }
            for chunk in chunks[:3]
        ]
        return {
            "resumo": "Leitura inicial baseada somente nos trechos recuperados do documento.",
            "riscos": ["Confirme prazos, requisitos e anexos na fonte oficial."],
            "pontos_atencao": ["Verifique se todos os itens possuem unidade e critério de julgamento."],
            "checklist_documentos": ["Edital e anexos", "Documentos de habilitação", "Proposta conforme modelo"],
            "perguntas": ["Qual requisito ainda precisa ser confirmado na fonte original?"],
            "evidencias": evidence,
        }


def build_llm_provider(provider_name: str = "fake", *, model: str | None = None) -> LLMProvider:
    environment = os.getenv("NODE_ENV", "development")
    if environment == "production" and provider_name == "fake":
        raise RuntimeError("LLM_PROVIDER=fake é proibido em produção")
    if provider_name == "fake":
        return FakeLLMProvider(model or "offline-reader-v1")
    if provider_name == "openai":
        if not os.getenv("LLM_API_KEY"):
            raise RuntimeError("LLM_API_KEY é obrigatório para LLM_PROVIDER=openai")
        raise RuntimeError("provider openai ainda depende de adapter revisado")
    raise ValueError(f"provider de LLM não configurado: {provider_name}")


def build_embedding_provider(provider_name: str = "deterministic") -> EmbeddingProvider:
    environment = os.getenv("NODE_ENV", "development")
    if provider_name in {"fake", "deterministic"}:
        if environment == "production":
            raise RuntimeError("EMBEDDING_PROVIDER determinístico é proibido em produção")
        return DeterministicEmbeddingProvider()
    if provider_name == "openai":
        if not os.getenv("EMBEDDING_API_KEY"):
            raise RuntimeError("EMBEDDING_API_KEY é obrigatório para EMBEDDING_PROVIDER=openai")
        raise RuntimeError("provider de embeddings openai ainda depende de adapter revisado")
    raise ValueError(f"provider de embeddings não configurado: {provider_name}")
