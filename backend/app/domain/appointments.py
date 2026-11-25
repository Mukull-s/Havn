"""Doctor availability, booking and cancellation business logic.

The voice tools and REST API both call this service, so the same validation and
transaction rules apply everywhere.
"""

from __future__ import annotations

import re
import secrets
import sqlite3
import string
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Any
from zoneinfo import ZoneInfo

from app.clinic import (
    clinic_day_start,
    clinic_today,
    from_iso,
    parse_clinic_date,
    slot_labels,
    to_iso,
    utc_now,
)
from app.db import Database
from app.domain.errors import DomainError
from app.domain.phone import format_phone, mask_phone, normalize_phone

APPOINTMENT_SELECT = """
SELECT
    a.id AS appointment_id,
    a.reference,
    a.patient_name,
    a.phone,
    a.status,
    a.created_at,
    a.cancelled_at,
    s.id AS slot_id,
    s.starts_at,
    s.duration_minutes,
    d.id AS doctor_id,
    d.name AS doctor_name,
    d.specialty,
    d.credentials,
    d.room,
    d.accent,
    d.bio
FROM appointments a
JOIN slots s ON s.id = a.slot_id
JOIN doctors d ON d.id = a.doctor_id
"""

REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", value.lower()).strip()


def _clean_name(value: str | None) -> str:
    if not value:
        return "Patient"
    cleaned = re.sub(r"\s+", " ", value.strip())
    cleaned = re.sub(r"[^\w .'-]", "", cleaned)[:80].strip()
    return cleaned or "Patient"


