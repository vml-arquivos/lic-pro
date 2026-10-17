"""Privacy helpers for logs and tool-call metadata."""

from __future__ import annotations

import re

_CPF = re.compile(r"(?<!\d)(\d{3})\.?\d{3}\.?\d{3}-?\d{2}(?!\d)")
_EMAIL = re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")


def mask_sensitive(value: str) -> str:
    masked = _CPF.sub(r"***.***.***-**", value)
    return _EMAIL.sub(r"\1***\2", masked)
