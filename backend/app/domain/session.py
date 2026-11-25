"""Per-call identity state.

Phone confirmation is enforced here, in application code. The LLM can request
that a number be saved or confirmed, but booking and cancellation read only the
verified number held by this object. Tool arguments never carry a phone number
for writes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.domain.errors import DomainError
from app.domain.phone import format_phone, normalize_phone, spoken_digits


@dataclass
class CallSession:
    session_id: str
    pending_phone: str | None = None
    verified_phone: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    events: list[dict] = field(default_factory=list)

    def set_phone(self, raw: str) -> dict:
        canonical = normalize_phone(raw)
        self.pending_phone = canonical
        # A new number invalidates any previous verification.
        self.verified_phone = None
        self._event("phone_captured")
        return {
            "ok": True,
            "phone": {
                "readback": format_phone(canonical),
                "spoken": spoken_digits(canonical),
                "digits": canonical.lstrip("+"),
            },
            "next_step": (
                "Read the number back to the caller exactly as written in "
                "'phone.readback', then ask them to confirm it is correct. "
                "Only after they say yes, call confirm_caller_phone(confirmed=true)."
            ),
        }

    def confirm_phone(self, confirmed: bool) -> dict:
        if not self.pending_phone:
            raise DomainError(
                "NO_PENDING_PHONE",
                "There is no phone number waiting for confirmation. Ask for the number first.",
            )
        if not confirmed:
            self.pending_phone = None
            self._event("phone_rejected")
            return {
                "ok": True,
                "confirmed": False,
                "message": "The number was not confirmed. Ask the caller to say it again.",
            }

        self.verified_phone = self.pending_phone
        self.pending_phone = None
        self._event("phone_verified")
        return {
            "ok": True,
            "confirmed": True,
            "phone": {
                "readback": format_phone(self.verified_phone),
                "digits": self.verified_phone.lstrip("+"),
            },
            "message": "The caller's phone number is now verified for this call.",
        }

    def require_verified_phone(self) -> str:
        if not self.verified_phone:
            raise DomainError(
                "PHONE_NOT_VERIFIED",
                "The caller's phone number has not been confirmed yet.",
                next_step=(
                    "Ask for the caller's phone number, call set_caller_phone, "
                    "read it back, and call confirm_caller_phone only after the caller agrees."
                ),
            )
        return self.verified_phone

    @property
    def phone_status(self) -> dict:
        return {
            "verified": bool(self.verified_phone),
            "pending": bool(self.pending_phone),
            "readback": format_phone(self.verified_phone) if self.verified_phone else None,
        }

    def _event(self, kind: str) -> None:
        self.events.append(
            {"kind": kind, "at": datetime.now(timezone.utc).isoformat()}
        )

    def record_change(self, kind: str, appointment: dict) -> None:
        """Keep a lightweight in-memory trail of writes made during the call."""
        self.events.append(
            {
                "kind": kind,
                "at": datetime.now(timezone.utc).isoformat(),
                "appointment_id": appointment.get("id"),
                "reference": appointment.get("reference"),
                "doctor": appointment.get("doctor", {}).get("name"),
                "label": appointment.get("label"),
            }
        )

    def close(self) -> None:
        self.events.append(
            {"kind": "call_ended", "at": datetime.now(timezone.utc).isoformat()}
        )

