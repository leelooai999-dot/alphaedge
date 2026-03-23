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

export async function runSimulation(
  ticker: string,
  events: any[]
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker,
      events,
      horizon_days: 30,
      n_simulations: 5000,
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
