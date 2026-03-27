"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ScenarioCard from "@/components/ScenarioCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface ScenarioCard {
  ticker: string;
  title: string;
  description: string;
  currentPrice: number;
  targetPrice: number;
  change: number;
  color: string;
  emoji: string;
  chartData: number[];
}

const scenarios: ScenarioCard[] = [
  {
    ticker: "CVX",
    title: "CVX + Iran War",
    description: "Iran-Israel escalation driving oil prices to new highs",
    currentPrice: 148.23,
    targetPrice: 162,
    change: 9.3,
    color: "#00d4aa",
    emoji: "🔴",
    chartData: generateMiniChart(148.23, 162),
  },
  {
    ticker: "NVDA",
    title: "NVDA + Chip Tariffs",
    description: "Expanded export controls pressure semiconductor stocks",
    currentPrice: 108.5,
    targetPrice: 95,
    change: -12.4,
    color: "#ff4757",
    emoji: "🟣",
    chartData: generateMiniChart(108.5, 95),
  },
  {
    ticker: "SPY",
    title: "SPY + Fed Rate Cut",
    description: "Expected rate cut sends broad market higher",
    currentPrice: 520,
    targetPrice: 540,
    change: 3.8,
    color: "#00d4aa",
    emoji: "🟡",
    chartData: generateMiniChart(520, 540),
  },
];

function generateMiniChart(base: number, target: number): number[] {
  const pts = 25;
  const data: number[] = [];
  for (let i = 0; i < pts; i++) {
    const t = i / (pts - 1);
    const trend = base + (target - base) * t * 0.4;
    const noise =
      (Math.sin(i * 2.3) * 0.008 + Math.cos(i * 0.7) * 0.006) * base;
    data.push(Math.round((trend + noise) * 100) / 100);
  }
  return data;
}

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 40;
  const padding = 2;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (w - padding * 2);
      const y = h - padding - ((v - min) / range) * (h - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "Live Data",
    description:
      "Polymarket odds update in real-time, reflecting the latest market consensus on global events.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
    title: "Play with the Future",
    description:
      "Adjust event parameters — duration, probability, impact — and watch price paths change in real-time.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
    ),
    title: "Share Your Thesis",
    description:
      "Save scenarios and share them with the community. Embed in Reddit threads or Twitter posts.",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "100% Free to Start",
    description:
      "3 stock simulations per day, no credit card required. Upgrade anytime for unlimited access.",
  },
];

export default function LandingPage() {
  const [trendingScenarios, setTrendingScenarios] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [scenRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/api/scenarios?sort=trending&limit=6`),
          fetch(`${API_BASE}/api/scenarios/stats`),
        ]);
        if (scenRes.ok) setTrendingScenarios(await scenRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch {}
    };
    load();
  }, []);

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 sm:pt-36 sm:pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 mb-6">
            <span className="w-2 h-2 rounded-full bg-accent live-dot" />
            <span className="text-xs text-accent font-medium">
              Powered by Polymarket × Monte Carlo
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-6">
            What if Iran war lasts{" "}
            <span className="gradient-text">10 more days</span>?
            <br />
            <span className="text-2xl sm:text-4xl lg:text-5xl font-bold text-muted mt-2 block">
              See the impact on your stocks.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-8">
            Live Polymarket odds × Monte Carlo simulation × interactive charts.
            Simulate geopolitical events before they move your portfolio.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sim/AAPL"
              className="px-6 py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm no-underline glow-accent"
            >
              Try it free →
            </Link>
            <Link
              href="/methodology"
              className="px-6 py-3 border border-border text-muted font-medium rounded-xl hover:text-white hover:border-white/20 transition-colors text-sm no-underline"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* Example Scenarios */}
      <section className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-8">
            Pre-built scenarios
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((s) => (
              <Link
                key={s.ticker}
                href={`/sim/${s.ticker}`}
                className="group bg-card border border-border rounded-2xl p-5 hover:border-accent/30 transition-all no-underline"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-mono font-bold text-white">
                    {s.emoji} {s.title}
                  </span>
                  <span
                    className={`text-sm font-mono font-semibold ${
                      s.change >= 0 ? "text-bullish" : "text-bearish"
                    }`}
                  >
                    {s.change >= 0 ? "+" : ""}
                    {s.change}%
                  </span>
                </div>
                <MiniChart data={s.chartData} color={s.color} />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">{s.description}</span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span>
                    Now:{" "}
                    <span className="text-white font-mono">
                      ${s.currentPrice}
                    </span>
                  </span>
                  <span>
                    Target:{" "}
                    <span
                      className={`font-mono ${
                        s.targetPrice >= s.currentPrice
                          ? "text-bullish"
                          : "text-bearish"
                      }`}
                    >
                      ${s.targetPrice}
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trending Community Scenarios */}
      {trendingScenarios.length > 0 && (
        <section className="py-12 px-4 bg-bg/50">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  🔥 Trending Scenarios
                </h2>
                {stats && (
                  <p className="text-xs text-muted mt-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot" />
                      {(stats.simulations_today || 0).toLocaleString()} simulations today
                    </span>
                    <span className="mx-2">·</span>
                    {(stats.total_scenarios || 0).toLocaleString()} scenarios published
                  </p>
                )}
              </div>
              <Link
                href="/explore"
                className="text-sm text-accent hover:text-accent/80 no-underline"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {trendingScenarios.map((s) => (
                <ScenarioCard key={s.id} scenario={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-10">
            Why MonteCarloo?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-card border border-border rounded-2xl p-6 hover:border-border/80 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-b from-accent/5 to-transparent border border-accent/20 rounded-3xl p-8 sm:p-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to see the future?
          </h2>
          <p className="text-muted mb-6">
            Start simulating in seconds. No sign-up required for your first 3 stocks.
          </p>
          <Link
            href="/sim/AAPL"
            className="inline-block px-8 py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm no-underline glow-accent"
          >
            Start Simulating →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">α</span>
            <span>MonteCarloo © 2025</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/methodology"
              className="hover:text-white transition-colors no-underline text-muted"
            >
              Methodology
            </Link>
            <span>•</span>
            <span>Not financial advice</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
