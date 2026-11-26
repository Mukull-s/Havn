from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.api.server import create_app
from app.config import Settings
from app.db import Database
from app.domain.appointments import AppointmentService
from app.domain.session import CallSession
from app.seed import seed_database
from app.tools.clinic_tools import ClinicTools
from app.voice import bot as voice_bot
from app.voice.tools import build_voice_tools
from pipecat.frames.frames import TTSSpeakFrame

TZ = ZoneInfo("Asia/Kolkata")


def _make_settings(tmp_path: Path, *, voice_ready: bool = False) -> Settings:
    return Settings(
        host="127.0.0.1",
        port=7860,
        db_path=tmp_path / "havn-test.db",
        clinic_name="Havn Clinic",
        clinic_timezone=TZ,
        cors_origins=("http://localhost:3000",),
        allow_demo_reset=True,
        elevenlabs_api_key="el_test_key" if voice_ready else "",
        elevenlabs_voice_id="21m00Tcm4TlvDq8ikWAM",
        elevenlabs_stt_model="scribe_v2_realtime",
        elevenlabs_tts_model="eleven_flash_v2_5",
        google_api_key="google_test_key" if voice_ready else "",
        gemini_model="gemini-2.5-flash",
    )


def test_health_dashboard_and_offer_requires_voice_keys(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path, voice_ready=False))
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["voice"]["ready"] is False
    assert health.json()["active_calls"] == 0

    dash = client.get("/api/dashboard")
    assert dash.status_code == 200
    assert len(dash.json()["doctors"]) > 0

    calls = client.get("/api/calls")
    assert calls.status_code == 200
    assert calls.json() == {"calls": []}

    offer = client.post("/api/offer", json={"sdp": "v=0", "type": "offer"})
    assert offer.status_code == 503
    assert "ELEVENLABS_API_KEY" in offer.json()["detail"]


def test_offer_negotiation_lifecycle_and_sanitized_errors(
    tmp_path: Path, monkeypatch
) -> None:
    started_gate = asyncio.Event()
    release_gate = asyncio.Event()

    async def fake_run_voice_session(connection, settings, service, session):
        started_gate.set()
        await release_gate.wait()

    async def fake_handle_web_request(self, request, webrtc_connection_callback):
        conn = SimpleNamespace(is_connected=lambda: False)
        await webrtc_connection_callback(conn)
        await started_gate.wait()
        return {"sdp": "v=0-answer", "type": "answer", "pc_id": "pc_test_1"}

    monkeypatch.setattr("app.api.server.run_voice_session", fake_run_voice_session)
    monkeypatch.setattr(
        "app.api.server.SmallWebRTCRequestHandler.handle_web_request",
        fake_handle_web_request,
    )

    app = create_app(_make_settings(tmp_path, voice_ready=True))
    with TestClient(app) as client:
        response = client.post("/api/offer", json={"sdp": "v=0-offer", "type": "offer"})
        assert response.status_code == 200
        assert response.json()["pc_id"] == "pc_test_1"

        active = client.get("/api/calls").json()["calls"]
        assert len(active) == 1
        assert active[0]["phone"] == {
            "verified": False,
            "pending": False,
            "readback": None,
        }

        # Reset must refuse while a call is active
        conflict = client.post("/api/demo/reset")
        assert conflict.status_code == 409

        # Unknown pc_id patch returns 404 from SmallWebRTCRequestHandler
        patch = client.patch(
            "/api/offer",
            json={"pc_id": "missing_pc", "candidates": []},
        )
        assert patch.status_code == 404

        release_gate.set()


def test_offer_error_sanitizes_internal_exception_details(
    tmp_path: Path, monkeypatch
) -> None:
    async def failing_handle_web_request(self, request, webrtc_connection_callback):
        raise RuntimeError("sensitive internal trace path=/secret/key")

    monkeypatch.setattr(
        "app.api.server.SmallWebRTCRequestHandler.handle_web_request",
        failing_handle_web_request,
    )

    app = create_app(_make_settings(tmp_path, voice_ready=True))
    client = TestClient(app)
    response = client.post("/api/offer", json={"sdp": "v=0", "type": "offer"})
    assert response.status_code == 500
    assert "secret" not in response.json()["detail"]
    assert "Check backend logs" in response.json()["detail"]


def test_demo_reset_removes_wal_and_shm_sidecars(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path, voice_ready=False)
    app = create_app(settings)
    client = TestClient(app)

    wal_path = Path(f"{settings.db_path}-wal")
    shm_path = Path(f"{settings.db_path}-shm")
    wal_path.write_text("stale-wal", encoding="utf-8")
    shm_path.write_text("stale-shm", encoding="utf-8")

    reset = client.post("/api/demo/reset")
    assert reset.status_code == 200
    assert reset.json()["ok"] is True
    assert settings.db_path.exists()
    assert not wal_path.exists()
    assert not shm_path.exists()


