"""
MonteCarloo Event Definitions and Impact Models.

Events represent market-moving scenarios that shift drift and volatility
for stocks in correlated sectors. Each event has adjustable parameters
and a probability weight (manual or from Polymarket).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class EventParameter:
    """A single adjustable parameter for an event."""
    min: float
    max: float
    default: float
    step: float
    label: str = ""
    description: str = ""

    def __post_init__(self):
        if not self.label:
            self.label = self.description or "param"


@dataclass
class TemporalProfile:
    """Defines how an event's impact evolves over time relative to event_date.
    
    When event_date is set, the simulation uses this profile to shape
    the drift/vol/jump dynamics: anticipation → shock → decay.
    When event_date is None, the v4 flat-drift behavior applies.
    """
    # Pre-event (anticipation phase)
    anticipation_days: int = 0            # Days before event that market starts pricing in
    anticipation_curve: str = "linear"    # "linear" | "exponential" | "step"
    anticipation_vol_ramp: float = 1.0    # Peak vol multiplier during anticipation (1.0 = no change)

    # Event day (shock / jump)
    jump_probability: float = 0.0         # Probability of a discrete price gap [0-1]
    jump_mean: float = 0.0                # Expected jump magnitude (signed, in %)
    jump_std: float = 0.0                 # Jump standard deviation (in %)

    # Post-event (decay / regime shift)
    decay_halflife_days: int = 30         # How quickly drift impact fades
    regime_shift: float = 0.0             # Fraction of impact that's permanent [0-1]
    post_vol_decay: float = 0.5           # How quickly vol normalizes [0=instant, 1=never]


# ---------------------------------------------------------------------------
# Pre-built temporal profiles for common event archetypes
# ---------------------------------------------------------------------------

TEMPORAL_FOMC = TemporalProfile(
    anticipation_days=21, anticipation_curve="exponential", anticipation_vol_ramp=1.15,
    jump_probability=0.95, jump_mean=0.0, jump_std=1.2,
    decay_halflife_days=10, regime_shift=0.30, post_vol_decay=0.7,
)

TEMPORAL_EARNINGS = TemporalProfile(
    anticipation_days=5, anticipation_curve="step", anticipation_vol_ramp=1.60,
    jump_probability=0.99, jump_mean=0.0, jump_std=8.0,
    decay_halflife_days=3, regime_shift=0.60, post_vol_decay=0.2,
)

TEMPORAL_GEOPOLITICAL = TemporalProfile(
    anticipation_days=3, anticipation_curve="linear", anticipation_vol_ramp=1.10,
    jump_probability=0.80, jump_mean=0.0, jump_std=3.0,
    decay_halflife_days=30, regime_shift=0.10, post_vol_decay=0.6,
)

TEMPORAL_GEOPOLITICAL_SUDDEN = TemporalProfile(
    anticipation_days=0, anticipation_curve="step", anticipation_vol_ramp=1.0,
    jump_probability=0.85, jump_mean=0.0, jump_std=4.0,
    decay_halflife_days=30, regime_shift=0.10, post_vol_decay=0.6,
)

TEMPORAL_TARIFF = TemporalProfile(
    anticipation_days=7, anticipation_curve="linear", anticipation_vol_ramp=1.12,
    jump_probability=0.70, jump_mean=0.0, jump_std=2.0,
    decay_halflife_days=14, regime_shift=0.50, post_vol_decay=0.5,
)

TEMPORAL_OIL_DISRUPTION = TemporalProfile(
    anticipation_days=1, anticipation_curve="step", anticipation_vol_ramp=1.05,
    jump_probability=0.90, jump_mean=0.0, jump_std=5.0,
    decay_halflife_days=60, regime_shift=0.20, post_vol_decay=0.6,
)

TEMPORAL_REGULATORY = TemporalProfile(
    anticipation_days=14, anticipation_curve="linear", anticipation_vol_ramp=1.10,
    jump_probability=0.60, jump_mean=0.0, jump_std=3.0,
    decay_halflife_days=21, regime_shift=0.70, post_vol_decay=0.4,
)

TEMPORAL_RECESSION = TemporalProfile(
    anticipation_days=30, anticipation_curve="exponential", anticipation_vol_ramp=1.25,
    jump_probability=0.50, jump_mean=-2.0, jump_std=3.0,
    decay_halflife_days=90, regime_shift=0.60, post_vol_decay=0.8,
)

TEMPORAL_INFLATION = TemporalProfile(
    anticipation_days=7, anticipation_curve="linear", anticipation_vol_ramp=1.08,
    jump_probability=0.65, jump_mean=0.0, jump_std=1.5,
    decay_halflife_days=30, regime_shift=0.40, post_vol_decay=0.5,
)

TEMPORAL_SUPPLY_CHAIN = TemporalProfile(
    anticipation_days=3, anticipation_curve="linear", anticipation_vol_ramp=1.08,
    jump_probability=0.70, jump_mean=0.0, jump_std=2.5,
    decay_halflife_days=45, regime_shift=0.25, post_vol_decay=0.6,
)

TEMPORAL_PHARMA = TemporalProfile(
    anticipation_days=10, anticipation_curve="exponential", anticipation_vol_ramp=1.30,
    jump_probability=0.95, jump_mean=0.0, jump_std=6.0,
    decay_halflife_days=5, regime_shift=0.70, post_vol_decay=0.3,
)

TEMPORAL_CRE_CRISIS = TemporalProfile(
    anticipation_days=14, anticipation_curve="linear", anticipation_vol_ramp=1.15,
    jump_probability=0.50, jump_mean=-1.5, jump_std=3.0,
    decay_halflife_days=60, regime_shift=0.40, post_vol_decay=0.7,
)


@dataclass
class SectorImpact:
    """How an event affects a single sector."""
    drift: float          # daily drift adjustment (e.g. 0.002 = +0.2% per day)
    vol_multiplier: float  # volatility multiplier (1.0 = no change, 1.3 = +30%)


@dataclass
class Event:
    """A market event that can be layered onto Monte Carlo simulations."""
    key: str                           # unique slug: "iran_escalation"
    name: str                          # human-readable name
    category: str                      # "geopolitical" | "macro" | "sector" | "custom"
    description: str = ""
    polymarket_keywords: list[str] = field(default_factory=list)
    polymarket_slug: Optional[str] = None
    probability: float = 0.5           # 0-1, base probability (can be overridden by Polymarket)
    parameters: dict[str, EventParameter] = field(default_factory=dict)
    sector_impacts: dict[str, SectorImpact] = field(default_factory=dict)
    temporal_profile: Optional[TemporalProfile] = None   # v5: temporal shaping
    event_date: Optional[str] = None                     # v5: ISO date when event occurs

    # --- convenience --------------------------------------------------------

    def get_impact_for_sector(self, sector: str) -> Optional[SectorImpact]:
        """Return the SectorImpact for *sector* if defined, else None."""
        return self.sector_impacts.get(sector)

    def apply_severity(self, severity: float) -> "Event":
        """
        Return a *new* Event with drift and vol_multiplier scaled by
        severity / default_severity.  severity ∈ [1, 10], default = 5.
        """
        default_sev = self.parameters.get("severity", EventParameter(1, 10, 5, 1)).default
        scale = severity / default_sev

        new_impacts: dict[str, SectorImpact] = {}
        for sec, imp in self.sector_impacts.items():
            new_impacts[sec] = SectorImpact(
                drift=imp.drift * scale,
                vol_multiplier=1.0 + (imp.vol_multiplier - 1.0) * scale,
            )

        return Event(
            key=self.key,
            name=self.name,
            category=self.category,
            description=self.description,
            polymarket_keywords=self.polymarket_keywords,
            polymarket_slug=self.polymarket_slug,
            probability=self.probability,
            parameters=dict(self.parameters),
            sector_impacts=new_impacts,
            temporal_profile=self.temporal_profile,
            event_date=self.event_date,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialise for API responses."""
        d: Dict[str, Any] = {
            "key": self.key,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "polymarket_keywords": self.polymarket_keywords,
            "polymarket_slug": self.polymarket_slug,
            "probability": self.probability,
            "parameters": {
                k: {"min": v.min, "max": v.max, "default": v.default,
                    "step": v.step, "label": v.label, "description": v.description}
                for k, v in self.parameters.items()
            },
            "sector_impacts": {
                k: {"drift": v.drift, "vol_multiplier": v.vol_multiplier}
                for k, v in self.sector_impacts.items()
            },
        }
        if self.temporal_profile:
            tp = self.temporal_profile
            d["temporal_profile"] = {
                "anticipation_days": tp.anticipation_days,
                "anticipation_curve": tp.anticipation_curve,
                "anticipation_vol_ramp": tp.anticipation_vol_ramp,
                "jump_probability": tp.jump_probability,
                "jump_mean": tp.jump_mean,
                "jump_std": tp.jump_std,
                "decay_halflife_days": tp.decay_halflife_days,
                "regime_shift": tp.regime_shift,
                "post_vol_decay": tp.post_vol_decay,
            }
        if self.event_date:
            d["event_date"] = self.event_date
        return d


