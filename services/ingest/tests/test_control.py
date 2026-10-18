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


def test_checkpoint_query_hash_separates_filter_sets() -> None:
    control = InMemoryIngestControl()
    first_key = CheckpointKey(
        "tenant-a",
        "pncp",
        "6",
        date(2026, 10, 16),
        date(2026, 10, 17),
        filtros={"uf": "DF"},
    )
    second_key = CheckpointKey(
        "tenant-a",
        "pncp",
        "6",
        date(2026, 10, 16),
        date(2026, 10, 17),
        filtros={"uf": "SP"},
    )

    first = control.claim(first_key)
    control.complete(first, page=3)
    second = control.claim(second_key)

    assert first.key.resolved_query_hash() != second.key.resolved_query_hash()
    assert second.pagina == 1
