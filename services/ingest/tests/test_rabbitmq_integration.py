from __future__ import annotations

import json
import os
import time
from uuid import uuid4

import pytest

pika = pytest.importorskip("pika")


def test_real_rabbitmq_publish_and_consume() -> None:
    url = os.getenv("RABBITMQ_URL")
    if not url:
        pytest.skip("RABBITMQ_URL não configurada; teste reservado ao job de integração")

    connection = pika.BlockingConnection(pika.URLParameters(url))
    try:
        channel = connection.channel()
        exchange = "licite.events"
        routing_key = "edital.novo"
        channel.exchange_declare(exchange=exchange, exchange_type="topic", durable=True)
        queue = channel.queue_declare(queue="", exclusive=True, auto_delete=True).method.queue
        channel.queue_bind(queue=queue, exchange=exchange, routing_key=routing_key)

        probe = uuid4().hex
        payload = {"event_type": routing_key, "probe": probe, "source": "ci"}
        channel.basic_publish(
            exchange=exchange,
            routing_key=routing_key,
            body=json.dumps(payload).encode("utf-8"),
            properties=pika.BasicProperties(content_type="application/json"),
        )

        received: dict[str, object] | None = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            method, _properties, body = channel.basic_get(queue=queue, auto_ack=True)
            if method is None:
                time.sleep(0.2)
                continue
            candidate = json.loads(body.decode("utf-8"))
            if isinstance(candidate, dict) and candidate.get("probe") == probe:
                received = candidate
                break

        assert received == payload
    finally:
        connection.close()
