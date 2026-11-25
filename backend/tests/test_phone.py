from __future__ import annotations

import pytest

from app.domain.errors import DomainError
from app.domain.phone import format_phone, mask_phone, normalize_phone, spoken_digits


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9876543210", "+919876543210"),
        ("+91 98765 43210", "+919876543210"),
        ("098765 43210", "+919876543210"),
        ("91-98765-43210", "+919876543210"),
        ("+1 (415) 555-2671", "+14155552671"),
    ],
)
def test_normalize_phone_formats(raw: str, expected: str) -> None:
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "123", "0000000000", "abc"])
def test_invalid_phone_is_rejected(raw: str) -> None:
    with pytest.raises(DomainError) as error:
        normalize_phone(raw)
    assert error.value.code in {"PHONE_REQUIRED", "PHONE_INVALID"}


def test_phone_readback_helpers() -> None:
    phone = "+919876543210"
    assert format_phone(phone) == "+91 98765 43210"
    assert spoken_digits(phone) == "91 98765 43210"
    assert mask_phone(phone) == "+91 ••••• 3210"
