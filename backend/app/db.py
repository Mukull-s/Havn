"""SQLite persistence for Havn.

All writes go through this module. The connection-per-operation pattern keeps
threaded API handlers and the voice bot from sharing a connection, while WAL
mode plus BEGIN IMMEDIATE transactions make concurrent bookings safe.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    credentials TEXT NOT NULL,
    bio TEXT NOT NULL,
    room TEXT NOT NULL,
    accent TEXT NOT NULL,
    schedule_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS slots (
    id TEXT PRIMARY KEY,
    doctor_id TEXT NOT NULL REFERENCES doctors(id),
    starts_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    UNIQUE (doctor_id, starts_at)
);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    slot_id TEXT NOT NULL REFERENCES slots(id),
    doctor_id TEXT NOT NULL REFERENCES doctors(id),
    patient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled')),
    created_at TEXT NOT NULL,
    cancelled_at TEXT
);

-- The database, not application code, is the final guard against double booking.
CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_active_slot
    ON appointments(slot_id) WHERE status = 'booked';

CREATE INDEX IF NOT EXISTS ix_appointments_phone_status
    ON appointments(phone, status);

CREATE INDEX IF NOT EXISTS ix_appointments_created
    ON appointments(created_at DESC);

CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    appointment_id TEXT,
    doctor_id TEXT,
    patient_name TEXT,
    phone TEXT,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: Path | str):
        self.path = Path(path)

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(
            self.path,
            timeout=15,
            isolation_level=None,
            check_same_thread=False,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 15000")
        return connection

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Open an immediate write transaction.

        BEGIN IMMEDIATE acquires SQLite's write lock before any reads, so two
        concurrent booking attempts cannot both pass the availability check.
        """
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(SCHEMA)

    def read_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(sql, params).fetchone()

    def read_all(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self.connection() as connection:
            return list(connection.execute(sql, params).fetchall())
