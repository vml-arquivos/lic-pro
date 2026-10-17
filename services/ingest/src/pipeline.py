"""Orchestration for PNCP ingestion without network calls in business logic tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .clients import PncpClient
from .events import EventPublisher
from .models import IngestEvent, NormalizedTender, PncpPublicationQuery, UpsertResult
from .normalizer import normalize_pncp_publication


class TenderWriter(Protocol):
    def upsert(self, tender: NormalizedTender) -> UpsertResult:
        """Persist a normalized tender and classify it as new or updated."""


@dataclass(frozen=True)
class IngestStats:
    processed: int
    inserted: int
    updated: int


def ingest_pncp(
    *,
    client: PncpClient,
    query: PncpPublicationQuery,
    tenant_id: str,
    writer: TenderWriter,
    publisher: EventPublisher,
) -> IngestStats:
    processed = inserted = updated = 0
    for raw in client.iter_publications(query):
        tender = normalize_pncp_publication(raw, tenant_id)
        result = writer.upsert(tender)
        event_type = "edital.novo" if result.inserted else "edital.atualizado"
        publisher.publish(
            IngestEvent(
                event_type=event_type,
                tenant_id=tenant_id,
                edital_id_externo=tender.id_externo,
                fonte=tender.fonte,
                payload={
                    "titulo": tender.titulo,
                    "hash_conteudo": tender.hash_conteudo,
                    "url_origem": tender.url_origem or "",
                },
            )
        )
        processed += 1
        inserted += int(result.inserted)
        updated += int(not result.inserted)
    return IngestStats(processed=processed, inserted=inserted, updated=updated)
