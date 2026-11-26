"""Uvicorn entry point: ``uvicorn app.main:app --port 7860``."""

from app.api.server import app

__all__ = ["app"]
