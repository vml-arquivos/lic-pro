"""Typed contracts for Reader/RAG and Ana."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field


class Evidence(BaseModel):
    pagina: int | None = Field(default=None, ge=1)
    secao: str | None = None
    clausula: str | None = None
    trecho: str = Field(min_length=1)
    chunk_id: str | None = None


class ReaderResult(BaseModel):
    resumo: str
    riscos: list[str] = Field(default_factory=list)
    pontos_atencao: list[str] = Field(default_factory=list)
    checklist_documentos: list[str] = Field(default_factory=list)
    perguntas: list[str] = Field(default_factory=list)
    evidencias: list[Evidence] = Field(default_factory=list)
    disclaimer: str = (
        "Leitura de apoio, não é conclusão jurídica nem promessa de resultado. "
        "Confirme o edital e seus anexos na fonte oficial."
    )


class AnaChatRequest(BaseModel):
    tenant_id: str
    user_id: str
    conversa_id: str | None = None
    mensagem: str = Field(min_length=1, max_length=4000)


class AnaChatResponse(BaseModel):
    conversa_id: str
    texto: str
    fontes: list[Evidence] = Field(default_factory=list)
    ferramentas: list[str] = Field(default_factory=list)
    somente_leitura: Literal[True] = True


class ReaderAnalyzeRequest(BaseModel):
    tenant_id: str
    edital_id: str
    pergunta: str = Field(default="Faça uma leitura inicial do edital.", max_length=1000)


@dataclass(frozen=True)
class PageText:
    pagina: int
    texto: str


@dataclass(frozen=True)
class DocumentChunk:
    tenant_id: str
    edital_id: str
    pagina: int | None
    secao: str | None
    clausula: str | None
    conteudo: str
    metadata: dict[str, Any]
    embedding: tuple[float, ...] = ()


@dataclass(frozen=True)
class StoredAnalysis:
    tenant_id: str
    edital_id: str
    resultado: ReaderResult
    modelo: str
    prompt_version: str
