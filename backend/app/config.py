"""Application configuration loaded from the repository environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]

# Root .env is the canonical location; backend/.env is supported for local overrides.
load_dotenv(ROOT_DIR / ".env", override=True)
load_dotenv(BACKEND_DIR / ".env", override=True)


def _resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT_DIR / path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    db_path: Path
    clinic_name: str
    clinic_timezone: ZoneInfo
    cors_origins: tuple[str, ...]
    allow_demo_reset: bool
    elevenlabs_api_key: str
    elevenlabs_voice_id: str
    elevenlabs_stt_model: str
    elevenlabs_tts_model: str
    google_api_key: str
    gemini_model: str
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    llm_provider: str = ""

    @property
    def active_llm_provider(self) -> str | None:
        preferred = self.llm_provider.strip().lower()
        if preferred == "groq" and self.groq_api_key:
            return "groq"
        if preferred == "gemini" and self.google_api_key:
            return "gemini"
        if self.groq_api_key and preferred != "gemini":
            return "groq"
        if self.google_api_key:
            return "gemini"
        return None

    @property
    def active_llm_model(self) -> str:
        if self.active_llm_provider == "groq":
            return self.groq_model
        return self.gemini_model

    @property
    def voice_ready(self) -> bool:
        return bool(self.elevenlabs_api_key and self.active_llm_provider)


def get_settings() -> Settings:
    return Settings(
        host=os.getenv("HAVN_HOST", "127.0.0.1"),
        port=int(os.getenv("HAVN_PORT", "7860")),
        db_path=_resolve_path(os.getenv("HAVN_DB_PATH", "backend/data/havn.db")),
        clinic_name=os.getenv("HAVN_CLINIC_NAME", "Havn Clinic"),
        clinic_timezone=ZoneInfo(os.getenv("HAVN_CLINIC_TZ", "Asia/Kolkata")),
        cors_origins=tuple(
            origin.strip()
            for origin in os.getenv(
                "HAVN_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
            ).split(",")
            if origin.strip()
        ),
        allow_demo_reset=os.getenv("HAVN_ALLOW_DEMO_RESET", "true").lower()
        in {"1", "true", "yes", "on"},
        elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        elevenlabs_voice_id=os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
        elevenlabs_stt_model=os.getenv(
            "ELEVENLABS_STT_MODEL", "scribe_v2_realtime"
        ),
        elevenlabs_tts_model=os.getenv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5"),
        google_api_key=os.getenv("GOOGLE_API_KEY", ""),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3-flash-preview"),
        groq_api_key=os.getenv("GROQ_API_KEY", ""),
        groq_model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        llm_provider=os.getenv("HAVN_LLM_PROVIDER", ""),
    )


settings = get_settings()