def test_pipeline_greets_on_rtvi_client_ready_and_emits_server_change(
    tmp_path: Path, monkeypatch
) -> None:
    settings = _make_settings(tmp_path, voice_ready=True)
    db = Database(settings.db_path)
    seed_database(db, TZ)
    service = AppointmentService(db, TZ, settings.clinic_name)
    session = CallSession("call_rtvi_test")

    class FakeTransport:
        def __init__(self, connection, params):
            self._handlers: dict[str, list] = {}

        def input(self):
            return SimpleNamespace()

        def output(self):
            return SimpleNamespace()

        def event_handler(self, name: str):
            def decorator(fn):
                self._handlers.setdefault(name, []).append(fn)
                return fn

            return decorator

    class FakeRTVI:
        def __init__(self):
            self._handlers: dict[str, list] = {}
            self.sent_messages: list[dict] = []

        def event_handler(self, name: str):
            def decorator(fn):
                self._handlers.setdefault(name, []).append(fn)
                return fn

            return decorator

        async def send_server_message(self, data: dict) -> None:
            self.sent_messages.append(data)

    class FakeWorker:
        def __init__(self, pipeline, enable_rtvi=True, params=None):
            self.rtvi = FakeRTVI()
            self.queued: list[list] = []

        async def queue_frames(self, frames):
            self.queued.append(list(frames))

    class FakeRunner:
        def __init__(self, handle_sigint=False, handle_sigterm=False):
            self.cancelled = False

        async def cancel(self):
            self.cancelled = True

    class FakeConnection:
        def __init__(self):
            self._handlers: dict[str, list] = {}

        def event_handler(self, name: str):
            def decorator(fn):
                self._handlers.setdefault(name, []).append(fn)
                return fn

            return decorator

        def is_connected(self) -> bool:
            return False

    class FakeService:
        Settings = SimpleNamespace

        def __init__(self, **kw):
            pass

    captured_clinic: list[ClinicTools] = []
    real_build_voice_tools = voice_bot.build_voice_tools

    def capture_voice_tools(clinic: ClinicTools):
        captured_clinic.append(clinic)
        return real_build_voice_tools(clinic)

    monkeypatch.setattr(voice_bot, "SmallWebRTCTransport", FakeTransport)
    monkeypatch.setattr(voice_bot, "PipelineWorker", FakeWorker)
    monkeypatch.setattr(voice_bot, "WorkerRunner", FakeRunner)
    monkeypatch.setattr(voice_bot, "ElevenLabsRealtimeSTTService", FakeService)
    monkeypatch.setattr(voice_bot, "ElevenLabsTTSService", FakeService)
    monkeypatch.setattr(voice_bot, "GoogleLLMService", FakeService)
    monkeypatch.setattr(voice_bot, "SileroVADAnalyzer", lambda **kw: object())
    monkeypatch.setattr(
        voice_bot,
        "LLMContextAggregatorPair",
        lambda ctx, user_params=None: (object(), object()),
    )
    monkeypatch.setattr(voice_bot, "Pipeline", lambda processors: object())
    monkeypatch.setattr(voice_bot, "build_voice_tools", capture_voice_tools)

    async def scenario() -> None:
        conn = FakeConnection()
        worker, runner, context = voice_bot.build_pipeline(
            conn, settings, service, session
        )
        # Ensure connection failure cancels runner cleanly
        for fn in conn._handlers.get("failed", []):
            await fn(conn)
        assert runner.cancelled is True

        # Only on_client_ready triggers the instant spoken greeting once
        assert worker.queued == []
        for fn in worker.rtvi._handlers["on_client_ready"]:
            await fn(worker.rtvi)
            await fn(worker.rtvi)
        assert len(worker.queued) == 1
        assert isinstance(worker.queued[0][0], TTSSpeakFrame)
        assert worker.queued[0][0].text == voice_bot.GREETING
        assert worker.queued[0][0].append_to_context is True

        # Booking through ClinicTools emits CallSession events and RTVI server messages
        clinic = captured_clinic[0]
        clinic.set_caller_phone("98765 43210")
        clinic.confirm_caller_phone(True)
        slot = service.check_availability("Dr. Meera Iyer")["slots"][0]
        clinic.book_appointment("Dr. Meera Iyer", slot["id"], "Ananya")
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert [e["kind"] for e in session.events] == [
            "phone_captured",
            "phone_verified",
            "booked",
        ]
        assert len(worker.rtvi.sent_messages) == 3
        assert worker.rtvi.sent_messages[0] == {
            "type": "havn_phone_status",
            "phone": {"verified": False, "pending": True, "readback": None},
        }
        assert worker.rtvi.sent_messages[1] == {
            "type": "havn_phone_status",
            "phone": {"verified": True, "pending": False, "readback": "+91 98765 43210"},
        }
        sent = worker.rtvi.sent_messages[2]
        assert sent["type"] == "havn_appointment_change"
        assert sent["kind"] == "booked"
        assert sent["appointment"]["reference"] == session.events[-1]["reference"]
        assert sent["appointment"]["doctor"]["name"] == "Dr. Meera Iyer"

    asyncio.run(scenario())


