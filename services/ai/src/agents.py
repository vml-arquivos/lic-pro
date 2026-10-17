"""Future agent boundaries; Phase 3 keeps them read-only and unimplemented."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AgentContext:
    tenant_id: str
    user_id: str
    correlation_id: str


class DomainAgent(Protocol):
    name: str

    def run(self, context: AgentContext, instruction: str) -> str:
        """Execute a bounded domain task."""


class HunterAgent:
    name = "hunter"

    def run(self, context: AgentContext, instruction: str) -> str:
        raise NotImplementedError("Hunter entra após a revisão da Fase 3")


class PricerAgent:
    name = "pricer"

    def run(self, context: AgentContext, instruction: str) -> str:
        raise NotImplementedError("Pricer entra após a revisão da Fase 3")


class WriterAgent:
    name = "writer"

    def run(self, context: AgentContext, instruction: str) -> str:
        raise NotImplementedError("Writer entra após a revisão da Fase 3")
