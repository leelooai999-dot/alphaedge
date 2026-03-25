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
  options?: { fast?: boolean }
): Promise<any> {
  const nSim = options?.fast ? 1000 : 5000;
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker,
      events,
      horizon_days: 30,
      n_simulations: nSim,
      fast: !!options?.fast,
    }),
  });
  if (!res.ok) throw new Error("Simulation failed");
  return res.json();
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

// --- SWR fetcher helpers ---

export const swrFetcher = (url: string) =>
  fetch(`${API_BASE}${url}`).then((r) => {
    if (!r.ok) throw new Error(`Fetch failed: ${url}`);
    return r.json();
  });
