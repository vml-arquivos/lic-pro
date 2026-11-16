"""Ana: read-only assistant with explicit tenant and tool boundaries."""

from __future__ import annotations

import json
import re
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, cast

from .core_client import CoreClient
from .guia import GUIDE, find_guide, topics_for
from .models import AnaChatResponse, AnaLink, Evidence
from .personas import build_system_prompt, persona_for, resolve_area
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
            "edital": ("Documento que reúne regras, prazos e requisitos da oportunidade.", "rascunho_para_revisao"),
            "habilitação": ("Conjunto de documentos e condições exigidos para participar.", "rascunho_para_revisao"),
            "catmat": ("Catálogo de materiais usado para identificar itens de material.", "rascunho_para_revisao"),
            "catser": ("Catálogo de serviços usado para identificar itens de serviço.", "rascunho_para_revisao"),
        }
        definition = definitions.get(term)
        if definition is None:
            return "Não tenho uma definição revisada para esse termo.", []
        text, status = definition
        if status == "rascunho_para_revisao":
            text += " Aviso: conteúdo em revisão, confirme na norma vigente."
        return text, []


class SearchEditaisTool:
    name = "buscar_editais"

    def run(self, tenant_id: str, argument: str) -> tuple[str, list[Evidence]]:
        del tenant_id
        return (
            f"O Radar pode consultar oportunidades oficiais para o tema “{argument}”. "
            "Use os filtros do Radar para executar a busca e abra o edital na fonte original.",
            [],
        )


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

    def recent(self, tenant_id: str, user_id: str, conversa_id: str, limit: int = 12) -> list[ChatMessage]:
        return self.messages.get((tenant_id, user_id, conversa_id), [])[-limit:]


class InMemoryToolCallAuditor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, str]] = []

    def record(self, tenant_id: str, conversa_id: str, tool: str, argument: str) -> None:
        self.calls.append((tenant_id, conversa_id, tool, argument))


@dataclass(frozen=True)
class AnaSession:
    """Quem está falando com a Ana e de qual painel: serve para falar certo e ler só o permitido."""

    role: str = "admin"
    token: str = ""
    acting_as: str | None = None
    page: str | None = None


_GUIDE_PHRASES = (
    "como faço",
    "como faco",
    "como crio",
    "como cadastro",
    "como configuro",
    "como uso",
    "onde fica",
    "onde encontro",
    "onde vejo",
    "onde esta",
    "onde está",
    "passo a passo",
    "como funciona",
    "como salvo",
    "como ativo",
    "como acesso",
    "como altero",
    "como mudo",
    "como troco",
    "como analiso",
    "como analisar",
    "como monto",
    "como montar",
    "como emito",
    "como cancelo",
    "como adiciono",
    "como edito",
)
_SUMMARY_TERMS = (
    "resumo",
    "resuma",
    "novidade",
    "o que tem de novo",
    "o que preciso fazer",
    "o que devo fazer",
    "o que fazer",
    "pendência",
    "pendencia",
    "prioridade",
    "como estou",
    "como está",
    "como esta",
    "situação",
    "situacao",
    "relatório",
    "relatorio",
    "esta semana",
    "próximo passo",
    "proximo passo",
    "estudar hoje",
    "para hoje",
    "hoje?",
    "precisam de atenção",
    "precisam de atencao",
    "engajamento",
    "como está a coleta",
    "como esta a coleta",
)
_SEARCH_TERMS = (
    "licitaç",
    "licitac",
    "edital",
    "editais",
    "oportunidade",
    "pregão",
    "pregao",
    "buscar",
    "busque",
    "procure",
    "encontre",
    "melhores",
    "combinam",
    "combina",
    "abertas",
    "encerram",
    "encerra",
)


def _short_date(value: object) -> str:
    """`2026-11-15T12:00:00Z` -> `15/11` (vazio se não for uma data)."""
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(value or ""))
    return f"{match.group(3)}/{match.group(2)}" if match else ""


