"""Entry point for the ingestion service foundation."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ServiceHealth:
    """Minimal health payload shared by local smoke checks."""

    service: str
    status: str = "ok"


def health() -> ServiceHealth:
    """Return the current service health without making network calls."""

    return ServiceHealth(service="ingest")


if __name__ == "__main__":
    print(health())
