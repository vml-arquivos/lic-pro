"""Ana: read-only assistant with explicit tenant and tool boundaries."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Protocol

from .models import AnaChatResponse, Evidence
from .reader import AnalysisStore


class ReadOnlyTool(Protocol):
    name: str

    def run(self, tenant_id: str, argument: str) -> tuple[str, list[Evidence]]:
        """Read within tenant scope; never mutate a record."""


class AnalysisReaderTool:
    name = "ler_analise_edital"

    def __init__(self, analyses: AnalysisStore) -> None:
        self.analyses = analyses

    def run(self, tenant_id: str, argument: str) -> tuple[str, list[Evidence]]:
        analysis = self.analyses.get(tenant_id, argument)
        if analysis is None:
            return "Ainda não encontrei uma análise deste edital nesta conta.", []
        return analysis.resultado.resumo, analysis.resultado.evidencias


class GlossaryTool:
    name = "explicar_conceito"

    def run(self, tenant_id: str, argument: str) -> tuple[str, list[Evidence]]:
        del tenant_id
        term = argument.strip().lower()
        definitions = {
            "edital": "Documento que reúne regras, prazos e requisitos da oportunidade.",
            "habilitação": "Conjunto de documentos e condições exigidos para participar.",
            "catmat": "Catálogo de materiais usado para identificar itens de material.",
            "catser": "Catálogo de serviços usado para identificar itens de serviço.",
        }
        return definitions.get(term, "Não tenho uma definição revisada para esse termo."), []


class SearchEditaisTool:
    name = "buscar_editais"

    def run(self, tenant_id: str, argument: str) -> tuple[str, list[Evidence]]:
        return f"Busca de editais para “{argument}” no tenant {tenant_id[:8]} concluída pelo core API.", []


class ConversationStore(Protocol):
    def append(self, tenant_id: str, user_id: str, conversa_id: str, role: str, text: str) -> None:
        """Persist chat history in tenant scope."""


class ToolCallAuditor(Protocol):
    def record(self, tenant_id: str, conversa_id: str, tool: str, argument: str) -> None:
        """Record a read-only tool call in tenant scope."""


@dataclass(frozen=True)
class ChatMessage:
    role: str
    text: str


class InMemoryConversationStore:
    def __init__(self) -> None:
        self.messages: dict[tuple[str, str, str], list[ChatMessage]] = {}

    def append(self, tenant_id: str, user_id: str, conversa_id: str, role: str, text: str) -> None:
        self.messages.setdefault((tenant_id, user_id, conversa_id), []).append(ChatMessage(role, text))


class InMemoryToolCallAuditor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, str]] = []

    def record(self, tenant_id: str, conversa_id: str, tool: str, argument: str) -> None:
        self.calls.append((tenant_id, conversa_id, tool, argument))


class AnaService:
    disclaimer = (
        "Sou uma assistente de leitura e organização. Não dou conclusão jurídica, não prometo vitória "
        "e você deve confirmar o edital e os anexos na fonte oficial."
    )

    def __init__(
        self,
        analyses: AnalysisStore,
        history: ConversationStore,
        auditor: ToolCallAuditor | None = None,
    ) -> None:
        self.history = history
        self.auditor = auditor
        self.tools: dict[str, ReadOnlyTool] = {
            "ler_analise_edital": AnalysisReaderTool(analyses),
            "explicar_conceito": GlossaryTool(),
            "buscar_editais": SearchEditaisTool(),
        }

    def chat(self, tenant_id: str, user_id: str, conversa_id: str | None, message: str) -> AnaChatResponse:
        conversation = conversa_id or str(uuid.uuid4())
        self.history.append(tenant_id, user_id, conversation, "usuario", message)
        tool_name, argument = self._intent(message)
        if self.auditor is not None:
            self.auditor.record(tenant_id, conversation, tool_name, argument)
        text, evidence = self.tools[tool_name].run(tenant_id, argument)
        if _asks_for_legal_conclusion(message):
            text = "Posso apontar trechos e perguntas para revisão, mas não posso concluir juridicamente."
        response = AnaChatResponse(
            conversa_id=conversation,
            texto=f"{text}\n\n{self.disclaimer}",
            fontes=evidence,
            ferramentas=[tool_name],
        )
        self.history.append(tenant_id, user_id, conversation, "assistente", response.texto)
        return response

    @staticmethod
    def _intent(message: str) -> tuple[str, str]:
        lowered = message.lower()
        if any(term in lowered for term in ("conceito", "o que é", "significa", "catmat", "catser")):
            term = re.sub(r".*?(?:conceito|sobre|de)\s+", "", lowered).strip(" ?.,!") or "edital"
            return "explicar_conceito", term
        if any(term in lowered for term in ("análise", "analise", "ler edital", "riscos")):
            match = re.search(r"[0-9a-f]{8}-[0-9a-f-]{27,}", lowered)
            return "ler_analise_edital", match.group(0) if match else lowered
        return "buscar_editais", message


def _asks_for_legal_conclusion(message: str) -> bool:
    lowered = message.lower()
    return any(term in lowered for term in ("é legal", "e legal", "pode participar", "garante vitória"))
