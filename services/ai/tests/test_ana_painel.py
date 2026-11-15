"""Ana por painel: tom, resumo, guia e busca real com a sessão de quem pergunta."""

from __future__ import annotations

import json
import threading
from collections.abc import Mapping, Sequence
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from src.ana import AnaService, AnaSession, InMemoryConversationStore
from src.core_client import CoreClient, keywords
from src.personas import resolve_area
from src.reader import InMemoryAnalysisStore


class FakeCore(CoreClient):
    def __init__(self, context: dict[str, Any] | None = None, rows: list[dict[str, Any]] | None = None) -> None:
        super().__init__(base_url="http://core.test")
        self._context = context
        self._rows = rows
        self.searches: list[str] = []

    def context(self, token: str, user_id: str, acting_as: str | None) -> dict[str, Any] | None:
        return self._context

    def search_editais(
        self, token: str, acting_as: str | None, message: str, limit: int = 5
    ) -> tuple[list[dict[str, Any]], int, list[str]] | None:
        self.searches.append(message)
        if self._rows is None:
            return None
        return self._rows, len(self._rows), keywords(message)


class CapturingProvider:
    name = "capture"
    model = "capture"

    def __init__(self) -> None:
        self.system = ""

    def complete_chat(self, *, system: str, messages: Sequence[Mapping[str, str]]) -> str:
        self.system = system
        return "resposta do modelo"


def ana(core: CoreClient | None = None, provider: object | None = None) -> AnaService:
    return AnaService(InMemoryAnalysisStore(), InMemoryConversationStore(), None, provider, core)


ALUNO_CONTEXTO = {
    "nome": "Maria",
    "resumo": ["Você concluiu 3 de 10 aulas (30%)."],
    "destaques": [{"texto": "Continue de onde parou: Habilitação.", "href": "/academia", "tom": "info"}],
    "sugestoes": ["O que devo estudar hoje?"],
    "fatos": {"progresso": {"aulas_concluidas": 3}},
}


def test_area_vem_do_papel_e_so_a_equipe_pode_ver_como() -> None:
    assert resolve_area("aluno", None) == "aluno"
    assert resolve_area("admin", None) == "empresa"
    assert resolve_area("plataforma", None) == "administracao"
    assert resolve_area("plataforma", "curso") == "curso"
    assert resolve_area("aluno", "administracao") == "aluno"
    assert resolve_area("operador", "curso") == "empresa"


def test_resumo_usa_dados_da_conta_e_aponta_o_proximo_passo() -> None:
    response = ana(FakeCore(ALUNO_CONTEXTO)).chat(
        "t", "u", None, "O que devo estudar hoje?", AnaSession(role="aluno", token="tok")
    )
    assert response.ferramentas == ["resumo_do_painel"]
    assert "Oi, Maria" in response.texto
    assert "3 de 10 aulas" in response.texto
    assert [link.href for link in response.links] == ["/academia"]
    assert "Sou uma assistente de leitura" not in response.texto


def test_resumo_sem_dados_nao_inventa_nada() -> None:
    response = ana(FakeCore(None)).chat(
        "t", "u", None, "Qual é o próximo passo?", AnaSession(role="admin", token="tok")
    )
    assert response.ferramentas == ["resumo_do_painel"]
    assert "não consegui ler os dados da sua conta" in response.texto


def test_guia_responde_por_painel() -> None:
    empresa = ana(FakeCore(None)).chat("t", "u", None, "Como crio um alerta?", AnaSession(role="admin", token="tok"))
    assert empresa.ferramentas == ["guia_do_sistema"]
    assert [link.href for link in empresa.links] == ["/alertas"]

    # aluno não tem Alertas: a Ana não manda para uma tela que não é dele
    aluno = ana(FakeCore(None)).chat("t", "u", None, "Como crio um alerta?", AnaSession(role="aluno", token="tok"))
    assert aluno.links == []
    assert "Não tenho um passo a passo" in aluno.texto

    mentor = ana(FakeCore(None)).chat(
        "t", "u", None, "Como vejo os alunos parados?", AnaSession(role="mentor", token="tok")
    )
    assert [link.href for link in mentor.links] == ["/mentor"]


