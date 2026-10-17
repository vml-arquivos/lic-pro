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
    def get(self, _url: str, _params: dict[str, str | int]) -> dict[str, Any]:
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
