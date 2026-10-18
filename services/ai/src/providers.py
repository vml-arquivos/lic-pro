"""Provider boundary for real LLM/embedding services; no fake fallback in production."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence
from typing import Any, Protocol

from .ingestion import DeterministicEmbeddingProvider, EmbeddingProvider
from .models import DocumentChunk


class LLMProviderError(RuntimeError):
    """A safe, provider-independent error that never contains credentials."""


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


class OpenAICompatibleProvider:
    name = "openai"

    def __init__(self, *, model: str, api_key: str, base_url: str, timeout_seconds: float = 60.0) -> None:
        self.model = model
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def complete_json(self, *, system: str, prompt: str, chunks: Sequence[DocumentChunk]) -> Mapping[str, Any]:
        context = "\n\n".join(
            f"[página {chunk.pagina or 'não informada'}] {chunk.conteudo[:5000]}" for chunk in chunks
        )
        response = self._chat(
            [
                {
                    "role": "system",
                    "content": (
                        f"{system} Retorne somente um objeto JSON válido com as chaves "
                        "resumo, riscos, pontos_atencao, checklist_documentos, perguntas e evidencias."
                    ),
                },
                {
                    "role": "user",
                    "content": f"{prompt}\n\nTRECHOS AUTORIZADOS DO DOCUMENTO:\n{context}",
                },
            ],
            response_format={"type": "json_object"},
        )
        try:
            parsed = json.loads(response)
        except json.JSONDecodeError as error:
            raise LLMProviderError("llm_provider_invalid_json") from error
        if not isinstance(parsed, dict):
            raise LLMProviderError("llm_provider_invalid_json")
        return parsed

    def complete_chat(self, *, system: str, messages: Sequence[Mapping[str, str]]) -> str:
        payload_messages = [{"role": "system", "content": system}]
        payload_messages.extend({"role": message["role"], "content": message["content"]} for message in messages)
        return self._chat(payload_messages)

    def _chat(self, messages: Sequence[Mapping[str, str]], response_format: Mapping[str, Any] | None = None) -> str:
        payload: dict[str, Any] = {"model": self.model, "messages": list(messages)}
        if response_format is not None:
            payload["response_format"] = response_format
        if self.model.startswith("gpt-5"):
            payload["max_completion_tokens"] = 1600
        else:
            payload["max_tokens"] = 1600
        result = _post_json(
            f"{self.base_url}/chat/completions",
            self.api_key,
            payload,
            self.timeout_seconds,
        )
        try:
            content = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMProviderError("llm_provider_invalid_response") from error
        if isinstance(content, list):
            content = "".join(str(item.get("text", "")) for item in content if isinstance(item, dict))
        if not isinstance(content, str) or not content.strip():
            raise LLMProviderError("llm_provider_empty_response")
        return content.strip()


class OpenAICompatibleEmbeddingProvider:
    dimension = 1024

    def __init__(self, *, model: str, api_key: str, base_url: str, timeout_seconds: float = 60.0) -> None:
        self.model = model
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        result = _post_json(
            f"{self.base_url}/embeddings",
            self.api_key,
            {"model": self.model, "input": list(texts), "dimensions": self.dimension},
            self.timeout_seconds,
        )
        rows = result.get("data")
        if not isinstance(rows, list):
            raise LLMProviderError("embedding_provider_invalid_response")
        try:
            ordered = sorted(rows, key=lambda row: int(row["index"]))
            vectors = [row["embedding"] for row in ordered]
        except (KeyError, TypeError, ValueError) as error:
            raise LLMProviderError("embedding_provider_invalid_response") from error
        if len(vectors) != len(texts) or any(
            not isinstance(vector, list) or len(vector) != self.dimension for vector in vectors
        ):
            raise LLMProviderError("embedding_provider_invalid_dimension")
        return vectors


def _post_json(url: str, api_key: str, payload: Mapping[str, Any], timeout_seconds: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        raise LLMProviderError(f"llm_provider_http_{error.code}") from error
    except (OSError, TimeoutError) as error:
        raise LLMProviderError("llm_provider_unavailable") from error
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise LLMProviderError("llm_provider_invalid_json") from error
    if not isinstance(parsed, dict):
        raise LLMProviderError("llm_provider_invalid_response")
    if "error" in parsed:
        raise LLMProviderError("llm_provider_error")
    return parsed


def _provider_connection(prefix: str) -> tuple[str, str, float]:
    api_key = os.getenv(f"{prefix}_API_KEY")
    if not api_key:
        raise RuntimeError(f"{prefix}_API_KEY é obrigatório")
    base_url = os.getenv(f"{prefix}_API_BASE_URL") or "https://api.openai.com/v1"
    try:
        timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
    except ValueError as error:
        raise RuntimeError("LLM_TIMEOUT_SECONDS inválido") from error
    return api_key, base_url, timeout


def build_llm_provider(provider_name: str = "fake", *, model: str | None = None) -> LLMProvider:
    environment = os.getenv("NODE_ENV", "development")
    if environment == "production" and provider_name in {"fake", "deterministic"}:
        raise RuntimeError("LLM_PROVIDER=fake/deterministic é proibido em produção")
    if provider_name == "fake":
        return FakeLLMProvider(model or "offline-reader-v1")
    if provider_name == "openai":
        api_key, base_url, timeout = _provider_connection("LLM")
        return OpenAICompatibleProvider(
            model=model or os.getenv("LLM_MODEL") or "gpt-5-mini",
            api_key=api_key,
            base_url=base_url,
            timeout_seconds=timeout,
        )
    raise ValueError(f"provider de LLM não configurado: {provider_name}")


def build_embedding_provider(
    provider_name: str = "deterministic", *, model: str | None = None
) -> EmbeddingProvider:
    environment = os.getenv("NODE_ENV", "development")
    if provider_name in {"fake", "deterministic"}:
        if environment == "production":
            raise RuntimeError("EMBEDDING_PROVIDER determinístico é proibido em produção")
        return DeterministicEmbeddingProvider()
    if provider_name == "openai":
        api_key, base_url, timeout = _provider_connection("EMBEDDING")
        return OpenAICompatibleEmbeddingProvider(
            model=model or os.getenv("EMBEDDING_MODEL") or "text-embedding-3-small",
            api_key=api_key,
            base_url=base_url,
            timeout_seconds=timeout,
        )
    raise ValueError(f"provider de embeddings não configurado: {provider_name}")
