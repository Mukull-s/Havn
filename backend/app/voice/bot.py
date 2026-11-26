"""Pipecat voice pipeline for a single browser call.

The pipeline is deliberately thin: speech in, ElevenLabs transcription, Gemini
with clinic tools, ElevenLabs speech out. All appointment rules live in
``app.domain``; the tool adapters in ``app.voice.tools`` are the only bridge.
"""

from __future__ import annotations

import asyncio

from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.elevenlabs.stt import ElevenLabsRealtimeSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.workers.runner import WorkerRunner

from app.config import Settings
from app.domain.appointments import AppointmentService
from app.domain.session import CallSession
from app.tools.clinic_tools import ClinicTools
from app.voice.prompt import GREETING, build_system_prompt
from app.voice.tools import build_voice_tools


def build_pipeline(
    connection: SmallWebRTCConnection,
    settings: Settings,
    service: AppointmentService,
    session: CallSession,
) -> tuple[PipelineWorker, WorkerRunner, LLMContext]:
    """Assemble the pipeline and the objects its event handlers need."""
    transport = SmallWebRTCTransport(
        connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )

    stt = ElevenLabsRealtimeSTTService(
        api_key=settings.elevenlabs_api_key,
        settings=ElevenLabsRealtimeSTTService.Settings(
            model=settings.elevenlabs_stt_model,
            language="en",
        ),
    )

    tts = ElevenLabsTTSService(
        api_key=settings.elevenlabs_api_key,
        settings=ElevenLabsTTSService.Settings(
            voice=settings.elevenlabs_voice_id,
            model=settings.elevenlabs_tts_model,
        ),
    )

    system_prompt = build_system_prompt(settings)
    if settings.active_llm_provider == "groq":
        model_lower = settings.groq_model.lower()
        groq_kwargs: dict = {
            "model": settings.groq_model,
            "temperature": 0.35,
            "max_completion_tokens": 220,
            "system_instruction": system_prompt,
        }
        if "qwen" in model_lower:
            groq_kwargs["reasoning_effort"] = "none"
        elif "gpt-oss" in model_lower:
            groq_kwargs["reasoning_effort"] = "low"
        llm = GroqLLMService(
            api_key=settings.groq_api_key,
            settings=GroqLLMService.Settings(**groq_kwargs),
        )
    else:
        llm = GoogleLLMService(
            api_key=settings.google_api_key,
            settings=GoogleLLMService.Settings(
                model=settings.gemini_model,
                temperature=0.35,
                system_instruction=system_prompt,
            ),
            retry_timeout_secs=8.0,
            retry_on_timeout=True,
        )

    try:
        loop: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    worker: PipelineWorker | None = None

    def emit_rtvi_message(payload: dict) -> None:
        if worker is None or worker.rtvi is None or loop is None or loop.is_closed():
            return

        async def notify_client() -> None:
            try:
                await worker.rtvi.send_server_message(payload)
            except Exception as error:
                logger.debug(
                    "Havn call {}: skipped RTVI notification ({})",
                    session.session_id,
                    error,
                )

        def schedule_notify() -> None:
            loop.create_task(notify_client())

        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None

        if running is loop:
            schedule_notify()
        else:
            loop.call_soon_threadsafe(schedule_notify)

    def handle_clinic_change(kind: str, appointment: dict) -> None:
        session.record_change(kind, appointment)
        emit_rtvi_message(
            {
                "type": "havn_appointment_change",
                "kind": kind,
                "appointment": appointment,
            }
        )

    def handle_phone_change(phone_status: dict) -> None:
        emit_rtvi_message(
            {
                "type": "havn_phone_status",
                "phone": phone_status,
            }
        )

    clinic = ClinicTools(
        service,
        session,
        on_change=handle_clinic_change,
        on_phone_change=handle_phone_change,
    )
    context = LLMContext(
        messages=[],
        tools=build_voice_tools(clinic),
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.7,
                    start_secs=0.15,
                    stop_secs=0.2,
                    min_volume=0.55,
                )
            )
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        enable_rtvi=True,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )
    runner = WorkerRunner(handle_sigint=False, handle_sigterm=False)

    greeted = False

    async def greet_once():
        nonlocal greeted
        if greeted:
            return
        greeted = True
        await worker.queue_frames([TTSSpeakFrame(text=GREETING, append_to_context=True)])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Havn call {}: browser connected", session.session_id)

    if worker.rtvi is not None:

        @worker.rtvi.event_handler("on_client_ready")
        async def on_client_ready(rtvi):
            logger.info("Havn call {}: RTVI client ready", session.session_id)
            await greet_once()

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Havn call {}: browser disconnected", session.session_id)
        await runner.cancel()

    @connection.event_handler("failed")
    async def on_connection_failed(conn):
        logger.warning("Havn call {}: WebRTC connection failed", session.session_id)
        await runner.cancel()

    return worker, runner, context


async def run_voice_session(
    connection: SmallWebRTCConnection,
    settings: Settings,
    service: AppointmentService,
    session: CallSession,
) -> None:
    """Run one browser call to completion."""
    if not settings.voice_ready:
        logger.error("Refusing to start a voice session without provider keys")
        await connection.disconnect()
        return

    worker, runner, _ = build_pipeline(connection, settings, service, session)
    logger.info("Havn call {}: pipeline starting", session.session_id)
    try:
        await runner.add_workers(worker)
        await runner.run()
    except Exception:
        logger.exception("Havn call {}: pipeline failed", session.session_id)
    finally:
        try:
            if connection.is_connected():
                await connection.disconnect()
        except Exception as error:
            logger.debug(
                "Havn call {}: disconnect cleanup note ({})",
                session.session_id,
                error,
            )
        session.close()
        logger.info(
            "Havn call {}: finished with {} event(s)",
            session.session_id,
            len(session.events),
        )
