from time import sleep

from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from src import main
from src.main import app
from src.models import PageText


def test_health_and_ana_stream() -> None:
    client = TestClient(app)
    assert client.get("/health").json() == {"service": "ai", "status": "ok"}

    response = client.post(
        "/ana/chat/stream",
        json={
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "mensagem": "Explique o conceito de edital.",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "[DONE]" in response.text


def test_reader_rejects_invalid_tenant_id() -> None:
    response = TestClient(app).post(
        "/reader/analyze",
        json={
            "tenant_id": "not-a-uuid",
            "user_id": "00000000-0000-0000-0000-000000000002",
            "edital_id": "not-a-uuid",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "tenant_id inválido"


def test_reader_rejects_pdf_above_configured_size() -> None:
    previous = main.limits.max_pdf_bytes
    main.limits.max_pdf_bytes = 2
    main.rate_limiter.reset()
    try:
        response = TestClient(app).post(
            "/reader/ingest",
            data={
                "tenant_id": "00000000-0000-0000-0000-000000000001",
                "user_id": "00000000-0000-0000-0000-000000000002",
                "edital_id": "00000000-0000-0000-0000-000000000003",
            },
            files={"file": ("edital.pdf", b"123", "application/pdf")},
        )
        assert response.status_code == 413
        assert response.json()["detail"] == "pdf_too_large"
    finally:
        main.limits.max_pdf_bytes = previous


def test_reader_rejects_pdf_above_configured_page_count(monkeypatch: MonkeyPatch) -> None:
    previous = main.limits.max_pdf_pages
    main.limits.max_pdf_pages = 1
    main.rate_limiter.reset()
    monkeypatch.setattr(
        main,
        "extract_pdf_pages",
        lambda _: [PageText(1, "Página 1"), PageText(2, "Página 2")],
    )
    try:
        response = TestClient(app).post(
            "/reader/ingest",
            data={
                "tenant_id": "00000000-0000-0000-0000-000000000001",
                "user_id": "00000000-0000-0000-0000-000000000004",
                "edital_id": "00000000-0000-0000-0000-000000000003",
            },
            files={"file": ("edital.pdf", b"fixture", "application/pdf")},
        )
        assert response.status_code == 413
        assert response.json()["detail"] == "pdf_too_many_pages"
    finally:
        main.limits.max_pdf_pages = previous


def test_reader_timeout_is_configurable(monkeypatch: MonkeyPatch) -> None:
    previous = main.limits.reader_timeout_seconds
    main.limits.reader_timeout_seconds = 0.001
    main.rate_limiter.reset()
    monkeypatch.setattr(
        main,
        "extract_pdf_pages",
        lambda _: (sleep(0.05), [PageText(1, "Página 1")])[1],
    )
    try:
        response = TestClient(app).post(
            "/reader/ingest",
            data={
                "tenant_id": "00000000-0000-0000-0000-000000000001",
                "user_id": "00000000-0000-0000-0000-000000000005",
                "edital_id": "00000000-0000-0000-0000-000000000003",
            },
            files={"file": ("edital.pdf", b"fixture", "application/pdf")},
        )
        assert response.status_code == 504
        assert response.json()["detail"] == "reader_timeout"
    finally:
        main.limits.reader_timeout_seconds = previous
