from fastapi.testclient import TestClient

from src.main import app


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
        json={"tenant_id": "not-a-uuid", "edital_id": "not-a-uuid"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "tenant_id inválido"
