from __future__ import annotations

from .base import BaselineForecast, BaselineForecastRequest
from timesfm_service import TimesfmRequest, TimesfmService


class TimesfmForecastProvider:
    name = "timesfm"

    def __init__(self, allow_fallback: bool = True):
        self._service = TimesfmService(allow_fallback=allow_fallback)

    def is_available(self) -> bool:
        return True

    def forecast(self, request: BaselineForecastRequest) -> BaselineForecast:
        forecast = self._service.forecast(
            TimesfmRequest(
                series=request.series,
                horizon=request.horizon,
                quantiles=request.quantiles,
                frequency=request.frequency,
            )
        )
        return BaselineForecast(
            available=True,
            horizon=forecast.horizon,
            point=forecast.point,
            quantiles=forecast.quantiles,
            mode=forecast.mode,
            provider=self.name,
            message=None,
        )
