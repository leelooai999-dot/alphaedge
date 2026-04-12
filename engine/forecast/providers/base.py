from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Protocol, Sequence


@dataclass(frozen=True)
class BaselineForecastRequest:
    series: Sequence[float]
    horizon: int
    quantiles: Sequence[float] = field(default_factory=lambda: (0.1, 0.5, 0.9))
    frequency: Optional[str] = None
    timestamps: Optional[Sequence[str]] = None
    ohlcv: Optional[Dict[str, Sequence[float]]] = None


@dataclass(frozen=True)
class BaselineForecast:
    available: bool
    horizon: int
    point: List[float]
    quantiles: Dict[float, List[float]]
    mode: str
    provider: str
    message: Optional[str] = None


class ForecastProvider(Protocol):
    name: str

    def is_available(self) -> bool:
        ...

    def forecast(self, request: BaselineForecastRequest) -> BaselineForecast:
        ...