def test_voice_tool_adapters_invoke_clinic_tools_async(tmp_path: Path) -> None:
    db = Database(tmp_path / "voice-tools.db")
    seed_database(db, TZ)
    service = AppointmentService(db, TZ)
    session = CallSession("call_adapter")
    changes: list[tuple[str, dict]] = []
    clinic = ClinicTools(
        service, session, on_change=lambda kind, appt: changes.append((kind, appt))
    )
    tools = {fn.__name__: fn for fn in build_voice_tools(clinic)}

    async def run() -> None:
        results: list[dict] = []

        async def capture(result):
            results.append(result)

        params = SimpleNamespace(result_callback=capture)
        await tools["set_caller_phone"](params, "98765 43210")
        await tools["confirm_caller_phone"](params, True)
        slot = service.check_availability("Dr. Meera Iyer")["slots"][0]
        await tools["book_appointment"](
            params, doctor="Dr. Meera Iyer", slot_id=slot["id"], patient_name="Meera"
        )

        assert results[0]["phone"]["readback"] == "+91 98765 43210"
        assert results[1]["confirmed"] is True
        assert results[2]["ok"] is True
        assert changes and changes[0][0] == "booked"

    asyncio.run(run())


def test_groq_provider_selected_when_groq_key_configured(
    tmp_path: Path, monkeypatch
) -> None:
    settings = Settings(
        host="127.0.0.1",
        port=7860,
        db_path=tmp_path / "havn-groq.db",
        clinic_name="Havn Clinic",
        clinic_timezone=TZ,
        cors_origins=("http://localhost:3000",),
        allow_demo_reset=True,
        elevenlabs_api_key="el_test_key",
        elevenlabs_voice_id="EXAVITQu4vr4xnSDxMaL",
        elevenlabs_stt_model="scribe_v2_realtime",
        elevenlabs_tts_model="eleven_flash_v2_5",
        google_api_key="",
        gemini_model="gemini-3-flash-preview",
        groq_api_key="gsk_test_key",
        groq_model="openai/gpt-oss-120b",
    )
    assert settings.voice_ready is True
    assert settings.active_llm_provider == "groq"
    assert settings.active_llm_model == "openai/gpt-oss-120b"

    client = TestClient(create_app(settings))
    health = client.get("/api/health").json()
    assert health["voice"] == {
        "ready": True,
        "stt": "elevenlabs",
        "tts": "elevenlabs",
        "llm": "groq",
        "model": "openai/gpt-oss-120b",
    }

    created_groq: list[dict] = []

    class FakeService:
        Settings = SimpleNamespace

        def __init__(self, **kw):
            created_groq.append(kw)

    class FakeDummy:
        def __init__(self, *a, **kw):
            pass

        def input(self):
            return SimpleNamespace()

        def output(self):
            return SimpleNamespace()

        def event_handler(self, name: str):
            return lambda fn: fn

    class FakeWorker:
        def __init__(self, *a, **kw):
            self.rtvi = SimpleNamespace(event_handler=lambda name: (lambda fn: fn))

    monkeypatch.setattr(voice_bot, "SmallWebRTCTransport", FakeDummy)
    monkeypatch.setattr(voice_bot, "PipelineWorker", FakeWorker)
    monkeypatch.setattr(voice_bot, "WorkerRunner", FakeDummy)
    monkeypatch.setattr(voice_bot, "ElevenLabsRealtimeSTTService", FakeService)
    monkeypatch.setattr(voice_bot, "ElevenLabsTTSService", FakeService)
    monkeypatch.setattr(voice_bot, "GroqLLMService", FakeService)
    monkeypatch.setattr(voice_bot, "SileroVADAnalyzer", lambda **kw: object())
    monkeypatch.setattr(
        voice_bot, "LLMContextAggregatorPair", lambda ctx, user_params=None: (object(), object())
    )
    monkeypatch.setattr(voice_bot, "Pipeline", lambda processors: object())

    db = Database(settings.db_path)
    seed_database(db, TZ)
    voice_bot.build_pipeline(
        FakeDummy(),
        settings,
        AppointmentService(db, TZ, settings.clinic_name),
        CallSession("call_groq_test"),
    )
    assert any(item.get("api_key") == "gsk_test_key" for item in created_groq)


def test_doctor_resolution_handles_minor_stt_spelling_variations(
    tmp_path: Path,
) -> None:
    db = Database(tmp_path / "fuzzy-doc.db")
    seed_database(db, TZ)
    service = AppointmentService(db, TZ)
    resolved = service.resolve_doctor("Dr. Mira Iyer")
    assert resolved["name"] == "Dr. Meera Iyer"

