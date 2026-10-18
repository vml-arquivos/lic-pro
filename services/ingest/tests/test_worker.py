from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from src import worker


def test_schedule_radar_executes_checkpoint_in_worker(monkeypatch) -> None:
    monkeypatch.setenv("INGEST_SCHEDULE_TENANT_ID", "tenant-test")
    monkeypatch.setenv("INGEST_WINDOW_DAYS", "2")
    monkeypatch.setenv("INGEST_SCHEDULE_MODALITY_CODE", "6")
    monkeypatch.setenv("INGEST_SCHEDULE_UF", "DF")
    calls: list[tuple[object, ...]] = []

    def run(*args: Any) -> dict[str, int]:
        calls.append(args)
        return {"processed": 0}

    monkeypatch.setattr(worker.run_checkpoint, "run", run)

    today = date.today()
    result = worker.schedule_radar.run()

    assert result == {"status": "completed", "processed": 0}
    assert calls == [
        (
            "tenant-test",
            6,
            (today - timedelta(days=2)).isoformat(),
            today.isoformat(),
            "DF",
        )
    ]