def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


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
        llm_provider: object | None = None,
        core: CoreClient | None = None,
    ) -> None:
        self.history = history
        self.auditor = auditor
        self.llm_provider = llm_provider
        self.core = core or CoreClient(base_url=None)
        self.tools: dict[str, ReadOnlyTool] = {
            "ler_analise_edital": AnalysisReaderTool(analyses),
            "explicar_conceito": GlossaryTool(),
            "buscar_editais": SearchEditaisTool(),
        }

    def chat(
        self,
        tenant_id: str,
        user_id: str,
        conversa_id: str | None,
        message: str,
        session: AnaSession | None = None,
    ) -> AnaChatResponse:
        conversation = conversa_id or str(uuid.uuid4())
        self.history.append(tenant_id, user_id, conversation, "usuario", message)
        active = session or AnaSession()
        area = resolve_area(active.role, active.acting_as)
        context = self.core.context(active.token, user_id, active.acting_as) if active.token else None
        tool_name, argument = self._intent(message, area)
        if self.auditor is not None:
            self.auditor.record(tenant_id, conversation, tool_name, argument)
        links: list[AnaLink] = []
        if tool_name == "resumo_do_painel":
            text, evidence, links = self._summary(area, context)
        elif tool_name == "guia_do_sistema":
            text, evidence, links = self._guide(message, area)
        elif tool_name == "buscar_editais" and self.core.enabled and active.token:
            text, evidence, links = self._search(active, message)
        elif tool_name == "conversar":
            text, evidence, links = self._chat_only(area, context)
        else:
            text, evidence = self.tools[tool_name].run(tenant_id, argument)
        text = self._complete_with_provider(
            tenant_id,
            user_id,
            conversation,
            message,
            tool_name,
            text,
            evidence,
            area=area,
            context=context,
            page=active.page,
        )
        legal = _asks_for_legal_conclusion(message)
        if legal:
            text = f"Posso apontar trechos e perguntas para revisão, mas não posso concluir juridicamente. {text}"
        needs_disclaimer = legal or tool_name in {"ler_analise_edital", "explicar_conceito", "buscar_editais"}
        response = AnaChatResponse(
            conversa_id=conversation,
            texto=f"{text}\n\n{self.disclaimer}" if needs_disclaimer else text,
            fontes=evidence,
            ferramentas=[tool_name],
            links=links,
        )
        self.history.append(tenant_id, user_id, conversation, "assistente", response.texto)
        return response

    # ----- ferramentas por painel (somente leitura) -----

    @staticmethod
    def _summary(area: str, context: dict[str, Any] | None) -> tuple[str, list[Evidence], list[AnaLink]]:
        if not context:
            return (
                "Não consegui ler os dados da sua conta agora. Tente de novo daqui a pouco. "
                "Enquanto isso, posso tirar dúvidas, buscar licitações ou explicar um passo a passo.",
                [],
                [],
            )
        lines = [str(item) for item in context.get("resumo", []) if item]
        highlights = [item for item in context.get("destaques", []) if isinstance(item, dict) and item.get("texto")]
        parts: list[str] = []
        name = context.get("nome")
        parts.append(f"{'Oi, ' + str(name) + '! ' if name else ''}Veja o que separei para você hoje:")
        parts.extend(f"• {line}" for line in lines[:6])
        attention = [item for item in highlights if item.get("tom") == "atencao"][:3]
        others = [item for item in highlights if item.get("tom") != "atencao"][:2]
        if attention:
            parts.append("Vale resolver primeiro:")
            parts.extend(f"→ {item['texto']}" for item in attention)
        if others:
            parts.append("Dê uma olhada também:")
            parts.extend(f"→ {item['texto']}" for item in others)
        links = [
            AnaLink(texto=str(item["texto"])[:70], href=str(item["href"]))
            for item in [*attention, *others]
            if item.get("href")
        ][:4]
        return "\n".join(parts), [], links

    @staticmethod
    def _guide(message: str, area: str) -> tuple[str, list[Evidence], list[AnaLink]]:
        found = find_guide(message, area)
        if found is None:
            topics = [entry.titulo for entry in GUIDE if area in entry.areas][:8]
            return (
                "Ainda não tenho um passo a passo para essa pergunta. Posso te ajudar com: " + "; ".join(topics) + ".",
                [],
                [],
            )
        return found.resposta, [], [AnaLink(texto=found.titulo, href=found.href)]

    def _search(self, session: AnaSession, message: str) -> tuple[str, list[Evidence], list[AnaLink]]:
        result = self.core.search_editais(session.token, session.acting_as, message)
        if result is None:
            return (
                "Não consegui consultar as licitações agora. Você pode usar o Explorar licitações e, daqui a "
                "pouco, tentar de novo comigo.",
                [],
                [AnaLink(texto="Explorar licitações", href="/radar")],
            )
        rows, total, words = result
        topic = f" para “{' / '.join(words)}”" if words else " que combinam com o seu perfil"
        if not rows:
            return (
                f"Não achei licitações abertas{topic} nos seus nichos. Tente outras palavras ou amplie os "
                "filtros em Explorar licitações.",
                [],
                [AnaLink(texto="Explorar licitações", href="/radar")],
            )
        found = "Achei 1 licitação aberta" if total == 1 else f"Achei {total} licitações abertas"
        lines = [f"{found}{topic}." + ("" if total == 1 else " As melhores vêm primeiro:")]
        links: list[AnaLink] = []
        for row in rows[:5]:
            title = str(row.get("titulo") or "Sem título")[:100]
            where = " · ".join(str(row[k]) for k in ("orgao", "uf") if row.get(k))
            deadline = _short_date(row.get("data_encerramento_proposta"))
            compat = row.get("compat")
            extra = [
                x
                for x in (
                    where,
                    f"termina {deadline}" if deadline else "",
                    f"combina {compat}% com você" if compat is not None else "",
                )
                if x
            ]
            lines.append(f"• {title}" + (f" — {'; '.join(extra)}" if extra else ""))
            if row.get("id"):
                links.append(AnaLink(texto=title[:60], href=f"/radar/{row['id']}"))
        lines.append("Abra cada uma para ver os itens, os anexos e a fonte oficial.")
        return "\n".join(lines), [], links

    @staticmethod
    def _chat_only(area: str, context: dict[str, Any] | None) -> tuple[str, list[Evidence], list[AnaLink]]:
        persona = persona_for(area)
        suggestions = [str(item) for item in (context or {}).get("sugestoes", [])][:3]
        text = f"{persona.saudacao} Como posso te ajudar?"
        if suggestions:
            text += " Se quiser, comece por aqui: " + " · ".join(f"“{item}”" for item in suggestions)
        return text, [], []

    def _complete_with_provider(
        self,
        tenant_id: str,
        user_id: str,
        conversa_id: str,
        message: str,
        tool_name: str,
        tool_text: str,
        evidence: list[Evidence],
        *,
        area: str = "empresa",
        context: dict[str, Any] | None = None,
        page: str | None = None,
    ) -> str:
        complete_chat = getattr(self.llm_provider, "complete_chat", None)
        if not callable(complete_chat):
            return tool_text
        complete = cast(Callable[..., str], complete_chat)
        recent = getattr(self.history, "recent", None)
        history = recent(tenant_id, user_id, conversa_id, 12) if callable(recent) else []
        messages = [
            {"role": "user" if item.role == "usuario" else "assistant", "content": item.text} for item in history
        ]
        evidence_text = (
            "\n".join(f"- página {item.pagina or 'não informada'}: {item.trecho[:240]}" for item in evidence)
            or "Nenhuma evidência documental foi recuperada."
        )
        context_text = ""
        if context:
            facts = json.dumps(context.get("fatos", {}), ensure_ascii=False, default=str)[:1500]
            context_text = " ".join(str(line) for line in context.get("resumo", [])) + f" Dados: {facts}"
        system = build_system_prompt(
            area=area,
            nome=str(context.get("nome")) if context and context.get("nome") else None,
            context_text=context_text,
            tool_name=tool_name,
            tool_text=tool_text,
            evidence_text=evidence_text,
            page=page,
            guide_topics=topics_for(area),
        )
        return complete(system=system, messages=messages or [{"role": "user", "content": message}])

    @staticmethod
    def _intent(message: str, area: str = "empresa") -> tuple[str, str]:
        lowered = message.lower()
        if any(term in lowered for term in ("conceito", "o que é", "significa", "catmat", "catser")):
            term = re.sub(r".*?(?:conceito|sobre|de)\s+", "", lowered).strip(" ?.,!") or "edital"
            return "explicar_conceito", term
        if any(term in lowered for term in ("análise", "analise", "ler edital", "riscos")):
            match = re.search(r"[0-9a-f]{8}-[0-9a-f-]{27,}", lowered)
            return "ler_analise_edital", match.group(0) if match else lowered
        if any(term in lowered for term in _SUMMARY_TERMS):
            return "resumo_do_painel", message
        searching = any(term in lowered for term in _SEARCH_TERMS)
        if any(phrase in lowered for phrase in _GUIDE_PHRASES):
            return "guia_do_sistema", message
        if not searching and find_guide(message, area) is not None:
            return "guia_do_sistema", message
        if searching:
            return "buscar_editais", message
        return "conversar", message


def _asks_for_legal_conclusion(message: str) -> bool:
    lowered = message.lower()
    return any(term in lowered for term in ("é legal", "e legal", "pode participar", "garante vitória"))
