from __future__ import annotations

import os
from typing import Dict, List, Sequence

from .base import BaselineForecast, BaselineForecastRequest


class KronosForecastProvider:
    name = "kronos"

    def __init__(self):
        self.model_id = os.environ.get("KRONOS_MODEL_ID", "NeoQuasar/Kronos-small")
        self.tokenizer_id = os.environ.get("KRONOS_TOKENIZER_ID", "NeoQuasar/Kronos-Tokenizer-base")
        self.max_context = int(os.environ.get("KRONOS_MAX_CONTEXT", "512"))

    def is_available(self) -> bool:
        return os.environ.get("KRONOS_ENABLED") == "1"

    def forecast(self, request: BaselineForecastRequest) -> BaselineForecast:
        if not self.is_available():
            return BaselineForecast(
                available=False,
                horizon=request.horizon,
                point=[],
                quantiles={},
                mode="unavailable",
                provider=self.name,
                message="Kronos provider scaffold is present but not enabled in this environment.",
            )

        point = self._naive_placeholder_forecast(request.series, request.horizon)
        quantiles = self._placeholder_quantiles(point)
        return BaselineForecast(
            available=True,
            horizon=request.horizon,
            point=point,
            quantiles=quantiles,
            mode="kronos-placeholder",
            provider=self.name,
            message="Kronos provider scaffold enabled. Replace placeholder inference with real model loading.",
        )

    def _naive_placeholder_forecast(self, series: Sequence[float], horizon: int) -> List[float]:
        if not series:
            return []
        last = float(series[-1])
        return [last for _ in range(horizon)]

    def _placeholder_quantiles(self, point: Sequence[float]) -> Dict[float, List[float]]:
        q10, q90 = [], []
        for idx, value in enumerate(point, start=1):
            spread = max(0.005 * value * idx ** 0.5, 0.01)
            q10.append(value - spread)
            q90.append(value + spread)
        return {0.1: q10, 0.5: list(point), 0.9: q90}
