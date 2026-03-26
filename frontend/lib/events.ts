// Event definitions matching the backend schema
export interface EventTemplate {
  id: string;
  name: string;
  category: "geopolitical" | "macro" | "sector" | "custom";
  emoji: string;
  polymarketOdds: number; // 0-100
  defaultImpact: number; // percentage impact on stock (30-day estimate from primary sector drift)
  defaultDuration: number; // days
  direction: "bullish" | "bearish" | "mixed";
  description: string;
}

export interface ActiveEvent extends EventTemplate {
  probability: number; // user-adjusted, 0-100
  duration: number; // user-adjusted, 1-365
  impact: number; // user-adjusted, -30 to +30
}

export interface StockData {
  ticker: string;
  name: string;
  currentPrice: number;
  historicalPrices: { date: string; price: number }[];
  sector: string;
}

export interface SimulationResult {
  ticker: string;
  currentPrice: number;
  median30d: number;
  probProfit: number;
  maxDrawdown5p: number;
  eventImpact: number;
  paths: {
    dates: string[];
    median: number[];
    p25: number[];
    p75: number[];
    p5: number[];
    p95: number[];
  };
  breakdown: {
    eventName: string;
    impact: number;
    color: string;
  }[];
}

// All 18 backend events with IDs matching backend exactly.
// defaultImpact is a 30-day % estimate derived from the primary sector's daily drift × 21 trading days.
// For events where the primary sector is negative, the impact is negative (bearish).
export const EVENT_TEMPLATES: EventTemplate[] = [
  // ---- Geopolitical ----
  {
    id: "iran_escalation",
    name: "Iran-Israel Conflict Escalation",
    category: "geopolitical",
    emoji: "🔴",
    polymarketOdds: 35,
    defaultImpact: 7.5,    // energy drift 0.0025 × 30 = +7.5%
    defaultDuration: 30,
    direction: "bullish",
    description: "Military escalation between Iran and Israel, disrupting oil supplies and regional stability.",
  },
  {
    id: "china_taiwan",
    name: "China-Taiwan Tensions",
    category: "geopolitical",
    emoji: "🔵",
    polymarketOdds: 20,
    defaultImpact: -9.0,   // tech drift -0.003 × 30 = -9%
    defaultDuration: 90,
    direction: "bearish",
    description: "Escalating tensions or military action related to Taiwan, disrupting semiconductor supply chains.",
  },
  {
    id: "ukraine_russia",
    name: "Ukraine-Russia Conflict Shift",
    category: "geopolitical",
    emoji: "🟡",
    polymarketOdds: 50,
    defaultImpact: 4.5,    // energy drift 0.0015 × 30 = +4.5%
    defaultDuration: 60,
    direction: "mixed",
    description: "Significant escalation or de-escalation in the Ukraine-Russia conflict.",
  },
  {
    id: "north_korea",
    name: "North Korea Escalation",
    category: "geopolitical",
    emoji: "💣",
    polymarketOdds: 15,
    defaultImpact: 7.5,    // defense drift 0.0025 × 30 = +7.5%
    defaultDuration: 14,
    direction: "mixed",
    description: "North Korean military provocation or nuclear test.",
  },

  // ---- Macro Economic ----
  {
    id: "fed_rate_cut",
    name: "Federal Reserve Rate Cut",
    category: "macro",
    emoji: "📉",
    polymarketOdds: 70,
    defaultImpact: 4.5,    // tech drift 0.0015 × 30 = +4.5%
    defaultDuration: 180,
    direction: "bullish",
    description: "Fed cuts interest rates, easing financial conditions.",
  },
  {
    id: "fed_rate_hike",
    name: "Federal Reserve Rate Hike",
    category: "macro",
    emoji: "📈",
    polymarketOdds: 20,
    defaultImpact: -4.5,   // tech drift -0.0015 × 30 = -4.5%
    defaultDuration: 180,
    direction: "bearish",
    description: "Fed raises interest rates, tightening financial conditions.",
  },
  {
    id: "recession",
    name: "US Recession",
    category: "macro",
    emoji: "🦇",
    polymarketOdds: 30,
    defaultImpact: -6.0,   // tech/real_estate drift -0.002 × 30 = -6%
    defaultDuration: 365,
    direction: "bearish",
    description: "Economic contraction with rising unemployment and falling GDP.",
  },
  {
    id: "inflation_spike",
    name: "Inflation Spike",
    category: "macro",
    emoji: "🔥",
    polymarketOdds: 25,
    defaultImpact: -3.0,   // consumer drift -0.001 × 30 = -3%
    defaultDuration: 120,
    direction: "mixed",
    description: "Unexpected surge in inflation, pressuring the Fed to tighten.",
  },
  {
    id: "tariff_increase",
    name: "Broad Tariff Increase",
    category: "macro",
    emoji: "⚪",
    polymarketOdds: 55,
    defaultImpact: -7.5,   // semiconductor drift -0.0025 × 30 = -7.5%
    defaultDuration: 90,
    direction: "bearish",
    description: "Significant increase in trade tariffs, particularly US-China.",
  },

  // ---- Sector / Commodity ----
  {
    id: "oil_disruption",
    name: "Major Oil Supply Disruption",
    category: "sector",
    emoji: "🟠",
    polymarketOdds: 25,
    defaultImpact: 12.0,   // energy drift 0.004 × 30 = +12%
    defaultDuration: 60,
    direction: "bullish",
    description: "Significant disruption to global oil supply (OPEC, war, infrastructure).",
  },
  {
    id: "chip_export_control",
    name: "Semiconductor Export Controls",
    category: "sector",
    emoji: "🟣",
    polymarketOdds: 60,
    defaultImpact: -10.5,  // semiconductor drift -0.0035 × 30 = -10.5%
    defaultDuration: 365,
    direction: "bearish",
    description: "New US restrictions on semiconductor exports, especially to China.",
  },
  {
    id: "ev_subsidy",
    name: "EV Subsidy Change",
    category: "sector",
    emoji: "🟢",
    polymarketOdds: 40,
    defaultImpact: -4.5,   // automotive drift -0.0015 × 30 = -4.5%
    defaultDuration: 30,
    direction: "bearish",
    description: "Changes to electric vehicle subsidies or incentives.",
  },
  {
    id: "ai_regulation",
    name: "AI Regulation Tightening",
    category: "sector",
    emoji: "🤖",
    polymarketOdds: 35,
    defaultImpact: -4.5,   // tech drift -0.0015 × 30 = -4.5%
    defaultDuration: 30,
    direction: "bearish",
    description: "New government regulation on AI development or deployment.",
  },
  {
    id: "defense_spending",
    name: "Defense Spending Increase",
    category: "sector",
    emoji: "🛡️",
    polymarketOdds: 45,
    defaultImpact: 6.0,    // defense drift 0.002 × 30 = +6%
    defaultDuration: 1095,
    direction: "bullish",
    description: "Major increase in defense budget due to geopolitical tensions.",
  },
  {
    id: "crypto_regulation",
    name: "Cryptocurrency Regulation",
    category: "sector",
    emoji: "₿",
    polymarketOdds: 50,
    defaultImpact: -1.0,   // tech drift -0.0003 × 30 = -0.9%
    defaultDuration: 30,
    direction: "mixed",
    description: "Significant regulatory action on cryptocurrency markets.",
  },
  {
    id: "pharma_breakthrough",
    name: "Major Pharma Breakthrough",
    category: "sector",
    emoji: "💊",
    polymarketOdds: 20,
    defaultImpact: 6.0,    // healthcare drift 0.002 × 30 = +6%
    defaultDuration: 30,
    direction: "bullish",
    description: "Significant pharmaceutical or biotech breakthrough.",
  },
  {
    id: "supply_chain_crisis",
    name: "Global Supply Chain Crisis",
    category: "sector",
    emoji: "📦",
    polymarketOdds: 20,
    defaultImpact: -6.0,   // automotive drift -0.002 × 30 = -6%
    defaultDuration: 90,
    direction: "bearish",
    description: "Major disruption to global supply chains (port closures, shipping crisis).",
  },
  {
    id: "commercial_real_estate_crisis",
    name: "Commercial Real Estate Crisis",
    category: "sector",
    emoji: "🏢",
    polymarketOdds: 40,
    defaultImpact: -9.0,   // real_estate drift -0.003 × 30 = -9%
    defaultDuration: 730,
    direction: "bearish",
    description: "Major downturn in commercial real estate valuations.",
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  geopolitical: "🌍 Geopolitical",
  macro: "📊 Macro",
  sector: "🏭 Sector",
  custom: "✏️ Custom",
};

/**
 * Create a custom ActiveEvent from a Polymarket search result.
 * This lets users add ANY Polymarket market as a simulation event.
 */
export function createCustomEventFromPolymarket(market: {
  question: string;
  slug: string;
  odds: number;
  volume_24h: number;
}): ActiveEvent {
  // Generate a unique ID from the slug
  const id = `pm_${market.slug.replace(/-/g, "_").slice(0, 60)}`;
  
  // Detect direction from question text
  const q = market.question.toLowerCase();
  const bearishWords = ["crash", "decline", "fall", "decrease", "drop", "recession", "ban", "restrict", "tariff", "war", "conflict", "invade", "sanctions"];
  const bullishWords = ["rise", "increase", "grow", "rally", "breakthrough", "deal", "peace", "ceasefire", "cut rate", "stimulus"];
  
  let direction: "bullish" | "bearish" | "mixed" = "mixed";
  let defaultImpact = 5;
  
  if (bearishWords.some(w => q.includes(w))) {
    direction = "bearish";
    defaultImpact = -5;
  } else if (bullishWords.some(w => q.includes(w))) {
    direction = "bullish";
    defaultImpact = 5;
  }

  // Detect category from question
  let category: "geopolitical" | "macro" | "sector" | "custom" = "custom";
  const geoWords = ["war", "invade", "conflict", "military", "ceasefire", "sanctions", "nato", "nuclear"];
  const macroWords = ["fed", "rate", "inflation", "recession", "gdp", "unemployment", "tariff", "interest"];
  const sectorWords = ["bitcoin", "oil", "crude", "gold", "stock", "s&p", "nasdaq", "semiconductor", "ev ", "ai "];
  
  if (geoWords.some(w => q.includes(w))) category = "geopolitical";
  else if (macroWords.some(w => q.includes(w))) category = "macro";
  else if (sectorWords.some(w => q.includes(w))) category = "sector";

  return {
    id,
    name: market.question.length > 60 ? market.question.slice(0, 57) + "..." : market.question,
    category,
    emoji: category === "geopolitical" ? "🌍" : category === "macro" ? "📊" : category === "sector" ? "📈" : "🔮",
    polymarketOdds: Math.round(market.odds * 100),
    defaultImpact,
    defaultDuration: 30,
    direction,
    description: `Live from Polymarket · $${(market.volume_24h / 1e6).toFixed(1)}M 24h volume`,
    probability: Math.round(market.odds * 100),
    duration: 30,
    impact: defaultImpact,
  };
}
