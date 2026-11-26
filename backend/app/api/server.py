"""FastAPI application: dashboard data plus the SmallWebRTC voice endpoint."""

from __future__ import annotations

import asyncio
from pathlib import Path
import sqlite3
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from app.config import Settings, get_settings
from app.db import Database
from app.domain.appointments import AppointmentService
from app.domain.session import CallSession
from app.seed import seed_database
from app.voice.bot import run_voice_session


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or get_settings()
    db = Database(config.db_path)
    seed_database(db, config.clinic_timezone)
    service = AppointmentService(db, config.clinic_timezone, config.clinic_name)

    app = FastAPI(title="Havn API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

    handler = SmallWebRTCRequestHandler()
    calls: dict[str, CallSession] = {}
    tasks: set[asyncio.Task] = set()

    # ------------------------------------------------------------- read routes

    @app.get("/api/health")
    async def health() -> dict:
        return {
            "ok": True,
            "service": "havn",
            "voice": {
                "ready": config.voice_ready,
                "stt": "elevenlabs" if config.elevenlabs_api_key else None,
                "tts": "elevenlabs" if config.elevenlabs_api_key else None,
                "llm": config.active_llm_provider,
                "model": config.active_llm_model,
            },
            "clinic": {
                "name": config.clinic_name,
                "timezone": str(config.clinic_timezone),
            },
            "active_calls": len(calls),
        }

    @app.get("/api/dashboard")
    async def dashboard() -> dict:
        try:
            return await asyncio.to_thread(service.dashboard)
        except sqlite3.Error as error:
            logger.exception("Dashboard database read failed")
            raise HTTPException(
                status_code=503,
                detail="Clinic database is temporarily busy. Please retry.",
            ) from error

    @app.get("/api/doctors")
    async def doctors() -> dict:
        try:
            return {"doctors": await asyncio.to_thread(service.list_doctors)}
        except sqlite3.Error as error:
            logger.exception("Doctors database read failed")
            raise HTTPException(
                status_code=503,
                detail="Clinic database is temporarily busy. Please retry.",
            ) from error

    @app.get("/api/appointments")
    async def appointments() -> dict:
        try:
            return {"appointments": await asyncio.to_thread(service.list_appointments)}
        except sqlite3.Error as error:
            logger.exception("Appointments database read failed")
            raise HTTPException(
                status_code=503,
                detail="Clinic database is temporarily busy. Please retry.",
            ) from error

    @app.get("/api/calls")
    async def active_calls() -> dict:
        return {
            "calls": [
                {
                    "session_id": call.session_id,
                    "started_at": call.created_at.isoformat(),
                    "phone": call.phone_status,
                    "events": call.events,
                }
                for call in calls.values()
            ]
        }

    # ------------------------------------------------------------ voice routes

    @app.post("/api/offer")
    async def offer(request: SmallWebRTCRequest):
        if not config.voice_ready:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Voice is not configured. Add ELEVENLABS_API_KEY and either "
                    "GROQ_API_KEY or GOOGLE_API_KEY to .env and restart the backend."
                ),
            )

        async def start_session(connection: SmallWebRTCConnection) -> None:
            session = CallSession(f"call_{uuid.uuid4().hex[:10]}")
            calls[session.session_id] = session
            task = asyncio.create_task(
                run_voice_session(connection, config, service, session),
                name=f"havn-{session.session_id}",
            )
            tasks.add(task)

            def finished(done: asyncio.Task) -> None:
                tasks.discard(done)
                calls.pop(session.session_id, None)

            task.add_done_callback(finished)

        try:
            answer = await handler.handle_web_request(
                request=request,
                webrtc_connection_callback=start_session,
            )
        except HTTPException:
            raise
        except Exception as error:
            logger.exception("SmallWebRTC offer failed")
            raise HTTPException(
                status_code=500,
                detail="Could not establish the voice connection. Check backend logs for details.",
            ) from error

        if not answer:
            raise HTTPException(
                status_code=500, detail="The voice server did not produce an SDP answer."
            )
        return answer

    @app.patch("/api/offer")
    async def ice_candidate(request: SmallWebRTCPatchRequest):
        try:
            await handler.handle_patch_request(request)
        except HTTPException:
            raise
        except Exception as error:
            logger.exception("SmallWebRTC ICE patch failed")
            raise HTTPException(
                status_code=500,
                detail="Could not update WebRTC ICE candidates.",
            ) from error
        return {"status": "ok"}

    # ------------------------------------------------------------- demo helper

    @app.post("/api/demo/reset")
    async def reset_demo() -> dict:
        """Restore the seeded demo data. Fake data only; safe to call locally."""
        if not config.allow_demo_reset:
            raise HTTPException(status_code=404, detail="Demo reset is disabled.")
        if calls:
            raise HTTPException(
                status_code=409, detail="Finish the active call before resetting."
            )

        def rebuild() -> None:
            for suffix in ("", "-wal", "-shm"):
                Path(f"{db.path}{suffix}").unlink(missing_ok=True)
            seed_database(db, config.clinic_timezone)

        await asyncio.to_thread(rebuild)
        return {"ok": True, "message": "Demo data restored."}

    return app


app = create_app()
