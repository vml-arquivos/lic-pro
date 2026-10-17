from src.main import health


def test_health_is_local_and_deterministic() -> None:
    assert health().service == "ingest"
    assert health().status == "ok"
