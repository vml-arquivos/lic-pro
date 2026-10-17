"""Small dependency-free HTTP layer for public APIs."""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from time import monotonic
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

JsonObject = dict[str, Any]


class JsonTransport(Protocol):
    def get(self, url: str, params: Mapping[str, str | int]) -> JsonObject:
        """Fetch a JSON object from a URL."""


class TransportError(RuntimeError):
    def __init__(
        self, message: str, status_code: int | None = None, retry_after: float | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


class RateLimiter:
    def __init__(
        self, min_interval_seconds: float = 0.0, sleep: Callable[[float], None] = time.sleep
    ) -> None:
        self.min_interval_seconds = max(0.0, min_interval_seconds)
        self.sleep = sleep
        self._next_allowed_at = 0.0

    def wait(self) -> None:
        now = monotonic()
        delay = self._next_allowed_at - now
        if delay > 0:
            self.sleep(delay)
        self._next_allowed_at = monotonic() + self.min_interval_seconds


class UrllibJsonTransport:
    def __init__(
        self, timeout_seconds: float = 30.0, user_agent: str = "LiciteComigoIngest/0.2"
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.user_agent = user_agent

    def get(self, url: str, params: Mapping[str, str | int]) -> JsonObject:
        query = urlencode(params)
        request = Request(
            f"{url}?{query}",
            headers={"Accept": "application/json", "User-Agent": self.user_agent},
            method="GET",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            retry_after = _retry_after_seconds(error.headers.get("Retry-After"))
            raise TransportError(
                f"HTTP {error.code} ao consultar fonte pública", error.code, retry_after
            ) from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise TransportError(
                f"falha de transporte ao consultar fonte pública: {error}"
            ) from error

        if not isinstance(payload, dict):
            raise TransportError("resposta da fonte pública não é um objeto JSON")
        return payload


class ResilientJsonClient:
    def __init__(
        self,
        transport: JsonTransport,
        *,
        max_retries: int = 3,
        backoff_seconds: float = 0.5,
        rate_limiter: RateLimiter | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.transport = transport
        self.max_retries = max(0, max_retries)
        self.backoff_seconds = max(0.0, backoff_seconds)
        self.rate_limiter = rate_limiter or RateLimiter()
        self.sleep = sleep

    def get(self, url: str, params: Mapping[str, str | int]) -> JsonObject:
        for attempt in range(self.max_retries + 1):
            self.rate_limiter.wait()
            try:
                return self.transport.get(url, params)
            except TransportError as error:
                if not _is_retryable(error) or attempt >= self.max_retries:
                    raise
                delay = error.retry_after
                if delay is None:
                    delay = self.backoff_seconds * (2**attempt)
                self.sleep(delay)
        raise AssertionError("loop de retry terminou sem retorno ou exceção")


def _is_retryable(error: TransportError) -> bool:
    return error.status_code is None or error.status_code in {429, 500, 502, 503, 504}


def _retry_after_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value).timestamp()
        except (TypeError, ValueError, OverflowError):
            return None
        return max(0.0, retry_at - time.time())


@dataclass(frozen=True)
class Endpoint:
    base_url: str
    path: str

    @property
    def url(self) -> str:
        return urljoin(f"{self.base_url.rstrip('/')}/", self.path.lstrip("/"))
