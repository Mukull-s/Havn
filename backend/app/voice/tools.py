"""Pipecat tool adapters around the pure business-logic tools.

Each function is a plain async callable: Pipecat derives the LLM schema from the
name, signature, and docstring, and delivers results via
``params.result_callback``. SQLite work runs in a worker thread so the voice
event loop is never blocked. Tool payloads returned to the LLM are compacted to
keep latency and token usage low while preserving every booking identifier.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

from pipecat.services.llm_service import FunctionCallParams

from app.tools.clinic_tools import ClinicTools

MAX_SLOTS_FOR_VOICE = 6


def _compact_doctor(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return doc
    return {
        "name": doc.get("name"),
        "specialty": doc.get("specialty"),
        "room": doc.get("room"),
    }


def _compact_slot(slot: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": slot.get("id"),
        "label": slot.get("label"),
        "date_label": slot.get("date_label"),
        "time_label": slot.get("time_label"),
    }


def _compact_appointment(appt: dict[str, Any] | None) -> dict[str, Any] | None:
    if not appt:
        return appt
    return {
        "id": appt.get("id"),
        "reference": appt.get("reference"),
        "patient_name": appt.get("patient_name"),
        "phone": appt.get("phone"),
        "status": appt.get("status"),
        "doctor": _compact_doctor(appt.get("doctor")),
        "slot": {
            "id": appt.get("slot", {}).get("id"),
            "label": appt.get("slot", {}).get("label"),
        },
    }


def _compact_for_voice(result: dict[str, Any]) -> dict[str, Any]:
    """Strip display-only UI fields (bio, accent, credentials) before sending to LLM."""
    compacted = dict(result)
    if "doctor" in compacted:
        compacted["doctor"] = _compact_doctor(compacted.get("doctor"))
    if isinstance(compacted.get("slots"), list):
        compacted["slots"] = [
            _compact_slot(slot) for slot in compacted["slots"][:MAX_SLOTS_FOR_VOICE]
        ]
    if isinstance(compacted.get("alternative_slots"), list):
        compacted["alternative_slots"] = [
            _compact_slot(slot)
            for slot in compacted["alternative_slots"][:MAX_SLOTS_FOR_VOICE]
        ]
    if "appointment" in compacted:
        compacted["appointment"] = _compact_appointment(compacted.get("appointment"))
    if isinstance(compacted.get("appointments"), list):
        compacted["appointments"] = [
            _compact_appointment(appt) for appt in compacted["appointments"]
        ]
    return compacted


def build_voice_tools(clinic: ClinicTools) -> list[Callable]:
    async def set_caller_phone(params: FunctionCallParams, phone_number: str) -> None:
        """Record the phone number spoken by the caller so it can be read back.

        Only call this after the caller actually speaks phone digits.

        Args:
            phone_number: Exact digits spoken by the caller, e.g. "98765 43210".
        """
        result = await asyncio.to_thread(clinic.set_caller_phone, phone_number)
        await params.result_callback(_compact_for_voice(result))

    async def confirm_caller_phone(params: FunctionCallParams, confirmed: bool) -> None:
        """Verify the caller's phone number after reading it back and hearing yes.

        Args:
            confirmed: True only when the caller confirmed the readback digits.
        """
        result = await asyncio.to_thread(clinic.confirm_caller_phone, confirmed)
        await params.result_callback(_compact_for_voice(result))

    async def check_doctor_availability(
        params: FunctionCallParams, doctor: str = "", date: str = ""
    ) -> None:
        """Check open appointment slots by doctor name, specialty, or date.

        Args:
            doctor: Doctor name or specialty, e.g. "Dr. Meera Iyer" or "Cardiology".
            date: "today", "tomorrow", weekday like "Friday", or YYYY-MM-DD.
        """
        result = await asyncio.to_thread(
            clinic.check_doctor_availability, doctor, date
        )
        await params.result_callback(_compact_for_voice(result))

    async def list_caller_appointments(params: FunctionCallParams) -> None:
        """List active appointments for the verified caller phone number."""
        result = await asyncio.to_thread(clinic.list_caller_appointments)
        await params.result_callback(_compact_for_voice(result))

    async def book_appointment(
        params: FunctionCallParams,
        doctor: str,
        slot_id: str,
        patient_name: str = "",
    ) -> None:
        """Book an open slot once the caller's phone is verified and name is known.

        Args:
            doctor: Doctor name returned by availability.
            slot_id: Exact slot ID returned by check_doctor_availability.
            patient_name: Patient name spoken by the caller.
        """
        result = await asyncio.to_thread(
            clinic.book_appointment, doctor, slot_id, patient_name
        )
        await params.result_callback(_compact_for_voice(result))

    async def cancel_appointment(
        params: FunctionCallParams, appointment_id: str = ""
    ) -> None:
        """Cancel one active appointment belonging to the verified phone number.

        Args:
            appointment_id: Appointment ID to cancel (omit only if caller has one).
        """
        result = await asyncio.to_thread(clinic.cancel_appointment, appointment_id)
        await params.result_callback(_compact_for_voice(result))

    return [
        set_caller_phone,
        confirm_caller_phone,
        check_doctor_availability,
        list_caller_appointments,
        book_appointment,
        cancel_appointment,
    ]