# ---------------------------------------------------------------------------
# Pre-built event library
# ---------------------------------------------------------------------------

def _p(min_v, max_v, default, step, label="", description=""):
    return EventParameter(min=min_v, max=max_v, default=default, step=step,
                          label=label, description=description)


EVENTS: Dict[str, Event] = {
    # ---- Geopolitical -----------------------------------------------------
    "iran_escalation": Event(
        key="iran_escalation",
        name="Iran-Israel Conflict Escalation",
        category="geopolitical",
        description="Military escalation between Iran and Israel, disrupting oil supplies and regional stability.",
        polymarket_keywords=["iran", "israel", "middle east war", "iran strike"],
        polymarket_slug="iran-israel-escalation",
        probability=0.35,
        parameters={
            "duration_days": _p(1, 180, 30, 1, "Duration (days)", "Expected conflict duration"),
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Conflict intensity scale"),
        },
        sector_impacts={
            "energy": SectorImpact(drift=0.0025, vol_multiplier=1.35),
            "defense": SectorImpact(drift=0.0018, vol_multiplier=1.25),
            "technology": SectorImpact(drift=-0.0012, vol_multiplier=1.15),
            "consumer": SectorImpact(drift=-0.0006, vol_multiplier=1.08),
            "financials": SectorImpact(drift=-0.0003, vol_multiplier=1.10),
            "transportation": SectorImpact(drift=-0.0010, vol_multiplier=1.12),
            "healthcare": SectorImpact(drift=-0.0002, vol_multiplier=1.05),
        },
        temporal_profile=TEMPORAL_GEOPOLITICAL,
    ),
    "china_taiwan": Event(
        key="china_taiwan",
        name="China-Taiwan Tensions",
        category="geopolitical",
        description="Escalating tensions or military action related to Taiwan, disrupting semiconductor supply chains.",
        polymarket_keywords=["taiwan", "china taiwan", "taiwan strait", "taiwan conflict"],
        polymarket_slug="china-taiwan-tensions",
        probability=0.20,
        parameters={
            "duration_days": _p(1, 365, 90, 1, "Duration (days)", "Expected disruption duration"),
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Conflict intensity scale"),
            "supply_chain_pct": _p(5, 100, 40, 5, "Supply chain cut (%)", "Percentage of supply chain disrupted"),
        },
        sector_impacts={
            "technology": SectorImpact(drift=-0.0030, vol_multiplier=1.40),
            "semiconductors": SectorImpact(drift=-0.0050, vol_multiplier=1.60),
            "defense": SectorImpact(drift=0.0020, vol_multiplier=1.30),
            "consumer": SectorImpact(drift=-0.0015, vol_multiplier=1.20),
            "automotive": SectorImpact(drift=-0.0020, vol_multiplier=1.25),
            "industrial": SectorImpact(drift=-0.0010, vol_multiplier=1.15),
        },
        temporal_profile=TEMPORAL_GEOPOLITICAL_SUDDEN,
    ),
    "ukraine_russia": Event(
        key="ukraine_russia",
        name="Ukraine-Russia Conflict Shift",
        category="geopolitical",
        description="Significant escalation or de-escalation in the Ukraine-Russia conflict.",
        polymarket_keywords=["ukraine", "russia", "russia ukraine war"],
        polymarket_slug="ukraine-russia-conflict",
        probability=0.50,
        parameters={
            "duration_days": _p(1, 365, 60, 1, "Duration (days)", "Expected impact duration"),
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Conflict intensity scale"),
            "direction": _p(-1, 1, 0, 0.1, "Direction", "Escalation (+1) to De-escalation (-1)"),
        },
        sector_impacts={
            "energy": SectorImpact(drift=0.0015, vol_multiplier=1.25),
            "defense": SectorImpact(drift=0.0015, vol_multiplier=1.20),
            "agriculture": SectorImpact(drift=-0.0010, vol_multiplier=1.15),
            "financials": SectorImpact(drift=-0.0005, vol_multiplier=1.10),
            "metals": SectorImpact(drift=0.0010, vol_multiplier=1.20),
        },
        temporal_profile=TEMPORAL_GEOPOLITICAL,
    ),
    "north_korea": Event(
        key="north_korea",
        name="North Korea Escalation",
        category="geopolitical",
        description="North Korean military provocation or nuclear test.",
        polymarket_keywords=["north korea", "nuclear test", "kim jong"],
        polymarket_slug="north-korea-escalation",
        probability=0.15,
        parameters={
            "duration_days": _p(1, 90, 14, 1, "Duration (days)", "Expected tension duration"),
            "severity": _p(1, 10, 4, 1, "Severity (1-10)", "Provocation intensity"),
        },
        sector_impacts={
            "defense": SectorImpact(drift=0.0025, vol_multiplier=1.30),
            "technology": SectorImpact(drift=-0.0008, vol_multiplier=1.10),
            "consumer": SectorImpact(drift=-0.0005, vol_multiplier=1.08),
        },
        temporal_profile=TEMPORAL_GEOPOLITICAL_SUDDEN,
    ),

    # ---- Macro Economic ---------------------------------------------------
    "fed_rate_cut": Event(
        key="fed_rate_cut",
        name="Federal Reserve Rate Cut",
        category="macro",
        description="Fed cuts interest rates, easing financial conditions.",
        polymarket_keywords=["fed rate", "federal reserve", "rate cut", "interest rate"],
        polymarket_slug="fed-rate-cut",
        probability=0.70,
        parameters={
            "basis_points": _p(25, 100, 50, 25, "Basis Points", "Size of rate cut"),
            "duration_days": _p(30, 365, 180, 1, "Effect Duration (days)", "How long the effect persists"),
        },
        sector_impacts={
            "technology": SectorImpact(drift=0.0015, vol_multiplier=0.95),
            "financials": SectorImpact(drift=-0.0008, vol_multiplier=1.05),
            "real_estate": SectorImpact(drift=0.0010, vol_multiplier=0.95),
            "consumer": SectorImpact(drift=0.0005, vol_multiplier=0.97),
            "utilities": SectorImpact(drift=0.0003, vol_multiplier=0.95),
            "growth": SectorImpact(drift=0.0012, vol_multiplier=0.96),
        },
        temporal_profile=TEMPORAL_FOMC,
    ),
    "fed_rate_hike": Event(
        key="fed_rate_hike",
        name="Federal Reserve Rate Hike",
        category="macro",
        description="Fed raises interest rates, tightening financial conditions.",
        polymarket_keywords=["fed hike", "rate hike", "rate increase"],
        polymarket_slug="fed-rate-hike",
        probability=0.20,
        parameters={
            "basis_points": _p(25, 100, 50, 25, "Basis Points", "Size of rate hike"),
            "duration_days": _p(30, 365, 180, 1, "Effect Duration (days)", "How long the effect persists"),
        },
        sector_impacts={
            "technology": SectorImpact(drift=-0.0015, vol_multiplier=1.08),
            "financials": SectorImpact(drift=0.0006, vol_multiplier=1.03),
            "real_estate": SectorImpact(drift=-0.0012, vol_multiplier=1.10),
            "consumer": SectorImpact(drift=-0.0005, vol_multiplier=1.05),
            "utilities": SectorImpact(drift=-0.0004, vol_multiplier=1.05),
            "growth": SectorImpact(drift=-0.0012, vol_multiplier=1.08),
        },
        temporal_profile=TEMPORAL_FOMC,
    ),
    "recession": Event(
        key="recession",
        name="US Recession",
        category="macro",
        description="Economic contraction with rising unemployment and falling GDP.",
        polymarket_keywords=["recession", "economic downturn", "gdp contraction"],
        polymarket_slug="us-recession",
        probability=0.30,
        parameters={
            "duration_days": _p(90, 730, 365, 30, "Duration (days)", "Expected recession length"),
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Recession depth"),
        },
        sector_impacts={
            "technology": SectorImpact(drift=-0.0020, vol_multiplier=1.35),
            "consumer": SectorImpact(drift=-0.0018, vol_multiplier=1.25),
            "financials": SectorImpact(drift=-0.0015, vol_multiplier=1.30),
            "industrial": SectorImpact(drift=-0.0015, vol_multiplier=1.25),
            "energy": SectorImpact(drift=-0.0012, vol_multiplier=1.20),
            "utilities": SectorImpact(drift=-0.0003, vol_multiplier=1.05),
            "healthcare": SectorImpact(drift=-0.0002, vol_multiplier=1.05),
            "real_estate": SectorImpact(drift=-0.0020, vol_multiplier=1.30),
        },
        temporal_profile=TEMPORAL_RECESSION,
    ),
    "inflation_spike": Event(
        key="inflation_spike",
        name="Inflation Spike",
        category="macro",
        description="Unexpected surge in inflation, pressuring the Fed to tighten.",
        polymarket_keywords=["inflation", "cpi spike", "inflation surge"],
        polymarket_slug="inflation-spike",
        probability=0.25,
        parameters={
            "cpi_increase_pct": _p(0.1, 2.0, 0.5, 0.1, "CPI Increase (%)", "Monthly CPI jump"),
            "duration_days": _p(30, 365, 120, 1, "Duration (days)", "How long elevated inflation persists"),
        },
        sector_impacts={
            "energy": SectorImpact(drift=0.0008, vol_multiplier=1.15),
            "consumer": SectorImpact(drift=-0.0010, vol_multiplier=1.12),
            "financials": SectorImpact(drift=0.0003, vol_multiplier=1.08),
            "technology": SectorImpact(drift=-0.0008, vol_multiplier=1.10),
            "real_estate": SectorImpact(drift=-0.0006, vol_multiplier=1.12),
        },
        temporal_profile=TEMPORAL_INFLATION,
    ),

    # ---- Trade / Tariffs --------------------------------------------------
    "tariff_increase": Event(
        key="tariff_increase",
        name="Broad Tariff Increase",
        category="macro",
        description="Significant increase in trade tariffs, particularly US-China.",
        polymarket_keywords=["tariff", "trade war", "trade tariffs"],
        polymarket_slug="tariff-increase",
        probability=0.55,
        parameters={
            "tariff_pct": _p(5, 60, 25, 5, "Tariff Rate (%)", "New tariff percentage"),
            "scope": _p(1, 10, 6, 1, "Scope (1-10)", "How broad the tariffs are (1=specific goods, 10=all imports)"),
            "retaliation": _p(1, 10, 5, 1, "Retaliation (1-10)", "Expected retaliatory intensity"),
        },
        sector_impacts={
            "technology": SectorImpact(drift=-0.0020, vol_multiplier=1.30),
            "consumer": SectorImpact(drift=-0.0015, vol_multiplier=1.20),
            "automotive": SectorImpact(drift=-0.0018, vol_multiplier=1.25),
            "industrial": SectorImpact(drift=-0.0012, vol_multiplier=1.18),
            "agriculture": SectorImpact(drift=-0.0010, vol_multiplier=1.15),
            "semiconductors": SectorImpact(drift=-0.0025, vol_multiplier=1.35),
            "retail": SectorImpact(drift=-0.0012, vol_multiplier=1.15),
        },
        temporal_profile=TEMPORAL_TARIFF,
    ),

    # ---- Commodity / Supply Chain ------------------------------------------
    "oil_disruption": Event(
        key="oil_disruption",
        name="Major Oil Supply Disruption",
        category="sector",
        description="Significant disruption to global oil supply (OPEC, war, infrastructure).",
        polymarket_keywords=["oil", "crude oil", "opec", "oil supply"],
        polymarket_slug="oil-supply-disruption",
        probability=0.25,
        parameters={
            "supply_cut_pct": _p(1, 30, 10, 1, "Supply Cut (%)", "Percentage of global supply disrupted"),
            "duration_days": _p(7, 365, 60, 1, "Duration (days)", "Expected disruption length"),
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Disruption intensity"),
        },
        sector_impacts={
            "energy": SectorImpact(drift=0.0040, vol_multiplier=1.45),
            "transportation": SectorImpact(drift=-0.0015, vol_multiplier=1.20),
            "chemicals": SectorImpact(drift=-0.0010, vol_multiplier=1.15),
            "consumer": SectorImpact(drift=-0.0008, vol_multiplier=1.12),
            "industrial": SectorImpact(drift=-0.0006, vol_multiplier=1.10),
            "airlines": SectorImpact(drift=-0.0020, vol_multiplier=1.25),
        },
        temporal_profile=TEMPORAL_OIL_DISRUPTION,
    ),
    "chip_export_control": Event(
        key="chip_export_control",
        name="Semiconductor Export Controls",
        category="sector",
        description="New US restrictions on semiconductor exports, especially to China.",
        polymarket_keywords=["chip ban", "semiconductor export", "chip control", "nvidia export"],
        polymarket_slug="chip-export-controls",
        probability=0.60,
        parameters={
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Restriction tightness"),
            "scope": _p(1, 10, 6, 1, "Scope (1-10)", "How broad the restrictions are"),
            "duration_days": _p(90, 1825, 365, 30, "Duration (days)", "Expected policy duration"),
        },
        sector_impacts={
            "semiconductors": SectorImpact(drift=-0.0035, vol_multiplier=1.50),
            "technology": SectorImpact(drift=-0.0018, vol_multiplier=1.25),
            "industrial": SectorImpact(drift=-0.0008, vol_multiplier=1.12),
            "defense": SectorImpact(drift=0.0005, vol_multiplier=1.05),
        },
        temporal_profile=TEMPORAL_REGULATORY,
    ),
    "ev_subsidy": Event(
        key="ev_subsidy",
        name="EV Subsidy Change",
        category="sector",
        description="Changes to electric vehicle subsidies or incentives.",
        polymarket_keywords=["ev subsidy", "electric vehicle", "ev tax credit"],
        polymarket_slug="ev-subsidy-change",
        probability=0.40,
        parameters={
            "direction": _p(-1, 1, -0.5, 0.1, "Direction", "Subsidy increase (+1) to cut (-1)"),
            "magnitude_pct": _p(5, 100, 30, 5, "Magnitude (%)", "Size of subsidy change"),
        },
        sector_impacts={
            "automotive": SectorImpact(drift=-0.0015, vol_multiplier=1.15),
            "energy": SectorImpact(drift=-0.0005, vol_multiplier=1.08),
            "technology": SectorImpact(drift=-0.0003, vol_multiplier=1.05),
        },
        temporal_profile=TEMPORAL_REGULATORY,
    ),
    "ai_regulation": Event(
        key="ai_regulation",
        name="AI Regulation Tightening",
        category="sector",
        description="New government regulation on AI development or deployment.",
        polymarket_keywords=["ai regulation", "ai act", "artificial intelligence regulation"],
        polymarket_slug="ai-regulation",
        probability=0.35,
        parameters={
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Regulation strictness"),
            "scope": _p(1, 10, 5, 1, "Scope (1-10)", "Geographic breadth of regulation"),
        },
        sector_impacts={
            "technology": SectorImpact(drift=-0.0015, vol_multiplier=1.20),
            "semiconductors": SectorImpact(drift=-0.0010, vol_multiplier=1.15),
        },
        temporal_profile=TEMPORAL_REGULATORY,
    ),
    "defense_spending": Event(
        key="defense_spending",
        name="Defense Spending Increase",
        category="sector",
        description="Major increase in defense budget due to geopolitical tensions.",
        polymarket_keywords=["defense spending", "military budget", "defense budget"],
        polymarket_slug="defense-spending-increase",
        probability=0.45,
        parameters={
            "increase_pct": _p(5, 50, 20, 5, "Budget Increase (%)", "Defense budget growth"),
            "duration_days": _p(180, 3650, 1095, 30, "Duration (days)", "Expected sustained increase"),
        },
        sector_impacts={
            "defense": SectorImpact(drift=0.0020, vol_multiplier=1.10),
            "aerospace": SectorImpact(drift=0.0015, vol_multiplier=1.12),
            "technology": SectorImpact(drift=0.0003, vol_multiplier=1.02),
        },
        temporal_profile=TEMPORAL_REGULATORY,
    ),
    "crypto_regulation": Event(
        key="crypto_regulation",
        name="Cryptocurrency Regulation",
        category="sector",
        description="Significant regulatory action on cryptocurrency markets.",
        polymarket_keywords=["crypto regulation", "sec crypto", "bitcoin regulation"],
        polymarket_slug="crypto-regulation",
        probability=0.50,
        parameters={
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Regulation strictness"),
            "direction": _p(-1, 1, 0, 0.1, "Direction", "Favorable (+1) to Restrictive (-1)"),
        },
        sector_impacts={
            "financials": SectorImpact(drift=0.0002, vol_multiplier=1.05),
            "technology": SectorImpact(drift=-0.0003, vol_multiplier=1.05),
        },
        temporal_profile=TEMPORAL_REGULATORY,
    ),
    "pharma_breakthrough": Event(
        key="pharma_breakthrough",
        name="Major Pharma Breakthrough",
        category="sector",
        description="Significant pharmaceutical or biotech breakthrough.",
        polymarket_keywords=["pharma", "drug approval", "fda approval", "biotech"],
        polymarket_slug="pharma-breakthrough",
        probability=0.20,
        parameters={
            "impact_scale": _p(1, 10, 5, 1, "Impact Scale (1-10)", "Market significance"),
        },
        sector_impacts={
            "healthcare": SectorImpact(drift=0.0020, vol_multiplier=1.25),
            "biotech": SectorImpact(drift=0.0030, vol_multiplier=1.40),
            "technology": SectorImpact(drift=0.0002, vol_multiplier=1.02),
        },
        temporal_profile=TEMPORAL_PHARMA,
    ),
    "supply_chain_crisis": Event(
        key="supply_chain_crisis",
        name="Global Supply Chain Crisis",
        category="sector",
        description="Major disruption to global supply chains (port closures, shipping crisis).",
        polymarket_keywords=["supply chain", "port closure", "shipping crisis", "logistics"],
        polymarket_slug="supply-chain-crisis",
        probability=0.20,
        parameters={
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Disruption intensity"),
            "duration_days": _p(14, 365, 90, 1, "Duration (days)", "Expected crisis length"),
        },
        sector_impacts={
            "retail": SectorImpact(drift=-0.0015, vol_multiplier=1.20),
            "automotive": SectorImpact(drift=-0.0020, vol_multiplier=1.25),
            "technology": SectorImpact(drift=-0.0010, vol_multiplier=1.18),
            "industrial": SectorImpact(drift=-0.0008, vol_multiplier=1.12),
            "consumer": SectorImpact(drift=-0.0008, vol_multiplier=1.10),
        },
        temporal_profile=TEMPORAL_SUPPLY_CHAIN,
    ),
    "commercial_real_estate_crisis": Event(
        key="commercial_real_estate_crisis",
        name="Commercial Real Estate Crisis",
        category="sector",
        description="Major downturn in commercial real estate valuations.",
        polymarket_keywords=["commercial real estate", "office crisis", "cre crisis", "office vacancy"],
        polymarket_slug="commercial-real-estate-crisis",
        probability=0.40,
        parameters={
            "severity": _p(1, 10, 5, 1, "Severity (1-10)", "Crisis depth"),
            "duration_days": _p(90, 1825, 730, 30, "Duration (days)", "Expected crisis length"),
        },
        sector_impacts={
            "financials": SectorImpact(drift=-0.0015, vol_multiplier=1.25),
            "real_estate": SectorImpact(drift=-0.0030, vol_multiplier=1.45),
            "industrial": SectorImpact(drift=-0.0005, vol_multiplier=1.08),
        },
        temporal_profile=TEMPORAL_CRE_CRISIS,
    ),
}


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_event(key: str) -> Optional[Event]:
    """Look up an event by key. Returns None if not found."""
    return EVENTS.get(key)


def get_events_by_category(category: str) -> List[Event]:
    """Return all events in a category."""
    return [e for e in EVENTS.values() if e.category == category]


def list_categories() -> List[str]:
    """Return sorted unique categories."""
    return sorted({e.category for e in EVENTS.values()})


def list_all_events() -> List[Event]:
    """Return all events."""
    return list(EVENTS.values())
