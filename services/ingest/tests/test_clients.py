import json
from datetime import date
from pathlib import Path
from typing import Any

from src.clients import ComprasGovClient, PncpClient
from src.http import ResilientJsonClient, TransportError
from src.models import PncpPublicationQuery

FIXTURE = Path(__file__).parent / "fixtures" / "pncp_publicacao_page_1.json"


class FakeTransport:
    def __init__(self, payload: dict[str, Any], failures: int = 0) -> None:
        self.payload = payload
        self.failures = failures
        self.calls: list[tuple[str, dict[str, str | int]]] = []

    def get(self, url: str, params: dict[str, str | int]) -> dict[str, Any]:
        self.calls.append((url, params))
        if self.failures:
            self.failures -= 1
            raise TransportError("indisponibilidade transitória", status_code=503)
        return self.payload


def _fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text())


def test_pncp_uses_documented_route_and_date_format_after_retry() -> None:
    transport = FakeTransport(_fixture(), failures=1)
    sleeps: list[float] = []
    http = ResilientJsonClient(transport, backoff_seconds=0.01, sleep=sleeps.append)
    client = PncpClient(http)
    query = PncpPublicationQuery(date(2026, 10, 1), date(2026, 10, 2), modality_code=8, uf="DF")

    items = list(client.iter_publications(query))

    assert len(items) == 1
    assert len(transport.calls) == 2
    url, params = transport.calls[1]
    assert url == "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
    assert params["dataInicial"] == "20261001"
    assert params["dataFinal"] == "20261002"
    assert params["codigoModalidadeContratacao"] == 8
    assert params["tamanhoPagina"] == 50
    assert sleeps == [0.01]


def test_pncp_query_hash_is_stable_and_covers_optional_filters() -> None:
    first = PncpPublicationQuery(
        date(2026, 10, 1),
        date(2026, 10, 2),
        modality_code=8,
        uf="DF",
        municipality_ibge_code="5300108",
    )
    same = PncpPublicationQuery(
        date(2026, 10, 1),
        date(2026, 10, 2),
        modality_code=8,
        uf="DF",
        municipality_ibge_code="5300108",
    )
    changed = PncpPublicationQuery(date(2026, 10, 1), date(2026, 10, 2), modality_code=8, uf="SP")

    assert first.query_hash == same.query_hash
    assert first.query_hash != changed.query_hash
    assert "pagina" not in first.filter_params()


def test_pncp_update_and_proposal_routes_honor_configured_start_page() -> None:
    transport = FakeTransport(
        {"data": [], "numeroPagina": 3, "totalPaginas": 3, "paginasRestantes": 0}
    )
    client = PncpClient(ResilientJsonClient(transport), start_page=3, page_size=10)
    query = PncpPublicationQuery(date(2026, 10, 1), date(2026, 10, 2), modality_code=8)

    list(client.iter_updates(query))
    list(client.iter_proposals(query))

    assert [call[0] for call in transport.calls] == [
        "https://pncp.gov.br/api/consulta/v1/contratacoes/atualizacao",
        "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta",
    ]
    assert all(call[1]["pagina"] == 3 for call in transport.calls)
    assert all(call[1]["tamanhoPagina"] == 10 for call in transport.calls)


def test_compras_gov_uses_official_catalog_and_price_routes() -> None:
    transport = FakeTransport({"resultado": []})
    client = ComprasGovClient(ResilientJsonClient(transport))

    client.catalog_materials(codigoItem=123)
    client.catalog_services(codigoServico=456)
    client.material_prices(codigo_item_catalogo=123, estado="DF")
    client.service_prices(codigo_item_catalogo=456, estado="DF")

    assert [call[0] for call in transport.calls] == [
        "https://dadosabertos.compras.gov.br/modulo-material/4_consultarItemMaterial",
        "https://dadosabertos.compras.gov.br/modulo-servico/6_consultarItemServico",
        "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial",
        "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/3_consultarServico",
    ]
