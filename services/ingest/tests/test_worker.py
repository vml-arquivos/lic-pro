from __future__ import annotations

from datetime import date, timedelta

from src import worker


class _Result:
    id = "checkpoint-test-id"

    def get(self, *, propagate: bool) -> dict[str, int]:
        assert propagate is True
        return {"processed": 0}


def test_schedule_radar_executes_checkpoint_in_worker(monkeypatch) -> None:
    monkeypatch.setenv("INGEST_SCHEDULE_TENANT_ID", "tenant-test")
    monkeypatch.setenv("INGEST_WINDOW_DAYS", "2")
    monkeypatch.setenv("INGEST_SCHEDULE_MODALITY_CODE", "6")
    monkeypatch.setenv("INGEST_SCHEDULE_UF", "DF")
    calls: list[list[object]] = []

    def apply(*, args: list[object]) -> _Result:
        calls.append(args)
        return _Result()

    monkeypatch.setattr(worker.run_checkpoint, "apply", apply)

    today = date.today()
    result = worker.schedule_radar.run()

    assert result == {"status": "completed", "task_id": "checkpoint-test-id"}
    assert calls == [
        ["tenant-test", 6, (today - timedelta(days=2)).isoformat(), today.isoformat(), "DF"]
    ]
