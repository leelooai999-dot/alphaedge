// Mock data for standalone frontend development

import { StockData, SimulationResult, ActiveEvent } from "./events";

// Generate realistic historical price data
function generateHistorical(basePrice: number, days: number, volatility: number) {
  const prices: { date: string; price: number }[] = [];
  let price = basePrice * (1 - volatility * 0.3);
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const change = (Math.random() - 0.48) * volatility * price * 0.01;
    price = Math.max(price + change, basePrice * 0.7);
    // Trend toward current price
    const trendPull = (basePrice - price) * 0.02;
    price += trendPull;
    prices.push({ date: d.toISOString().split("T")[0], price: Math.round(price * 100) / 100 });
  }
  return prices;
}

export const MOCK_STOCKS: Record<string, StockData> = {
  AAPL: {
    ticker: "AAPL",
    name: "Apple Inc.",
    currentPrice: 195.0,
    historicalPrices: generateHistorical(195.0, 90, 1.5),
    sector: "Technology",
  },
  NVDA: {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    currentPrice: 108.5,
    historicalPrices: generateHistorical(108.5, 90, 2.5),
    sector: "Technology",
  },
  CVX: {
    ticker: "CVX",
    name: "Chevron Corporation",
    currentPrice: 148.23,
    historicalPrices: generateHistorical(148.23, 90, 1.2),
    sector: "Energy",
  },
  SPY: {
    ticker: "SPY",
    name: "SPDR S&P 500 ETF",
    currentPrice: 520.0,
    historicalPrices: generateHistorical(520.0, 90, 0.8),
    sector: "ETF",
  },
  TSLA: {
    ticker: "TSLA",
    name: "Tesla, Inc.",
    currentPrice: 248.0,
    historicalPrices: generateHistorical(248.0, 90, 2.8),
    sector: "Automotive",
  },
};

// Seeded random for deterministic mock simulations
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function mockSimulate(
  ticker: string,
  events: ActiveEvent[]
): SimulationResult {
  const stock = MOCK_STOCKS[ticker] || {
    ticker,
    name: ticker,
    currentPrice: 150,
    historicalPrices: generateHistorical(150, 90, 1.5),
    sector: "Unknown",
  };

  const rng = seededRandom(
    ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0) +
      events.length * 137
  );

  // Calculate combined impact
  let totalImpactPct = 0;
  const breakdown = events.map((e) => {
    const impactDollar = (e.impact / 100) * stock.currentPrice * (e.probability / 100);
    const sign = impactDollar >= 0 ? 1 : -1;
    return {
      eventName: e.emoji + " " + e.name,
      impact: Math.round(Math.abs(impactDollar) * 100) / 100 * sign,
      color: impactDollar >= 0 ? "#00d4aa" : "#ff4757",
    };
  });

  const totalImpactDollar = breakdown.reduce((s, b) => s + b.impact, 0);
  totalImpactPct = (totalImpactDollar / stock.currentPrice) * 100;

  // Generate Monte Carlo paths
  const days = 30;
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i <= days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }

  const baseVol = 0.02; // daily vol
  const median: number[] = [stock.currentPrice];
  const p25: number[] = [stock.currentPrice];
  const p75: number[] = [stock.currentPrice];
  const p5: number[] = [stock.currentPrice];
  const p95: number[] = [stock.currentPrice];

  const drift = (totalImpactPct / 100) / days;

  for (let d = 1; d <= days; d++) {
    const t = d / days;
    const pathDrift = drift * d;
    const spread = baseVol * Math.sqrt(d) * (1 + Math.abs(totalImpactPct / 50));

    const med = stock.currentPrice * (1 + pathDrift);
    median.push(Math.round(med * 100) / 100);
    p25.push(Math.round(med * (1 - spread * 0.4) * 100) / 100);
    p75.push(Math.round(med * (1 + spread * 0.4) * 100) / 100);
    p5.push(Math.round(med * (1 - spread * 0.9) * 100) / 100);
    p95.push(Math.round(med * (1 + spread * 0.9) * 100) / 100);
  }

  const median30d = median[days];
  const probProfit = totalImpactDollar > 0
    ? Math.min(95, 55 + Math.abs(totalImpactPct) * 1.5)
    : Math.max(5, 55 - Math.abs(totalImpactPct) * 1.5);
  const maxDrawdown5p = p5.reduce((min, v) => Math.min(min, v), Infinity);

  return {
    ticker,
    currentPrice: stock.currentPrice,
    median30d: Math.round(median30d * 100) / 100,
    probProfit: Math.round(probProfit),
    maxDrawdown5p: Math.round(maxDrawdown5p * 100) / 100,
    eventImpact: Math.round(totalImpactDollar * 100) / 100,
    paths: { dates, median, p25, p75, p5, p95 },
    breakdown,
  };
}

// Mini chart data for landing page cards
export function generateMiniChartData(
  basePrice: number,
  targetPrice: number
): number[] {
  const points = 30;
  const data: number[] = [];
  let price = basePrice * 0.92;
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const trend = basePrice + (targetPrice - basePrice) * t * 0.5;
    const noise = (Math.sin(i * 2.3) * 0.01 + Math.cos(i * 0.7) * 0.008) * basePrice;
    price = trend + noise;
    data.push(Math.round(price * 100) / 100);
  }
  return data;
}
