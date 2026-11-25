"""Domain errors with stable machine-readable codes for the voice tools."""

from __future__ import annotations

from typing import Any


class DomainError(Exception):
    def __init__(self, code: str, message: str, **details: Any):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def as_result(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "ok": False,
            "error": {"code": self.code, "message": self.message},
        }
        result.update(self.details)
        return result
