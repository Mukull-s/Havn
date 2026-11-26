"""Business-level voice tools, independent of Pipecat.

Keeping these methods free of Pipecat types makes the contracts testable and
keeps the voice pipeline as a thin adapter.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.domain.appointments import AppointmentService
from app.domain.errors import DomainError
from app.domain.session import CallSession


class ClinicTools:
    def __init__(
        self,
        service: AppointmentService,
        session: CallSession,
        on_change: Callable[[str, dict[str, Any]], None] | None = None,
        on_phone_change: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.service = service
        self.session = session
        self.on_change = on_change
        self.on_phone_change = on_phone_change

    def _guard(self, operation: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        try:
            return operation()
        except DomainError as error:
            return error.as_result()

    def set_caller_phone(self, phone_number: str) -> dict[str, Any]:
        def operation() -> dict[str, Any]:
            result = self.session.set_phone(phone_number)
            if self.on_phone_change:
                self.on_phone_change(self.session.phone_status)
            return result

        return self._guard(operation)

    def confirm_caller_phone(self, confirmed: bool) -> dict[str, Any]:
        def operation() -> dict[str, Any]:
            result = self.session.confirm_phone(bool(confirmed))
            if self.on_phone_change:
                self.on_phone_change(self.session.phone_status)
            return result

        return self._guard(operation)

    def check_doctor_availability(
        self, doctor: str = "", date: str = ""
    ) -> dict[str, Any]:
        return self._guard(
            lambda: self.service.check_availability(doctor_query=doctor, date_value=date)
        )

    def list_caller_appointments(self) -> dict[str, Any]:
        def operation() -> dict[str, Any]:
            phone = self.session.require_verified_phone()
            appointments = self.service.list_active_for_phone(phone)
            return {
                "ok": True,
                "appointments": appointments,
                "message": (
                    f"{len(appointments)} active appointment(s) found."
                    if appointments
                    else "There are no active appointments for this number."
                ),
            }

        return self._guard(operation)

    def book_appointment(
        self, doctor: str, slot_id: str, patient_name: str = ""
    ) -> dict[str, Any]:
        def operation() -> dict[str, Any]:
            phone = self.session.require_verified_phone()
            result = self.service.book(
                phone=phone,
                patient_name=patient_name,
                doctor_query=doctor,
                slot_id=slot_id,
            )
            result["phone"] = self.session.phone_status
            if self.on_change:
                self.on_change("booked", result["appointment"])
            return result

        return self._guard(operation)

    def cancel_appointment(self, appointment_id: str = "") -> dict[str, Any]:
        def operation() -> dict[str, Any]:
            phone = self.session.require_verified_phone()
            result = self.service.cancel(
                phone=phone, appointment_id=appointment_id.strip() or None
            )
            result["phone"] = self.session.phone_status
            if self.on_change:
                self.on_change("cancelled", result["appointment"])
            return result

        return self._guard(operation)
