"""Orchestration for PNCP ingestion without network calls in business logic tests."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from .clients import PncpClient
from .events import EventPublisher
from .models import IngestEvent, JsonObject, NormalizedTender, PncpPublicationQuery, UpsertResult
from .normalizer import normalize_pncp_publication


class TenderWriter(Protocol):
    def upsert(self, tender: NormalizedTender) -> UpsertResult:
        """Persist a normalized tender and classify it as new or updated."""


@dataclass(frozen=True)
class IngestStats:
    processed: int
    inserted: int
    updated: int
    next_page: int | None = None


def ingest_pncp(
    *,
    client: PncpClient,
    query: PncpPublicationQuery,
    tenant_id: str,
    writer: TenderWriter,
    publisher: EventPublisher,
    start_page: int = 1,
    page_size: int | None = None,
    endpoint: str = "publicacao",
) -> IngestStats:
    processed = inserted = updated = 0
    iterator = _iter_records(
        client,
        query,
        endpoint=endpoint,
        start_page=start_page,
        page_size=page_size,
    )
    for raw in iterator:
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
    next_page = getattr(client, "next_page", None)
    return IngestStats(
        processed=processed,
        inserted=inserted,
        updated=updated,
        next_page=next_page if isinstance(next_page, int) else None,
    )


def _iter_records(
    client: PncpClient,
    query: PncpPublicationQuery,
    *,
    endpoint: str,
    start_page: int,
    page_size: int | None,
) -> Iterator[JsonObject]:
    kwargs: dict[str, int | None] = {"start_page": start_page, "page_size": page_size}
    if endpoint == "publicacao":
        try:
            return client.iter_publications(query, **kwargs)
        except TypeError:
            # Older test doubles implemented only iter_publications(query).
            # Keep that contract usable for the default cursor.
            if start_page == 1 and page_size is None:
                return client.iter_publications(query)
            raise
    if endpoint in {"atualizacao", "atualizacoes", "updates"}:
        return client.iter_updates(query, **kwargs)
    if endpoint in {"proposta", "propostas", "proposals"}:
        return client.iter_proposals(query, **kwargs)
    raise ValueError(f"endpoint PNCP não suportado: {endpoint}")
