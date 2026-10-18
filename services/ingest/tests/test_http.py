from typing import Any

from src.http import ResilientJsonClient, UrllibJsonTransport


class _Response:
    status = 204

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def read(self) -> bytes:
        return b""


def test_urllib_transport_treats_pncp_no_content_as_empty_object(monkeypatch: Any) -> None:
    monkeypatch.setattr("src.http.urlopen", lambda *args, **kwargs: _Response())

    payload = ResilientJsonClient(UrllibJsonTransport()).get(
        "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao",
        {"pagina": 2, "tamanhoPagina": 50},
    )

    assert payload == {}
