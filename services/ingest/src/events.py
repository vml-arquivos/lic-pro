"""Event contracts and RabbitMQ publisher for ingestion."""

from __future__ import annotations

import json
from typing import Protocol

from .models import IngestEvent, JsonObject


class EventPublisher(Protocol):
    def publish(self, event: IngestEvent) -> None:
        """Publish an ingestion event."""


class InMemoryEventPublisher:
    def __init__(self) -> None:
        self.events: list[IngestEvent] = []

    def publish(self, event: IngestEvent) -> None:
        self.events.append(event)


class RabbitMqEventPublisher:
    """Concrete publisher using pika; connection is opened per event for a safe baseline."""

    def __init__(self, url: str, exchange: str = "licite.events") -> None:
        self.url = url
        self.exchange = exchange

    def publish(self, event: IngestEvent) -> None:
        import pika  # type: ignore[import-untyped]

        connection = pika.BlockingConnection(pika.URLParameters(self.url))
        try:
            channel = connection.channel()
            channel.exchange_declare(exchange=self.exchange, exchange_type="topic", durable=True)
            body = json.dumps(_event_payload(event), ensure_ascii=False).encode("utf-8")
            channel.basic_publish(
                exchange=self.exchange,
                routing_key=event.event_type,
                body=body,
                properties=pika.BasicProperties(content_type="application/json", delivery_mode=2),
            )
        finally:
            connection.close()


def _event_payload(event: IngestEvent) -> JsonObject:
    return {
        "event_type": event.event_type,
        "tenant_id": event.tenant_id,
        "edital_id_externo": event.edital_id_externo,
        "fonte": event.fonte,
        "payload": event.payload,
    }
