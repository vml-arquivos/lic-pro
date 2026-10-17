from datetime import date

from src.control import CheckpointKey, InMemoryIngestControl


def test_checkpoint_is_idempotent_and_advances_attempt() -> None:
    control = InMemoryIngestControl()
    key = CheckpointKey("tenant-a", "pncp", "6", date(2026, 10, 16), date(2026, 10, 17))

    first = control.claim(key)
    control.complete(first, page=2)
    second = control.claim(key)

    assert second.id == first.id
    assert second.tentativa == 2
    assert second.pagina == 2
    assert second.status == "processando"


def test_failed_checkpoint_goes_to_dead_letter() -> None:
    control = InMemoryIngestControl()
    key = CheckpointKey("tenant-a", "pncp", "6", date(2026, 10, 16), date(2026, 10, 17))
    checkpoint = control.claim(key)

    control.fail(checkpoint, "timeout")
    control.dead_letter(checkpoint, {"fonte": "pncp"}, "timeout")

    assert control.last_execution("tenant-a")["status"] == "erro"
    assert control.dead_letters[0][2] == "timeout"
