"""Rate limits and monthly quotas for AI endpoints."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Protocol


class LimitExceeded(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass
class ServiceLimits:
    per_user_minute: int = 20
    per_tenant_minute: int = 100
    max_pdf_bytes: int = 20 * 1024 * 1024
    max_pdf_pages: int = 200
    reader_timeout_seconds: float = 30.0
    default_monthly_calls: int = 1000
    default_monthly_tokens: int = 1_000_000

    @classmethod
    def from_env(cls) -> ServiceLimits:
        return cls(
            per_user_minute=int(os.getenv("AI_RATE_LIMIT_PER_MINUTE_USER", "20")),
            per_tenant_minute=int(os.getenv("AI_RATE_LIMIT_PER_MINUTE_TENANT", "100")),
            max_pdf_bytes=int(os.getenv("AI_MAX_PDF_BYTES", str(20 * 1024 * 1024))),
            max_pdf_pages=int(os.getenv("AI_MAX_PDF_PAGES", "200")),
            reader_timeout_seconds=float(os.getenv("AI_READER_TIMEOUT_SECONDS", "30")),
            default_monthly_calls=int(os.getenv("AI_DEFAULT_MONTHLY_CALL_LIMIT", "1000")),
            default_monthly_tokens=int(os.getenv("AI_DEFAULT_MONTHLY_TOKEN_LIMIT", "1000000")),
        )


class RateLimiter:
    def __init__(self, limits: ServiceLimits, clock: Callable[[], float] = time.monotonic) -> None:
        self.limits = limits
        self.clock = clock
        self.events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, tenant_id: str, user_id: str) -> None:
        self._check_key(f"tenant:{tenant_id}", self.limits.per_tenant_minute, "tenant_rate_limit")
        self._check_key(f"user:{user_id}", self.limits.per_user_minute, "user_rate_limit")

    def reset(self) -> None:
        self.events.clear()

    def _check_key(self, key: str, limit: int, code: str) -> None:
        now = self.clock()
        window = self.events[key]
        while window and now - window[0] >= 60:
            window.popleft()
        if len(window) >= limit:
            raise LimitExceeded(code)
        window.append(now)


class UsageStore(Protocol):
    def consume(self, tenant_id: str, user_id: str, input_tokens: int, output_tokens: int) -> None:
        """Atomically record a call or raise when the monthly quota is exceeded."""


class InMemoryUsageStore:
    def __init__(self, limits: ServiceLimits) -> None:
        self.limits = limits
        self.rows: dict[tuple[str, str, date], tuple[int, int, int]] = {}

    def consume(self, tenant_id: str, user_id: str, input_tokens: int, output_tokens: int) -> None:
        key = (tenant_id, user_id, date.today().replace(day=1))
        calls, input_total, output_total = self.rows.get(key, (0, 0, 0))
        if calls + 1 > self.limits.default_monthly_calls:
            raise LimitExceeded("monthly_call_quota_exceeded")
        if input_total + output_total + input_tokens + output_tokens > self.limits.default_monthly_tokens:
            raise LimitExceeded("monthly_token_quota_exceeded")
        self.rows[key] = (calls + 1, input_total + input_tokens, output_total + output_tokens)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)
