from datetime import UTC, datetime
from typing import Any

import pytest

from src.retention import run_retention


class Result:
    def __init__(self, rowcount: int = 0) -> None:
        self.rowcount = rowcount


class FakeConnection:
    def __init__(self) -> None:
        self.statements: list[tuple[str, tuple[Any, ...]]] = []
        self.counts = iter([2, 3, 1])

    def execute(self, statement: str, parameters: tuple[Any, ...] = ()) -> Result:
        self.statements.append((statement, parameters))
        if statement.strip().startswith("DELETE"):
            return Result(next(self.counts))
        return Result()


def test_retention_records_execution_and_deletion_counts() -> None:
    connection = FakeConnection()
    stats = run_retention(
        connection,
        retention_days=30,
        now=datetime(2026, 10, 17, tzinfo=UTC),
    )

    assert stats.conversations_deleted == 1
    assert stats.messages_deleted == 3
    assert stats.tool_calls_deleted == 2
    assert any("status = 'concluida'" in statement for statement, _ in connection.statements)
    assert any("app.retention_job" in statement for statement, _ in connection.statements)


def test_retention_rejects_non_positive_period() -> None:
    with pytest.raises(ValueError, match="maior que zero"):
        run_retention(FakeConnection(), retention_days=0)
