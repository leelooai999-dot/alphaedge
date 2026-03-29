import { SimulationResult, StockData, ActiveEvent } from "./events";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function getStock(ticker: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/stocks/${ticker}`);
  if (!res.ok) throw new Error("Stock not found");
  return res.json();
}

export async function getStockHistory(
  ticker: string,
  days: number = 90
): Promise<{ dates: string[]; prices: number[] } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/stocks/${ticker}/history?days=${days}`);
    if (!res.ok) throw new Error("History not found");
    return res.json();
  } catch {
    return null;
  }
}

export async function getStockOHLCV(
  ticker: string,
  days: number = 90
): Promise<{
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
} | null> {
  try {
    const res = await fetch(`${API_BASE}/api/stocks/${ticker}/history?days=${days}&ohlcv=true`);
    if (!res.ok) throw new Error("OHLCV not found");
    return res.json();
  } catch {
    return null;
  }
}

/** Parallel fetch of stock info + history for initial page load */
export async function loadTickerPage(ticker: string) {
  const [stockData, historyData] = await Promise.all([
    getStock(ticker),
    getStockHistory(ticker, 90),
  ]);
  return { stockData, historyData };
}

export async function runSimulation(
  ticker: string,
  events: any[],
  options?: { fast?: boolean; horizonDays?: number }
): Promise<any> {
  const days = options?.horizonDays || 30;
  // Scale sim count by horizon: fewer paths for longer horizons to keep speed
  let nSim: number;
  if (options?.fast) {
    nSim = days > 90 ? 300 : 500;
  } else {
    nSim = days > 180 ? 1000 : days > 90 ? 2000 : 5000;
  }
  const token = typeof window !== 'undefined' ? localStorage.getItem("alphaedge_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ticker,
      events,
      horizon_days: days,
      n_simulations: nSim,
      fast: !!options?.fast,
    }),
  });
  if (!res.ok) throw new Error("Simulation failed");
  const data = await res.json();
  // Map snake_case API fields to camelCase for frontend
  if (data.commodity_impacts) data.commodityImpacts = data.commodity_impacts;
  if (data.stock_betas) data.stockBetas = data.stock_betas;
  if (data.stock_impact_breakdown) data.stockImpactBreakdown = data.stock_impact_breakdown;
  return data;
}

export async function getEvents(category?: string): Promise<any[]> {
  const params = category ? `?category=${category}` : "";
  const res = await fetch(`${API_BASE}/api/events${params}`);
  if (!res.ok) throw new Error("Events not found");
  return res.json();
}

// --- Polymarket Live Odds ---

export interface PolymarketOdds {
  odds: number;
  question: string;
  slug: string;
  volume_24h: number;
  is_inverse: boolean;
  last_updated: string;
}

export async function getPolymarketLiveOdds(): Promise<
  Record<string, PolymarketOdds>
> {
  try {
    const res = await fetch(`${API_BASE}/api/polymarket/live`);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

// --- Polymarket Search ---

export interface PolymarketSearchResult {
  question: string;
  slug: string;
  odds: number;
  volume_24h: number;
  end_date: string;
  image: string;
  polymarket_url: string;
}

export interface PolymarketSearchResponse {
  query: string;
  count: number;
  markets: PolymarketSearchResult[];
}

export async function searchPolymarket(
  query: string,
  limit: number = 20
): Promise<PolymarketSearchResponse> {
  try {
    const res = await fetch(
      `${API_BASE}/api/polymarket/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!res.ok) return { query, count: 0, markets: [] };
    return res.json();
  } catch {
    return { query, count: 0, markets: [] };
  }
}

// --- Pyeces Bridge ---

export async function loadBridgeScenario(bridgeId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/bridge/pyeces/${bridgeId}`);
  if (!res.ok) return null;
  return res.json();
}

// --- SWR fetcher helpers ---

export const swrFetcher = (url: string) =>
  fetch(`${API_BASE}${url}`).then((r) => {
    if (!r.ok) throw new Error(`Fetch failed: ${url}`);
    return r.json();
  });
