from __future__ import annotations

from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.db import Database
from app.domain.appointments import AppointmentService
from app.domain.session import CallSession
from app.seed import seed_database
from app.tools.clinic_tools import ClinicTools

TZ = ZoneInfo("Asia/Kolkata")


@pytest.fixture()
def tools(tmp_path: Path) -> tuple[ClinicTools, AppointmentService, CallSession]:
    db = Database(tmp_path / "tools-test.db")
    seed_database(db, TZ)
    service = AppointmentService(db, TZ)
    session = CallSession("test-call")
    return ClinicTools(service, session), service, session


def test_booking_requires_application_managed_phone_confirmation(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, service, _ = tools
    slot = service.check_availability("Dr. Meera Iyer")["slots"][0]

    blocked = clinic.book_appointment("Dr. Meera Iyer", slot["id"], "Asha")
    assert blocked["ok"] is False
    assert blocked["error"]["code"] == "PHONE_NOT_VERIFIED"

    captured = clinic.set_caller_phone("98765 43210")
    assert captured["ok"] is True
    assert captured["phone"]["readback"] == "+91 98765 43210"

    # Capturing is not confirmation.
    still_blocked = clinic.book_appointment("Dr. Meera Iyer", slot["id"], "Asha")
    assert still_blocked["error"]["code"] == "PHONE_NOT_VERIFIED"

    confirmed = clinic.confirm_caller_phone(True)
    assert confirmed["confirmed"] is True

    booked = clinic.book_appointment("Dr. Meera Iyer", slot["id"], "Asha")
    assert booked["ok"] is True
    assert booked["appointment"]["patient_name"] == "Asha"


def test_rejecting_number_clears_pending_state(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, _, session = tools
    clinic.set_caller_phone("+91 98765 43210")
    rejected = clinic.confirm_caller_phone(False)
    assert rejected["confirmed"] is False
    assert session.pending_phone is None
    assert session.verified_phone is None

    no_pending = clinic.confirm_caller_phone(True)
    assert no_pending["ok"] is False
    assert no_pending["error"]["code"] == "NO_PENDING_PHONE"


def test_new_number_invalidates_previous_verification(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, service, session = tools
    clinic.set_caller_phone("9876543210")
    clinic.confirm_caller_phone(True)
    assert session.verified_phone == "+919876543210"

    clinic.set_caller_phone("9123456780")
    assert session.verified_phone is None
    slot = service.check_availability("Dr. Meera Iyer")["slots"][0]
    blocked = clinic.book_appointment("Dr. Meera Iyer", slot["id"], "Asha")
    assert blocked["error"]["code"] == "PHONE_NOT_VERIFIED"


def test_tool_contracts_for_list_and_cancel(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, service, _ = tools
    clinic.set_caller_phone("9123456780")
    clinic.confirm_caller_phone(True)

    slots = service.check_availability("Dr. Aarav Mehta")["slots"][:2]
    first = clinic.book_appointment("Dr. Aarav Mehta", slots[0]["id"], "Asha")
    second = clinic.book_appointment("Dr. Aarav Mehta", slots[1]["id"], "Asha")
    assert first["ok"] and second["ok"]

    listed = clinic.list_caller_appointments()
    assert listed["ok"] is True
    assert len(listed["appointments"]) == 2

    ambiguous = clinic.cancel_appointment()
    assert ambiguous["ok"] is False
    assert ambiguous["error"]["code"] == "AMBIGUOUS_APPOINTMENT"
    assert len(ambiguous["appointments"]) == 2

    cancelled = clinic.cancel_appointment(first["appointment"]["id"])
    assert cancelled["ok"] is True
    assert cancelled["appointment"]["status"] == "cancelled"

    remaining = clinic.list_caller_appointments()
    assert [item["id"] for item in remaining["appointments"]] == [
        second["appointment"]["id"]
    ]


def test_phone_validation_is_returned_as_tool_error(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, _, _ = tools
    result = clinic.set_caller_phone("123")
    assert result["ok"] is False
    assert result["error"]["code"] == "PHONE_INVALID"


def test_invalid_date_is_returned_as_tool_error(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, _, _ = tools
    result = clinic.check_doctor_availability("Dr. Meera Iyer", "someday")
    assert result["ok"] is False
    assert result["error"]["code"] == "DATE_INVALID"


def test_spoken_relative_dates_are_accepted(
    tools: tuple[ClinicTools, AppointmentService, CallSession],
) -> None:
    clinic, _, _ = tools
    for phrase in ("today", "tomorrow", "Friday", "next Monday", "26 Nov"):
        result = clinic.check_doctor_availability("Dr. Meera Iyer", phrase)
        assert result["ok"] is True, phrase
        assert result["date"], phrase