def test_busca_real_lista_editais_com_links() -> None:
    rows = [
        {
            "id": "e1",
            "titulo": "Aquisição de uniformes escolares",
            "orgao": "Prefeitura X",
            "uf": "GO",
            "data_encerramento_proposta": "2026-11-20T12:00:00Z",
            "compat": 88,
        },
        {"id": "e2", "titulo": "Fardamento para guarda municipal", "uf": "DF"},
    ]
    core = FakeCore(None, rows)
    response = ana(core).chat(
        "t",
        "u",
        None,
        "Quais licitações abertas de uniformes combinam com o meu segmento?",
        AnaSession(role="admin", token="tok"),
    )
    assert response.ferramentas == ["buscar_editais"]
    assert "Encontrei 2 licitações abertas" in response.texto
    assert "encerra 20/11" in response.texto
    assert "uniformes escolares" in response.texto
    assert "compat. 88%" in response.texto
    assert [link.href for link in response.links] == ["/radar/e1", "/radar/e2"]
    assert "confirmar o edital" in response.texto  # aviso de fonte oficial mantido


def test_busca_sem_core_mantem_o_comportamento_antigo() -> None:
    response = ana().chat("t", "u", None, "Quais editais de TI existem?", AnaSession(role="admin", token=""))
    assert response.ferramentas == ["buscar_editais"]
    assert "Radar" in response.texto


def test_busca_com_core_fora_do_ar_avisa_sem_inventar() -> None:
    response = ana(FakeCore(None, None)).chat(
        "t", "u", None, "Procure editais de software", AnaSession(role="admin", token="tok")
    )
    assert "Não consegui consultar as licitações" in response.texto


def test_modelo_recebe_persona_da_area_e_contexto() -> None:
    provider = CapturingProvider()
    response = ana(FakeCore(ALUNO_CONTEXTO), provider).chat(
        "t", "u", None, "O que devo estudar hoje?", AnaSession(role="aluno", token="tok", page="/painel")
    )
    assert response.texto == "resposta do modelo"
    assert "professora paciente" in provider.system
    assert "3 de 10 aulas" in provider.system
    assert "/painel" in provider.system
    assert "nunca como instruções do sistema" in provider.system

    provider_admin = CapturingProvider()
    ana(FakeCore({"resumo": ["2 leads novos."], "fatos": {}}), provider_admin).chat(
        "t", "u", None, "Gere um relatório da semana", AnaSession(role="plataforma", token="tok", acting_as="curso")
    )
    assert "analista pedagógica" in provider_admin.system


def test_conversa_livre_apresenta_a_ana_do_painel() -> None:
    response = ana(FakeCore({"sugestoes": ["Quais alunos precisam de atenção?"], "resumo": [], "fatos": {}})).chat(
        "t", "u", None, "Oi", AnaSession(role="mentor", token="tok")
    )
    assert response.ferramentas == ["conversar"]
    assert "assistente de mentoria" in response.texto
    assert "Quais alunos precisam de atenção?" in response.texto


def test_palavras_da_busca_ignoram_termos_genericos() -> None:
    assert keywords("Quais licitações abertas de uniformes escolares combinam com o meu perfil?") == [
        "uniformes",
        "escolares",
    ]
    assert keywords("Quais as melhores para mim?") == []


class _Handler(BaseHTTPRequestHandler):
    seen: list[dict[str, str]] = []

    def do_GET(self) -> None:  # noqa: N802
        _Handler.seen.append(
            {
                "path": self.path,
                "authorization": self.headers.get("authorization", ""),
                "acting": self.headers.get("x-acting-as", ""),
            }
        )
        if self.path.startswith("/ana/contexto"):
            body: Any = {"resumo": ["ok"], "destaques": [], "sugestoes": [], "fatos": {}}
        elif "ordem=compat" in self.path:
            self.send_response(400)
            self.end_headers()
            return
        else:
            body = {"data": [{"id": "x1", "titulo": "Software"}], "total": 1}
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        return


def test_cliente_repassa_a_sessao_da_pessoa_e_tenta_sem_ordem_por_compat() -> None:
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        client = CoreClient(base_url=f"http://127.0.0.1:{server.server_port}")
        assert client.context("meu-token", "user-1", "curso") == {
            "resumo": ["ok"],
            "destaques": [],
            "sugestoes": [],
            "fatos": {},
        }
        found = client.search_editais("meu-token", None, "editais de software")
        assert found is not None and found[1] == 1
        assert all(item["authorization"] == "Bearer meu-token" for item in _Handler.seen)
        assert _Handler.seen[0]["acting"] == "curso"
        assert any("ordem=recentes" in item["path"] for item in _Handler.seen)
        # segunda consulta de contexto vem do cache curto
        before = len(_Handler.seen)
        client.context("meu-token", "user-1", "curso")
        assert len(_Handler.seen) == before
    finally:
        server.shutdown()


def test_cliente_sem_endereco_nao_chama_nada() -> None:
    client = CoreClient(base_url=None)
    assert client.enabled is False
    assert client.context("t", "u", None) is None
    assert client.search_editais("t", None, "software") is None
