from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.db import Database
from app.domain.appointments import AppointmentService
from app.domain.errors import DomainError
from app.seed import seed_database

TZ = ZoneInfo("Asia/Kolkata")


@pytest.fixture()
def db(tmp_path: Path) -> Database:
    database = Database(tmp_path / "havn-test.db")
    seed_database(database, TZ)
    return database


@pytest.fixture()
def service(db: Database) -> AppointmentService:
    return AppointmentService(db, TZ)


def first_slot(service: AppointmentService, doctor: str = "Dr. Meera Iyer") -> dict:
    result = service.check_availability(doctor)
    assert result["slots"], f"expected seeded availability for {doctor}"
    return result["slots"][0]


def test_seed_creates_doctors_and_future_slots(service: AppointmentService) -> None:
    doctors = service.list_doctors()
    assert len(doctors) == 6
    assert all(doctor["available_count"] > 0 for doctor in doctors)
    assert all(doctor["next_available"] for doctor in doctors)


def test_check_availability_filters_by_date(service: AppointmentService) -> None:
    all_slots = service.check_availability("Dr. Isha Nair")["slots"]
    target_date = all_slots[0]["date"]
    filtered = service.check_availability("Dr. Isha Nair", target_date)
    assert filtered["slots"]
    assert all(slot["date"] == target_date for slot in filtered["slots"])


def test_unknown_doctor_returns_options(service: AppointmentService) -> None:
    with pytest.raises(DomainError) as error:
        service.check_availability("Dr. Nobody")
    assert error.value.code == "DOCTOR_NOT_FOUND"
    assert len(error.value.details["doctors"]) == 6


def test_booking_persists_and_removes_slot(service: AppointmentService) -> None:
    slot = first_slot(service)
    result = service.book("+919800000001", "Test Patient", "Dr. Meera Iyer", slot["id"])
    assert result["ok"] is True
    appointment = result["appointment"]
    assert appointment["status"] == "booked"
    assert appointment["phone_masked"].endswith("0001")
    assert appointment["slot"]["id"] == slot["id"]

    remaining = service.check_availability("Dr. Meera Iyer")["slots"]
    assert slot["id"] not in {item["id"] for item in remaining}

    active = service.list_active_for_phone("+919800000001")
    assert [item["id"] for item in active] == [appointment["id"]]


def test_double_booking_same_slot_is_rejected(service: AppointmentService) -> None:
    slot = first_slot(service)
    first = service.book("+919800000002", "First", "Dr. Meera Iyer", slot["id"])
    assert first["ok"] is True

    with pytest.raises(DomainError) as error:
        service.book("+919800000003", "Second", "Dr. Meera Iyer", slot["id"])
    assert error.value.code == "SLOT_TAKEN"
    alternatives = error.value.details.get("alternative_slots")
    assert isinstance(alternatives, list) and len(alternatives) > 0
    assert all(alt["id"] != slot["id"] for alt in alternatives)
    assert "next_step" in error.value.details


def test_booking_rejects_doctor_slot_mismatch(service: AppointmentService) -> None:
    slot = first_slot(service, "Dr. Meera Iyer")
    with pytest.raises(DomainError) as error:
        service.book("+919800000004", "Test", "Dr. Aarav Mehta", slot["id"])
    assert error.value.code == "DOCTOR_SLOT_MISMATCH"


def test_concurrent_bookings_only_one_wins(service: AppointmentService, db: Database) -> None:
    slot = first_slot(service)
    barrier = threading.Barrier(8)

    def attempt(index: int) -> dict:
        barrier.wait(timeout=10)
        try:
            return service.book(
                f"+91981111{index:04d}", f"Racer {index}", "Dr. Meera Iyer", slot["id"]
            )
        except DomainError as error:
            return error.as_result()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, range(8)))

    successes = [result for result in results if result.get("ok")]
    failures = [result for result in results if not result.get("ok")]
    assert len(successes) == 1
    assert len(failures) == 7
    assert all(result["error"]["code"] == "SLOT_TAKEN" for result in failures)

    row = db.read_one(
        "SELECT COUNT(*) AS count FROM appointments WHERE slot_id = ? AND status = 'booked'",
        (slot["id"],),
    )
    assert row["count"] == 1


def test_cancel_frees_slot_and_records_activity(service: AppointmentService) -> None:
    slot = first_slot(service)
    booked = service.book("+919800000005", "Cancel Me", "Dr. Meera Iyer", slot["id"])
    appointment_id = booked["appointment"]["id"]

    cancelled = service.cancel("+919800000005", appointment_id)
    assert cancelled["ok"] is True
    assert cancelled["appointment"]["status"] == "cancelled"

    remaining = service.check_availability("Dr. Meera Iyer")["slots"]
    assert slot["id"] in {item["id"] for item in remaining}
    assert service.list_active_for_phone("+919800000005") == []


def test_cancel_requires_matching_phone(service: AppointmentService) -> None:
    slot = first_slot(service)
    booked = service.book("+919800000006", "Owner", "Dr. Meera Iyer", slot["id"])
    with pytest.raises(DomainError) as error:
        service.cancel("+919800000007", booked["appointment"]["id"])
    assert error.value.code == "NO_ACTIVE_APPOINTMENT"


def test_ambiguous_cancellation_lists_options(service: AppointmentService) -> None:
    slots = service.check_availability("Dr. Meera Iyer")["slots"][:2]
    first = service.book("+919800000008", "Multi", "Dr. Meera Iyer", slots[0]["id"])
    second = service.book("+919800000008", "Multi", "Dr. Meera Iyer", slots[1]["id"])

    with pytest.raises(DomainError) as error:
        service.cancel("+919800000008")
    assert error.value.code == "AMBIGUOUS_APPOINTMENT"
    ids = {item["id"] for item in error.value.details["appointments"]}
    assert ids == {first["appointment"]["id"], second["appointment"]["id"]}

    selected = service.cancel("+919800000008", first["appointment"]["id"])
    assert selected["ok"] is True
    remaining = service.list_active_for_phone("+919800000008")
    assert [item["id"] for item in remaining] == [second["appointment"]["id"]]
