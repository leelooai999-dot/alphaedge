// Event definitions matching the backend schema
export interface EventTemplate {
  id: string;
  name: string;
  category: "geopolitical" | "macro" | "sector" | "custom";
  emoji: string;
  polymarketOdds: number; // 0-100
  defaultImpact: number; // percentage impact on stock
  defaultDuration: number; // days
  direction: "bullish" | "bearish";
  description: string;
}

export interface ActiveEvent extends EventTemplate {
  probability: number; // user-adjusted, 0-100
  duration: number; // user-adjusted, 1-180
  impact: number; // user-adjusted
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

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "iran-escalation",
    name: "Iran-Israel Escalation",
    category: "geopolitical",
    emoji: "🔴",
    polymarketOdds: 67,
    defaultImpact: 9.3,
    defaultDuration: 30,
    direction: "bullish",
    description: "Increased geopolitical tension in the Middle East driving oil prices higher",
  },
  {
    id: "fed-rate-decision",
    name: "Fed Rate Decision (June)",
    category: "macro",
    emoji: "🟡",
    polymarketOdds: 82,
    defaultImpact: 3.8,
    defaultDuration: 45,
    direction: "bullish",
    description: "Expected rate cut boosting equity valuations across sectors",
  },
  {
    id: "china-taiwan",
    name: "China-Taiwan Tension",
    category: "geopolitical",
    emoji: "🔵",
    polymarketOdds: 23,
    defaultImpact: -8.7,
    defaultDuration: 60,
    direction: "bearish",
    description: "Escalating cross-strait tensions impacting tech supply chains",
  },
  {
    id: "oil-disruption",
    name: "Oil Supply Disruption",
    category: "sector",
    emoji: "🟠",
    polymarketOdds: 45,
    defaultImpact: 12.1,
    defaultDuration: 21,
    direction: "bullish",
    description: "OPEC+ production cuts or shipping route disruptions",
  },
  {
    id: "trump-tariffs",
    name: "Trump Tariff Changes",
    category: "macro",
    emoji: "⚪",
    polymarketOdds: 71,
    defaultImpact: -5.2,
    defaultDuration: 90,
    direction: "bearish",
    description: "New tariff policies affecting international trade",
  },
  {
    id: "chip-controls",
    name: "Chip Export Controls",
    category: "sector",
    emoji: "🟣",
    polymarketOdds: 58,
    defaultImpact: -12.4,
    defaultDuration: 60,
    direction: "bearish",
    description: "Expanded semiconductor export restrictions",
  },
  {
    id: "ev-subsidy",
    name: "EV Subsidy Change",
    category: "sector",
    emoji: "🟢",
    polymarketOdds: 39,
    defaultImpact: -9.3,
    defaultDuration: 30,
    direction: "bearish",
    description: "Potential reduction or elimination of electric vehicle tax credits",
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  geopolitical: "🌍 Geopolitical",
  macro: "📊 Macro",
  sector: "🏭 Sector",
  custom: "✏️ Custom",
};
