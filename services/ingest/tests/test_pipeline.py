import json
from datetime import date
from pathlib import Path
from typing import Any

from src.clients import PncpClient
from src.events import InMemoryEventPublisher
from src.http import ResilientJsonClient
from src.models import NormalizedTender, PncpPublicationQuery, UpsertResult
from src.pipeline import ingest_pncp

FIXTURE = Path(__file__).parent / "fixtures" / "pncp_publicacao_page_1.json"


class FixtureTransport:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str | int]]] = []

    def get(self, _url: str, _params: dict[str, str | int]) -> dict[str, Any]:
        self.calls.append((_url, _params))
        return json.loads(FIXTURE.read_text())


class InMemoryWriter:
    def __init__(self) -> None:
        self.saved: dict[tuple[str, str], NormalizedTender] = {}

    def upsert(self, tender: NormalizedTender) -> UpsertResult:
        key = (tender.tenant_id, tender.id_externo)
        inserted = key not in self.saved
        self.saved[key] = tender
        return UpsertResult(inserted=inserted)


def test_ingest_publishes_new_then_updated_event() -> None:
    client = PncpClient(ResilientJsonClient(FixtureTransport()))
    writer = InMemoryWriter()
    publisher = InMemoryEventPublisher()
    query = PncpPublicationQuery(date(2026, 10, 1), date(2026, 10, 2), 8)

    first = ingest_pncp(
        client=client,
        query=query,
        tenant_id="00000000-0000-0000-0000-000000000001",
        writer=writer,
        publisher=publisher,
    )
    second = ingest_pncp(
        client=client,
        query=query,
        tenant_id="00000000-0000-0000-0000-000000000001",
        writer=writer,
        publisher=publisher,
    )

    assert first.inserted == 1
    assert second.updated == 1
    assert [event.event_type for event in publisher.events] == ["edital.novo", "edital.atualizado"]


def test_ingest_uses_start_page_and_reports_next_page() -> None:
    transport = FixtureTransport()
    client = PncpClient(ResilientJsonClient(transport))
    writer = InMemoryWriter()
    publisher = InMemoryEventPublisher()
    query = PncpPublicationQuery(date(2026, 10, 1), date(2026, 10, 2), 8)

    stats = ingest_pncp(
        client=client,
        query=query,
        tenant_id="00000000-0000-0000-0000-000000000001",
        writer=writer,
        publisher=publisher,
        start_page=4,
    )

    assert transport.calls[0][1]["pagina"] == 4
    assert stats.next_page == 5


def test_upsert_statement_and_parameters_stay_in_sync() -> None:
    import json
    import re
    from pathlib import Path

    from src.normalizer import normalize_pncp_publication
    from src.storage import UPSERT_EDITAL_SQL, _parameters

    payload = json.loads(
        (Path(__file__).parent / "fixtures" / "pncp_publicacao_page_1.json").read_text()
    )
    tender = normalize_pncp_publication(payload["data"][0], "tenant")
    placeholders = set(re.findall(r"%\((\w+)\)s", UPSERT_EDITAL_SQL))

    assert placeholders == set(_parameters(tender))
    for column in ("orgao_cnpj", "numero_compra", "processo", "amparo_legal"):
        assert column in placeholders
