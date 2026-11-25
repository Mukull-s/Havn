"""Clinic time helpers shared by the API, tools and seed data."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def clinic_now(tz: ZoneInfo) -> datetime:
    return utc_now().astimezone(tz)


def clinic_today(tz: ZoneInfo) -> date:
    return clinic_now(tz).date()


def clinic_day_start(day: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz)


WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def parse_clinic_date(value: str, tz: ZoneInfo) -> date:
    """Parse a date the caller might say or that the model may pass through.

    Accepts ISO and day-first dates, "today", "tomorrow", a weekday name
    ("Friday", "next Friday") and "26 Nov" style dates. Returning a concrete
    date keeps the voice agent from having to do calendar arithmetic itself.
    """
    cleaned = " ".join(value.strip().lower().split())
    today = clinic_today(tz)

    if cleaned in {"today", "this day", "now"}:
        return today
    if cleaned in {"tomorrow", "tomorrow's"}:
        return today + timedelta(days=1)
    if cleaned in {"yesterday"}:
        return today - timedelta(days=1)

    for prefix in ("next ", "this ", "coming ", "on "):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix) :].strip()
            break

    if cleaned in WEEKDAYS:
        return next_weekday(today, WEEKDAYS[cleaned])

    for fmt in (
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%d %b",
        "%d %B",
        "%b %d",
        "%B %d",
    ):
        try:
            if "%Y" in fmt:
                return datetime.strptime(cleaned, fmt).date()
            # Add the current year explicitly; Python 3.15 will require it.
            return datetime.strptime(f"{cleaned} {today.year}", f"{fmt} %Y").date()
        except ValueError:
            continue

    raise ValueError(
        "I didn't catch that date. Please give a day such as today, tomorrow, "
        "Friday, or a date like 2026-11-26."
    )


def slot_labels(starts_at: datetime, tz: ZoneInfo) -> dict[str, str]:
    local = starts_at.astimezone(tz)
    return {
        "date": local.date().isoformat(),
        "date_label": local.strftime("%a, %d %b"),
        "time_label": local.strftime("%I:%M %p").lstrip("0"),
        "label": f"{local.strftime('%a, %d %b')} at {local.strftime('%I:%M %p').lstrip('0')}",
    }


def next_weekday(day: date, weekday: int) -> date:
    """Return the next date on or after `day` matching a Python weekday (Mon=0)."""
    delta = (weekday - day.weekday()) % 7
    return day + timedelta(days=delta)
