"""Phone number normalization for caller identification.

Callers speak numbers in many formats. We keep one canonical E.164-style value
and derive a readable form for the agent's read-back confirmation.
"""

from __future__ import annotations

import re

from app.domain.errors import DomainError


def normalize_phone(raw: str) -> str:
    if raw is None:
        raise DomainError("PHONE_REQUIRED", "I need a phone number to continue.")

    text = str(raw).strip()
    if not text:
        raise DomainError("PHONE_REQUIRED", "I need a phone number to continue.")

    # Handle spoken separators and a leading international prefix.
    digits = re.sub(r"\D", "", text)
    if digits.startswith("00"):
        digits = digits[2:]

    if len(digits) == 10:
        canonical = f"+91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        canonical = f"+91{digits[1:]}"
    elif len(digits) == 12 and digits.startswith("91"):
        canonical = f"+{digits}"
    elif 11 <= len(digits) <= 15:
        canonical = f"+{digits}"
    else:
        raise DomainError(
            "PHONE_INVALID",
            "That phone number does not look complete. Please say the full number with its country code if possible.",
        )

    national = canonical[3:] if canonical.startswith("+91") else canonical[1:]
    if len(set(national)) < 3:
        raise DomainError(
            "PHONE_INVALID", "That phone number does not look valid. Please say it again."
        )
    return canonical


def format_phone(canonical: str) -> str:
    if canonical.startswith("+91") and len(canonical) == 13:
        return f"+91 {canonical[3:8]} {canonical[8:]}"
    return f"{canonical[:3]} {canonical[3:]}"


def spoken_digits(canonical: str) -> str:
    digits = re.sub(r"\D", "", canonical)
    if canonical.startswith("+91") and len(digits) == 12:
        return f"{digits[0:2]} {digits[2:7]} {digits[7:]}"
    return " ".join(digits)


def mask_phone(canonical: str) -> str:
    digits = re.sub(r"\D", "", canonical)
    if len(digits) <= 4:
        return "••••"
    prefix = "+91 " if canonical.startswith("+91") else "+"
    return f"{prefix}••••• {digits[-4:]}"