class AppointmentService:
    def __init__(self, db: Database, tz: ZoneInfo, clinic_name: str = "Havn Clinic"):
        self.db = db
        self.tz = tz
        self.clinic_name = clinic_name

    # ------------------------------------------------------------------ reads

    def _doctor_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["doctor_id"],
            "name": row["doctor_name"],
            "specialty": row["specialty"],
            "credentials": row["credentials"],
            "room": row["room"],
            "accent": row["accent"],
            "bio": row["bio"],
        }

    def _slot_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        starts_at = from_iso(row["starts_at"])
        labels = slot_labels(starts_at, self.tz)
        return {
            "id": row["slot_id"],
            "starts_at": row["starts_at"],
            "duration_minutes": row["duration_minutes"],
            **labels,
        }

    def _appointment_payload(self, row: sqlite3.Row) -> dict[str, Any]:
        slot = self._slot_payload(row)
        return {
            "id": row["appointment_id"],
            "reference": row["reference"],
            "patient_name": row["patient_name"],
            "phone_masked": mask_phone(row["phone"]),
            "status": row["status"],
            "doctor": self._doctor_payload(row),
            "slot": slot,
            "starts_at": slot["starts_at"],
            "date_label": slot["date_label"],
            "time_label": slot["time_label"],
            "label": slot["label"],
            "created_at": row["created_at"],
            "cancelled_at": row["cancelled_at"],
        }

    def _available_slot_rows(self, doctor_id: str | None = None) -> list[sqlite3.Row]:
        sql = """
            SELECT s.id AS slot_id, s.starts_at, s.duration_minutes,
                   d.id AS doctor_id, d.name AS doctor_name, d.specialty,
                   d.credentials, d.room, d.accent, d.bio
            FROM slots s
            JOIN doctors d ON d.id = s.doctor_id
            WHERE s.starts_at >= ?
              AND NOT EXISTS (
                  SELECT 1 FROM appointments a
                  WHERE a.slot_id = s.id AND a.status = 'booked'
              )
        """
        params: list[Any] = [to_iso(utc_now())]
        if doctor_id:
            sql += " AND s.doctor_id = ?"
            params.append(doctor_id)
        sql += " ORDER BY s.starts_at"
        return self.db.read_all(sql, tuple(params))

    def list_doctors(self, include_slots: bool = True) -> list[dict[str, Any]]:
        doctors = self.db.read_all("SELECT * FROM doctors ORDER BY name")
        slots_by_doctor: dict[str, list[dict[str, Any]]] = {}
        if include_slots:
            for row in self._available_slot_rows():
                slots_by_doctor.setdefault(row["doctor_id"], []).append(
                    self._slot_payload(row)
                )

        result = []
        for row in doctors:
            slots = slots_by_doctor.get(row["id"], [])
            result.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "specialty": row["specialty"],
                    "credentials": row["credentials"],
                    "bio": row["bio"],
                    "room": row["room"],
                    "accent": row["accent"],
                    "initials": "".join(
                        part[0] for part in row["name"].replace("Dr.", "").split()[:2]
                    ).upper(),
                    "availability": slots,
                    "available_count": len(slots),
                    "next_available": slots[0] if slots else None,
                }
            )
        return result

    def list_appointments(self, limit: int = 50) -> list[dict[str, Any]]:
        cutoff = to_iso(utc_now() - timedelta(hours=24))
        rows = self.db.read_all(
            APPOINTMENT_SELECT
            + """
            WHERE (a.status = 'booked' AND s.starts_at >= ?)
               OR (a.status = 'cancelled' AND a.cancelled_at >= ?)
            ORDER BY
                CASE a.status WHEN 'booked' THEN 0 ELSE 1 END,
                s.starts_at
            LIMIT ?
            """,
            (to_iso(utc_now()), cutoff, limit),
        )
        return [self._appointment_payload(row) for row in rows]

    def get_appointment(self, appointment_id: str) -> dict[str, Any] | None:
        row = self.db.read_one(
            APPOINTMENT_SELECT + " WHERE a.id = ?", (appointment_id,)
        )
        return self._appointment_payload(row) if row else None

    def list_active_for_phone(self, phone: str) -> list[dict[str, Any]]:
        rows = self.db.read_all(
            APPOINTMENT_SELECT
            + """
            WHERE a.phone = ? AND a.status = 'booked' AND s.starts_at >= ?
            ORDER BY s.starts_at
            """,
            (phone, to_iso(utc_now())),
        )
        return [self._appointment_payload(row) for row in rows]

    def activity(self, limit: int = 12) -> list[dict[str, Any]]:
        rows = self.db.read_all(
            "SELECT * FROM activity ORDER BY id DESC LIMIT ?", (limit,)
        )
        return [
            {
                "id": row["id"],
                "kind": row["kind"],
                "patient_name": row["patient_name"],
                "detail": row["detail"],
                "created_at": row["created_at"],
                "time_label": from_iso(row["created_at"])
                .astimezone(self.tz)
                .strftime("%I:%M %p")
                .lstrip("0"),
            }
            for row in rows
        ]

    def dashboard(self) -> dict[str, Any]:
        now = utc_now()
        doctors = self.list_doctors()
        appointments = self.list_appointments()
        today_start = to_iso(clinic_day_start(clinic_today(self.tz), self.tz))
        booked_count = self.db.read_one(
            """
            SELECT COUNT(*) AS count FROM appointments a
            JOIN slots s ON s.id = a.slot_id
            WHERE a.status = 'booked' AND s.starts_at >= ?
            """,
            (to_iso(now),),
        )["count"]
        cancelled_today = self.db.read_one(
            "SELECT COUNT(*) AS count FROM appointments WHERE status = 'cancelled' AND cancelled_at >= ?",
            (today_start,),
        )["count"]
        return {
            "generated_at": to_iso(now),
            "clinic": {
                "name": self.clinic_name,
                "timezone": str(self.tz),
                "today": clinic_today(self.tz).isoformat(),
            },
            "doctors": doctors,
            "appointments": appointments,
            "activity": self.activity(),
            "stats": {
                "doctors": len(doctors),
                "available_slots": sum(d["available_count"] for d in doctors),
                "upcoming_appointments": booked_count,
                "cancelled_today": cancelled_today,
            },
        }

    # --------------------------------------------------------------- matching

    def _doctor_score(self, query: str, row: sqlite3.Row) -> int:
        q = _normalize_text(query)
        if not q:
            return 0
        keys = row.keys()
        doctor_id = row["doctor_id"] if "doctor_id" in keys else row["id"]
        name_value = row["doctor_name"] if "doctor_name" in keys else row["name"]
        name = _normalize_text(name_value)
        specialty = _normalize_text(row["specialty"])
        bio = _normalize_text(row["bio"])
        haystack = f"{name} {specialty} {bio}"
        if q in {_normalize_text(doctor_id), name}:
            return 100
        if q in name:
            return 80 + len(q)
        if q in specialty:
            return 70 + len(q)
        tokens = [token for token in q.split() if token not in {"dr", "doctor"}]
        if tokens and all(token in haystack for token in tokens):
            return 60 + len(tokens)

        # Fallback for minor speech-to-text spelling variations (e.g. "Mira" -> "Meera").
        clean_q = " ".join(tokens)
        clean_name = " ".join(t for t in name.split() if t not in {"dr", "doctor"})
        if clean_q and clean_name:
            ratio = SequenceMatcher(None, clean_q, clean_name).ratio()
            if ratio >= 0.74:
                return int(round(ratio * 55))
            # Single spoken surname or first name fuzzy check (e.g. "Mira" vs "Meera")
            for q_tok in tokens:
                for n_tok in clean_name.split():
                    if len(q_tok) >= 4 and len(n_tok) >= 4:
                        tok_ratio = SequenceMatcher(None, q_tok, n_tok).ratio()
                        if tok_ratio >= 0.78:
                            return int(round(tok_ratio * 50))
        return 0

    def resolve_doctor(self, query: str) -> dict[str, Any]:
        doctors = self.db.read_all("SELECT * FROM doctors ORDER BY name")
        scored = [(self._doctor_score(query, row), row) for row in doctors]
        scored = [(score, row) for score, row in scored if score > 0]
        if not scored:
            raise DomainError(
                "DOCTOR_NOT_FOUND",
                f"I could not find a doctor matching '{query}'.",
                doctors=[
                    {"id": row["id"], "name": row["name"], "specialty": row["specialty"]}
                    for row in doctors
                ],
            )
        best = max(score for score, _ in scored)
        top = [row for score, row in scored if score == best]
        if len(top) > 1:
            raise DomainError(
                "DOCTOR_AMBIGUOUS",
                "More than one doctor matches. Please ask the caller which one they mean.",
                options=[
                    {"id": row["id"], "name": row["name"], "specialty": row["specialty"]}
                    for row in top
                ],
            )
        row = top[0]
        return {
            "id": row["id"],
            "name": row["name"],
            "specialty": row["specialty"],
            "credentials": row["credentials"],
            "room": row["room"],
            "accent": row["accent"],
            "bio": row["bio"],
        }

    # ------------------------------------------------------------- operations

    def check_availability(
        self, doctor_query: str = "", date_value: str = "", limit: int = 10
    ) -> dict[str, Any]:
        requested_date = None
        if date_value.strip():
            try:
                requested_date = parse_clinic_date(date_value, self.tz)
            except ValueError as exc:
                raise DomainError("DATE_INVALID", str(exc)) from exc

        if doctor_query.strip():
            doctor = self.resolve_doctor(doctor_query)
            rows = self._available_slot_rows(doctor["id"])
            slots = [self._slot_payload(row) for row in rows]
            if requested_date:
                slots = [slot for slot in slots if slot["date"] == requested_date.isoformat()]
            return {
                "ok": True,
                "doctor": doctor,
                "date": requested_date.isoformat() if requested_date else None,
                "timezone": str(self.tz),
                "slots": slots[:limit],
                "total_open": len(slots),
                "message": (
                    f"{len(slots)} open slot(s) found."
                    if slots
                    else "No open slots match that request. Offer another day or doctor."
                ),
            }

        rows = self._available_slot_rows()
        by_doctor: dict[str, dict[str, Any]] = {}
        for row in rows:
            slot = self._slot_payload(row)
            if requested_date and slot["date"] != requested_date.isoformat():
                continue
            entry = by_doctor.setdefault(
                row["doctor_id"],
                {
                    "doctor": self._doctor_payload(row),
                    "slots": [],
                },
            )
            if len(entry["slots"]) < 3:
                entry["slots"].append(slot)
        return {
            "ok": True,
            "date": requested_date.isoformat() if requested_date else None,
            "timezone": str(self.tz),
            "doctors": list(by_doctor.values()),
            "message": "Ask which doctor or specialty the caller would like.",
        }

    def _reference(self) -> str:
        return "HVN-" + "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(4))

    def book(
        self,
        phone: str,
        patient_name: str | None,
        doctor_query: str,
        slot_id: str,
    ) -> dict[str, Any]:
        canonical_phone = normalize_phone(phone)
        if not slot_id or not slot_id.strip():
            raise DomainError(
                "SLOT_REQUIRED", "Choose one of the offered slot IDs before booking."
            )
        slot_id = slot_id.strip()
        doctor_query = (doctor_query or "").strip()
        cleaned_name = _clean_name(patient_name)

        appointment_id = f"appt_{secrets.token_hex(6)}"
        reference = self._reference()
        conflict_doctor_id: str | None = None
        conflict_date: str | None = None

        try:
            with self.db.transaction() as connection:
                row = connection.execute(
                    """
                    SELECT s.id AS slot_id, s.starts_at, s.duration_minutes,
                           d.id AS doctor_id, d.name AS doctor_name, d.specialty,
                           d.credentials, d.room, d.accent, d.bio
                    FROM slots s
                    JOIN doctors d ON d.id = s.doctor_id
                    WHERE s.id = ?
                    """,
                    (slot_id,),
                ).fetchone()
                if not row:
                    raise DomainError(
                        "SLOT_NOT_FOUND",
                        "That slot no longer exists. Check availability again.",
                    )
                if from_iso(row["starts_at"]) <= utc_now():
                    raise DomainError(
                        "SLOT_IN_PAST",
                        "That slot has already passed. Offer a later slot.",
                    )
                if doctor_query and self._doctor_score(doctor_query, row) == 0:
                    raise DomainError(
                        "DOCTOR_SLOT_MISMATCH",
                        "That slot belongs to a different doctor. Check availability again.",
                        slot=self._slot_payload(row),
                        doctor=self._doctor_payload(row),
                    )
                conflict_doctor_id = row["doctor_id"]
                conflict_date = slot_labels(from_iso(row["starts_at"]), self.tz)["date"]
                existing = connection.execute(
                    "SELECT id FROM appointments WHERE slot_id = ? AND status = 'booked'",
                    (slot_id,),
                ).fetchone()
                if existing:
                    raise sqlite3.IntegrityError("slot already booked")

                created_at = to_iso(utc_now())
                connection.execute(
                    """
                    INSERT INTO appointments
                        (id, reference, slot_id, doctor_id, patient_name, phone, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)
                    """,
                    (
                        appointment_id,
                        reference,
                        slot_id,
                        row["doctor_id"],
                        cleaned_name,
                        canonical_phone,
                        created_at,
                    ),
                )
                labels = slot_labels(from_iso(row["starts_at"]), self.tz)
                connection.execute(
                    """
                    INSERT INTO activity
                        (kind, appointment_id, doctor_id, patient_name, phone, detail, created_at)
                    VALUES ('booked', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        appointment_id,
                        row["doctor_id"],
                        cleaned_name,
                        canonical_phone,
                        f"Booked with {row['doctor_name']} on {labels['label']}",
                        created_at,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            # The partial unique index is the final authority on double booking.
            alternatives: list[dict[str, Any]] = []
            if conflict_doctor_id:
                open_rows = self._available_slot_rows(conflict_doctor_id)
                all_open = [self._slot_payload(r) for r in open_rows]
                same_day = [
                    s for s in all_open if conflict_date and s["date"] == conflict_date
                ]
                alternatives = (same_day or all_open)[:3]
            raise DomainError(
                "SLOT_TAKEN",
                "That slot was just booked by someone else. Offer another slot.",
                alternative_slots=alternatives,
                next_step=(
                    "Apologise briefly and offer one of alternative_slots, or check availability again."
                    if alternatives
                    else "Apologise briefly and call check_doctor_availability to find another day."
                ),
            ) from exc

        appointment = self.get_appointment(appointment_id)
        assert appointment is not None
        return {
            "ok": True,
            "appointment": appointment,
            "message": (
                f"Booked {appointment['reference']} with {appointment['doctor']['name']} "
                f"on {appointment['label']}."
            ),
        }

    def cancel(
        self, phone: str, appointment_id: str | None = None
    ) -> dict[str, Any]:
        canonical_phone = normalize_phone(phone)
        with self.db.transaction() as connection:
            rows = connection.execute(
                APPOINTMENT_SELECT
                + """
                WHERE a.phone = ? AND a.status = 'booked' AND s.starts_at >= ?
                ORDER BY s.starts_at
                """,
                (canonical_phone, to_iso(utc_now())),
            ).fetchall()

            if appointment_id:
                selected = [row for row in rows if row["appointment_id"] == appointment_id]
            else:
                selected = list(rows)

            if not selected:
                raise DomainError(
                    "NO_ACTIVE_APPOINTMENT",
                    "I could not find an active appointment for that phone number.",
                )

            if len(selected) > 1 and not appointment_id:
                options = [self._appointment_payload(row) for row in selected]
                raise DomainError(
                    "AMBIGUOUS_APPOINTMENT",
                    "There is more than one active appointment for this number. Ask which one to cancel.",
                    appointments=options,
                )

            target = selected[0]
            cancelled_at = to_iso(utc_now())
            connection.execute(
                "UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'booked'",
                (cancelled_at, target["appointment_id"]),
            )
            labels = slot_labels(from_iso(target["starts_at"]), self.tz)
            connection.execute(
                """
                INSERT INTO activity
                    (kind, appointment_id, doctor_id, patient_name, phone, detail, created_at)
                VALUES ('cancelled', ?, ?, ?, ?, ?, ?)
                """,
                (
                    target["appointment_id"],
                    target["doctor_id"],
                    target["patient_name"],
                    canonical_phone,
                    f"Cancelled {target['reference']} with {target['doctor_name']} on {labels['label']}",
                    cancelled_at,
                ),
            )

        appointment = self.get_appointment(target["appointment_id"])
        assert appointment is not None
        return {
            "ok": True,
            "appointment": appointment,
            "message": (
                f"Cancelled {appointment['reference']} with "
                f"{appointment['doctor']['name']} on {appointment['label']}."
            ),
        }
