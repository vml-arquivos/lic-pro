from datetime import UTC, datetime, timedelta
from time import sleep

import jwt
from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from src import main
from src.auth import settings
from src.main import app
from src.models import PageText

TENANT_ID = "00000000-0000-0000-0000-000000000001"
USER_ID = "00000000-0000-0000-0000-000000000002"
EDITAL_ID = "00000000-0000-0000-0000-000000000003"


def token(*, tenant_id: str = TENANT_ID, user_id: str = USER_ID, exp: datetime | None = None) -> str:
    expires = exp or datetime.now(UTC) + timedelta(minutes=5)
    return jwt.encode(
        {
            "sub": user_id,
            "tenantId": tenant_id,
            "role": "aluno",
            "exp": expires,
        },
        settings.key,
        algorithm=settings.algorithm,
    )


def auth_headers(**kwargs: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token(**kwargs)}"}


def test_health_and_ana_stream() -> None:
    client = TestClient(app)
    assert client.get("/health").json() == {"service": "ai", "status": "ok"}

    response = client.post(
        "/ana/chat/stream",
        headers=auth_headers(),
        json={"mensagem": "Explique o conceito de edital."},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "[DONE]" in response.text


def test_protected_endpoint_rejects_missing_invalid_and_expired_token() -> None:
    client = TestClient(app)
    payload = {"mensagem": "Explique o conceito de edital."}
    assert client.post("/ana/chat/stream", json=payload).status_code == 401
    assert client.post("/ana/chat/stream", headers={"authorization": "Bearer invalid"}, json=payload).status_code == 401
    expired = token(exp=datetime.now(UTC) - timedelta(minutes=1))
    assert (
        client.post("/ana/chat/stream", headers={"authorization": f"Bearer {expired}"}, json=payload).status_code == 401
    )


def test_request_tenant_is_ignored_and_token_tenant_is_used() -> None:
    response = TestClient(app).post(
        "/reader/analyze",
        headers=auth_headers(),
        json={
            "tenant_id": "00000000-0000-0000-0000-000000000099",
            "user_id": "00000000-0000-0000-0000-000000000099",
            "edital_id": EDITAL_ID,
        },
    )
    assert response.status_code == 200
    assert response.json()["resumo"]


def test_reader_rejects_invalid_edital_id() -> None:
    response = TestClient(app).post(
        "/reader/analyze",
        headers=auth_headers(),
        json={"edital_id": "not-a-uuid"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "edital_id inválido"


def test_reader_rejects_pdf_above_configured_size() -> None:
    previous = main.limits.max_pdf_bytes
    main.limits.max_pdf_bytes = 2
    main.rate_limiter.reset()
    try:
        response = TestClient(app).post(
            "/reader/ingest",
            headers=auth_headers(),
            data={"edital_id": EDITAL_ID},
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
            headers=auth_headers(),
            data={"edital_id": EDITAL_ID},
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
            headers=auth_headers(),
            data={"edital_id": EDITAL_ID},
            files={"file": ("edital.pdf", b"fixture", "application/pdf")},
        )
        assert response.status_code == 504
        assert response.json()["detail"] == "reader_timeout"
    finally:
        main.limits.reader_timeout_seconds = previous
