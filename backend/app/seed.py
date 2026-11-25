"""Seed mock doctors, schedules and one demo appointment.

The data is deliberately fictional. Slots are generated for the next two weeks
and are safe to re-run: existing slots and appointments are left untouched.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.clinic import clinic_now, clinic_today, clinic_day_start, to_iso
from app.db import Database

DOCTORS = [
    {
        "id": "dr-aarav-mehta",
        "name": "Dr. Aarav Mehta",
        "specialty": "Cardiology",
        "credentials": "MBBS, MD (Cardiology)",
        "bio": "Heart health, blood pressure and preventive cardiac care.",
        "room": "C-01",
        "accent": "#1f6f5c",
        "weekdays": [0, 1, 2, 3, 4],
        "times": ["09:00", "10:00", "11:00", "12:00"],
    },
    {
        "id": "dr-isha-nair",
        "name": "Dr. Isha Nair",
        "specialty": "Dermatology",
        "credentials": "MBBS, MD (Dermatology)",
        "bio": "Skin, hair and scalp concerns for adults and teens.",
        "room": "D-03",
        "accent": "#b4552d",
        "weekdays": [0, 1, 2, 3, 4, 5],
        "times": ["11:00", "12:00", "14:00", "15:00"],
    },
    {
        "id": "dr-rohan-kapoor",
        "name": "Dr. Rohan Kapoor",
        "specialty": "Pediatrics",
        "credentials": "MBBS, DCH",
        "bio": "Routine child health, growth checks and common illnesses.",
        "room": "P-02",
        "accent": "#356a8a",
        "weekdays": [0, 1, 2, 3, 4],
        "times": ["14:00", "15:00", "16:00", "17:00"],
    },
    {
        "id": "dr-meera-iyer",
        "name": "Dr. Meera Iyer",
        "specialty": "General Medicine",
        "credentials": "MBBS, MD (Internal Medicine)",
        "bio": "Everyday health concerns, fevers and ongoing care.",
        "room": "G-01",
        "accent": "#8a6a2f",
        "weekdays": [0, 1, 2, 3, 4, 5],
        "times": ["08:30", "09:30", "10:30", "11:30"],
    },
    {
        "id": "dr-kabir-shah",
        "name": "Dr. Kabir Shah",
        "specialty": "Orthopaedics",
        "credentials": "MBBS, MS (Orthopaedics)",
        "bio": "Bone, joint and sports injury care.",
        "room": "O-04",
        "accent": "#6b5a8e",
        "weekdays": [1, 2, 3, 4, 5],
        "times": ["10:00", "11:00", "12:00", "13:00"],
    },
    {
        "id": "dr-sana-qureshi",
        "name": "Dr. Sana Qureshi",
        "specialty": "ENT",
        "credentials": "MBBS, MS (ENT)",
        "bio": "Ear, nose, throat and sinus care.",
        "room": "E-02",
        "accent": "#7a5c48",
        "weekdays": [0, 1, 2, 3, 4],
        "times": ["15:00", "16:00", "17:00", "18:00"],
    },
]


def _slot_id(doctor_id: str, starts_at: str) -> str:
    digest = hashlib.sha1(f"{doctor_id}:{starts_at}".encode()).hexdigest()[:12]
    return f"slot_{digest}"


def seed_database(db: Database, tz: ZoneInfo) -> None:
    db.initialize()
    now = clinic_now(tz)

    with db.transaction() as connection:
        for doctor in DOCTORS:
            connection.execute(
                """
                INSERT INTO doctors (id, name, specialty, credentials, bio, room, accent, schedule_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    specialty = excluded.specialty,
                    credentials = excluded.credentials,
                    bio = excluded.bio,
                    room = excluded.room,
                    accent = excluded.accent,
                    schedule_json = excluded.schedule_json
                """,
                (
                    doctor["id"],
                    doctor["name"],
                    doctor["specialty"],
                    doctor["credentials"],
                    doctor["bio"],
                    doctor["room"],
                    doctor["accent"],
                    json.dumps(
                        {"weekdays": doctor["weekdays"], "times": doctor["times"]}
                    ),
                ),
            )

            for offset in range(14):
                day = clinic_today(tz) + timedelta(days=offset)
                if day.weekday() not in doctor["weekdays"]:
                    continue
                for clock in doctor["times"]:
                    hour, minute = (int(part) for part in clock.split(":"))
                    local_start = datetime.combine(
                        day, time(hour=hour, minute=minute), tzinfo=tz
                    )
                    if local_start <= now + timedelta(minutes=20):
                        continue
                    starts_at = to_iso(local_start)
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO slots (id, doctor_id, starts_at, duration_minutes)
                        VALUES (?, ?, ?, 30)
                        """,
                        (_slot_id(doctor["id"], starts_at), doctor["id"], starts_at),
                    )

        already_seeded = connection.execute(
            "SELECT value FROM meta WHERE key = 'demo_appointment'"
        ).fetchone()
        if not already_seeded:
            tomorrow = clinic_day_start(clinic_today(tz) + timedelta(days=1), tz)
            slot = connection.execute(
                """
                SELECT s.id, s.starts_at, s.doctor_id
                FROM slots s
                WHERE s.doctor_id = 'dr-meera-iyer'
                  AND s.starts_at >= ?
                  AND NOT EXISTS (
                    SELECT 1 FROM appointments a
                    WHERE a.slot_id = s.id AND a.status = 'booked'
                  )
                ORDER BY s.starts_at
                LIMIT 1
                """,
                (to_iso(tomorrow),),
            ).fetchone()
            if slot:
                created_at = to_iso(now)
                connection.execute(
                    """
                    INSERT INTO appointments
                        (id, reference, slot_id, doctor_id, patient_name, phone, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)
                    """,
                    (
                        "appt_demo_ananya",
                        "HVN-7K2M",
                        slot["id"],
                        slot["doctor_id"],
                        "Ananya Rao",
                        "+919876543210",
                        created_at,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO activity (kind, appointment_id, doctor_id, patient_name, phone, detail, created_at)
                    VALUES ('booked', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "appt_demo_ananya",
                        slot["doctor_id"],
                        "Ananya Rao",
                        "+919876543210",
                        "Demo appointment seeded for cancellation testing",
                        created_at,
                    ),
                )
                connection.execute(
                    "INSERT INTO meta (key, value) VALUES ('demo_appointment', ?)",
                    ("appt_demo_ananya",),
                )
