"""Entry point for the ingestion service."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ServiceHealth:
    """Health payload that does not call external APIs."""

    service: str
    status: str = "ok"


def health() -> ServiceHealth:
    return ServiceHealth(service="ingest")


if __name__ == "__main__":
    print(health())
