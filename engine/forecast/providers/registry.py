from __future__ import annotations

import os
from typing import Dict

from .base import BaselineForecast, BaselineForecastRequest, ForecastProvider
from .kronos_provider import KronosForecastProvider
from .timesfm_provider import TimesfmForecastProvider


def build_provider_registry() -> Dict[str, ForecastProvider]:
    return {
        "timesfm": TimesfmForecastProvider(),
        "kronos": KronosForecastProvider(),
    }


def default_provider_name() -> str:
    return os.environ.get("BASELINE_FORECAST_PROVIDER", "timesfm").strip().lower() or "timesfm"


def forecast_with_provider(request: BaselineForecastRequest, provider: str | None = None) -> BaselineForecast:
    registry = build_provider_registry()
    selected = (provider or default_provider_name()).strip().lower()
    if selected not in registry:
        selected = "timesfm"
    return registry[selected].forecast(request)
