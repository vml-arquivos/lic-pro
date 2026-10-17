"""Provider boundary for LLM calls; no provider is hardcoded in Reader."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol

from .models import DocumentChunk


class LLMProvider(Protocol):
    name: str
    model: str

    def complete_json(self, *, system: str, prompt: str, chunks: Sequence[DocumentChunk]) -> Mapping[str, Any]:
        """Return JSON-compatible structured output."""


class FakeLLMProvider:
    name = "fake"
    model = "offline-reader-v1"

    def complete_json(self, *, system: str, prompt: str, chunks: Sequence[DocumentChunk]) -> Mapping[str, Any]:
        del system, prompt
        evidence = [
            {
                "pagina": chunk.pagina,
                "secao": chunk.secao,
                "clausula": chunk.clausula,
                "trecho": chunk.conteudo[:240],
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


def build_llm_provider(provider_name: str = "fake") -> LLMProvider:
    if provider_name == "fake":
        return FakeLLMProvider()
    raise ValueError(f"provider de LLM não configurado para uso seguro: {provider_name}")
