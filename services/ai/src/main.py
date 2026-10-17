"""Entry point for the AI service foundation."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ServiceHealth:
    """Minimal health payload shared by local smoke checks."""

    service: str
    status: str = "ok"


def health() -> ServiceHealth:
    """Return the current service health without making provider calls."""

    return ServiceHealth(service="ai")


if __name__ == "__main__":
    print(health())
