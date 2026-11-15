"""Leitura do core-api com a sessão de quem está conversando com a Ana.

A Ana nunca usa uma credencial própria: repassa o token da pessoa, então valem as mesmas
permissões, o mesmo isolamento por conta e os mesmos nichos que ela teria nas telas. Só leitura.
Se o endereço do core-api não estiver configurado ou a chamada falhar, a Ana continua respondendo
sem os dados da conta (nunca inventa o que não conseguiu ler).
"""

from __future__ import annotations

import json
import logging
import os
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ana.core")

STOPWORDS = frozenset(
    [
        "a",
        "o",
        "as",
        "os",
        "um",
        "uma",
        "uns",
        "umas",
        "de",
        "do",
        "da",
        "dos",
        "das",
        "em",
        "no",
        "na",
        "nos",
        "nas",
        "por",
        "para",
        "pra",
        "com",
        "sem",
        "sobre",
        "e",
        "ou",
        "que",
        "qual",
        "quais",
        "quanto",
        "quantas",
        "quantos",
        "como",
        "onde",
        "quando",
        "eu",
        "meu",
        "minha",
        "meus",
        "minhas",
        "me",
        "nos",
        "nosso",
        "nossa",
        "seu",
        "sua",
        "voce",
        "vc",
        "tem",
        "ter",
        "ha",
        "existe",
        "existem",
        "tem",
        "mais",
        "menos",
        "muito",
        "pouco",
        "ainda",
        "ja",
        "so",
        "tambem",
        "favor",
        "pode",
        "podem",
        "poderia",
        "quero",
        "queria",
        "preciso",
        "gostaria",
        "busque",
        "busca",
        "buscar",
        "procure",
        "procurar",
        "encontre",
        "encontrar",
        "mostre",
        "mostrar",
        "liste",
        "listar",
        "ver",
        "veja",
        "diga",
        "dizer",
        "licitacao",
        "licitacoes",
        "edital",
        "editais",
        "oportunidade",
        "oportunidades",
        "pregao",
        "pregoes",
        "aberta",
        "abertas",
        "aberto",
        "abertos",
        "agora",
        "hoje",
        "melhor",
        "melhores",
        "boa",
        "boas",
        "bom",
        "bons",
        "combina",
        "combinam",
        "combinar",
        "compativel",
        "compativeis",
        "segmento",
        "segmentos",
        "nicho",
        "nichos",
        "area",
        "areas",
        "perfil",
        "algum",
        "alguma",
        "alguns",
        "algumas",
        "todas",
        "todos",
        "tudo",
        "coisa",
        "coisas",
        "pra",
        "isso",
        "essa",
        "esse",
        "esses",
        "essas",
        "aquela",
        "aquele",
        "estao",
        "esta",
        "estou",
        "sao",
        "foi",
        "vai",
        "vao",
        "for",
        "ser",
        "fazer",
        "faz",
        "fazem",
        "dar",
        "mim",
        "ti",
        "lhe",
        "nele",
        "dele",
        "dela",
        "da",
        "dao",
    ]
)


def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def keywords(message: str, limit: int = 4) -> list[str]:
    """Palavras úteis da pergunta (sem artigos e termos genéricos) para a busca de editais."""
    found: list[str] = []
    for raw in message.replace("?", " ").replace(",", " ").replace(".", " ").replace("!", " ").split():
        word = raw.strip("\"'()[]:;")
        if len(word) < 3 or _plain(word) in STOPWORDS or word.isdigit():
            continue
        if word.lower() not in found:
            found.append(word.lower())
    return found[:limit]


@dataclass
class CoreClient:
    base_url: str | None
    timeout: float = 5.0
    ttl_seconds: float = 45.0
    _cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> CoreClient:
        url = os.getenv("CORE_API_INTERNAL_URL", "").strip().rstrip("/")
        return cls(base_url=url or None)

    @property
    def enabled(self) -> bool:
        return bool(self.base_url)

    def _get(self, path: str, token: str, acting_as: str | None) -> Any | None:
        if not self.base_url or not token:
            return None
        headers = {"authorization": f"Bearer {token}", "accept": "application/json"}
        if acting_as:
            headers["x-acting-as"] = acting_as
        request = urllib.request.Request(f"{self.base_url}{path}", headers=headers, method="GET")  # noqa: S310
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
            logger.warning("core-api indisponível para %s: %s", path.split("?")[0], type(error).__name__)
            return None

    def context(self, token: str, user_id: str, acting_as: str | None) -> dict[str, Any] | None:
        """Resumo da conta para o tipo de usuário (guardado por poucos segundos)."""
        key = (user_id, acting_as or "")
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < self.ttl_seconds:
            return cached[1]
        data = self._get("/ana/contexto", token, acting_as)
        if not isinstance(data, dict):
            return None
        if len(self._cache) > 500:
            self._cache.clear()
        self._cache[key] = (time.monotonic(), data)
        return data

    def search_editais(
        self, token: str, acting_as: str | None, message: str, limit: int = 5
    ) -> tuple[list[dict[str, Any]], int, list[str]] | None:
        """Licitações abertas que combinam com a pergunta (e com o perfil, quando há).

        Devolve (editais, total, palavras usadas) ou None se não foi possível consultar.
        """
        words = keywords(message)
        params: dict[str, str] = {"situacao_prazo": "abertas", "page_size": str(limit), "facetas": "false"}
        if words:
            params["q"] = " or ".join(words)
        for ordem in ("compat", "recentes"):
            query = urllib.parse.urlencode({**params, "ordem": ordem})
            data = self._get(f"/editais?{query}", token, acting_as)
            if isinstance(data, dict) and isinstance(data.get("data"), list):
                total = data.get("total")
                rows = [row for row in data["data"] if isinstance(row, dict)]
                return rows, int(total) if isinstance(total, int | float) else len(rows), words
        return None
