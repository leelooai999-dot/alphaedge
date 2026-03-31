"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ScenarioCard from "@/components/ScenarioCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface LiveScenario {
  ticker: string;
  title: string;
  description: string;
  currentPrice: number;
  medianTarget: number;
  change: number;
  event_id: string;
  probability: number;
  emoji: string;
}

const HERO_SCENARIOS = [
  { ticker: "CVX", event_id: "iran_escalation", probability: 0.8, severity: 7, duration: 30, emoji: "🛢️", title: "CVX + Iran Escalation", description: "Oil majors surge as Iran tensions threaten supply" },
  { ticker: "NVDA", event_id: "chip_export_control", probability: 0.6, severity: 7, duration: 60, emoji: "🔬", title: "NVDA + Chip Controls", description: "Export restrictions pressure semiconductor giant" },
  { ticker: "SPY", event_id: "fed_rate_cut", probability: 0.7, severity: 5, duration: 30, emoji: "📊", title: "SPY + Fed Rate Cut", description: "Broad market rally if the Fed eases rates" },
];

function MiniChart({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
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
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function generateMiniChart(base: number, target: number): number[] {
  const pts = 25;
  const data: number[] = [];
  for (let i = 0; i < pts; i++) {
    const t = i / (pts - 1);
    const trend = base + (target - base) * t * 0.7;
    const noise = (Math.sin(i * 2.3) * 0.008 + Math.cos(i * 0.7) * 0.006) * base;
    data.push(Math.round((trend + noise) * 100) / 100);
  }
  return data;
}

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const duration = 1500;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);
  return <span>{count.toLocaleString()}{suffix}</span>;
}

const features = [
  {
    icon: "⚡",
    title: "Live Polymarket Odds",
    description: "Real-time prediction market data feeds directly into simulations. See what the crowd thinks — then model what happens next.",
  },
  {
    icon: "🎛️",
    title: "Interactive Sliders",
    description: "Adjust probability, duration, and severity of any event. Watch Monte Carlo paths reshape in real-time as you play.",
  },
  {
    icon: "🗣️",
    title: "AI Character Debates",
    description: "Watch simulated world leaders and analysts debate your scenario. Chat privately with any character for their take.",
  },
  {
    icon: "📤",
    title: "Export to TradingView",
    description: "One-click Pine Script export. Paste your simulation as an overlay on any TradingView chart.",
  },
  {
    icon: "🏆",
    title: "Track Your Accuracy",
    description: "Save predictions, compare against reality after 30 days. Climb the leaderboard with your forecasting skill.",
  },
  {
    icon: "🆓",
    title: "Free to Start",
    description: "Unlimited simulations, no credit card. Create an account to save scenarios and join the community.",
  },
];

export default function LandingPage() {
  const [liveScenarios, setLiveScenarios] = useState<LiveScenario[]>([]);
  const [trendingScenarios, setTrendingScenarios] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [heroLoaded, setHeroLoaded] = useState(false);

  useEffect(() => {
    // Load trending + stats
    const loadSocial = async () => {
      try {
        const [scenRes, statsRes] = await Promise.all([
          fetch(`${API_BASE}/api/scenarios?sort=trending&limit=6`),
          fetch(`${API_BASE}/api/scenarios/stats`),
        ]);
        if (scenRes.ok) setTrendingScenarios(await scenRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch {}
    };

    // Load live hero scenarios (quick simulations)
    const loadHero = async () => {
      const results: LiveScenario[] = [];
      for (const hs of HERO_SCENARIOS) {
        try {
          const res = await fetch(`${API_BASE}/api/simulate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticker: hs.ticker,
              events: [{ id: hs.event_id, probability: hs.probability, params: { severity: hs.severity, duration_days: hs.duration } }],
              horizon_days: 30,
              n_simulations: 200,
              fast: true,
            }),
          });
          if (res.ok) {
            const d = await res.json();
            results.push({
              ticker: hs.ticker,
              title: hs.title,
              description: hs.description,
              currentPrice: d.current_price,
              medianTarget: d.median_target,
              change: d.expected_return_pct,
              event_id: hs.event_id,
              probability: hs.probability,
              emoji: hs.emoji,
            });
          }
        } catch {}
      }
      if (results.length > 0) {
        setLiveScenarios(results);
        setHeroLoaded(true);
      }
    };

    loadSocial();
    loadHero();
  }, []);

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 sm:pt-36 sm:pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 mb-6">
            <span className="w-2 h-2 rounded-full bg-accent live-dot" />
            <span className="text-xs text-accent font-medium">
              Polymarket × Monte Carlo × AI Debates
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-6">
            What happens to your stocks{" "}
            <span className="gradient-text">if the world changes</span>?
          </h1>

          <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-4">
            Simulate geopolitical events, Fed decisions, and market shocks.
            Watch AI world leaders debate your scenario. Export to TradingView.
          </p>

          {/* Social proof */}
          {stats && (
            <div className="flex items-center justify-center gap-6 text-xs text-muted mb-8">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot" />
                <span><AnimatedCounter target={stats.total_simulations || 49000} /> simulations run</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-white/10" />
              <div className="hidden sm:flex items-center gap-1.5">
                <span>📊</span>
                <span>{stats.total_scenarios || 0} community scenarios</span>
              </div>
              <div className="hidden sm:block w-px h-3 bg-white/10" />
              <div className="hidden sm:flex items-center gap-1.5">
                <span>🎭</span>
                <span>18 AI characters</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link
              href="/sim/AAPL"
              className="px-8 py-3.5 bg-accent text-bg font-bold rounded-xl hover:bg-accentDim transition-all text-sm no-underline glow-accent transform hover:scale-105"
            >
              🚀 Try it free — no signup
            </Link>
            <Link
              href="/debate"
              className="px-6 py-3.5 border border-accent/30 text-accent font-medium rounded-xl hover:bg-accent/5 transition-all text-sm no-underline"
            >
              🗣️ Watch AI Debates
            </Link>
          </div>
          <p className="text-xs text-muted/60">No credit card · Unlimited simulations · Export to TradingView</p>
        </div>
      </section>

      {/* Live Hero Scenarios */}
      <section className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-6 justify-center">
            <span className="w-2 h-2 rounded-full bg-green-400 live-dot" />
            <h2 className="text-lg sm:text-xl font-bold text-white">
              Live Simulations
            </h2>
            <span className="text-xs text-muted ml-2">Updated with real prices</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(heroLoaded ? liveScenarios : HERO_SCENARIOS.map(h => ({
              ticker: h.ticker, title: h.title, description: h.description,
              currentPrice: 0, medianTarget: 0, change: 0, emoji: h.emoji,
              event_id: h.event_id, probability: h.probability,
            }))).map((s) => {
              const change = s.change || 0;
              const color = change >= 0 ? "#00d4aa" : "#ff4757";
              const chartData = s.currentPrice > 0 ? generateMiniChart(s.currentPrice, s.medianTarget || s.currentPrice) : [];
              return (
                <Link
                  key={s.ticker}
                  href={`/sim/${s.ticker}?event=${s.event_id}`}
                  className="group bg-card border border-border rounded-2xl p-5 hover:border-accent/30 transition-all no-underline hover:transform hover:scale-[1.02]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-mono font-bold text-white">
                      {s.emoji} {s.ticker}
                    </span>
                    {heroLoaded ? (
                      <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${change >= 0 ? "text-bullish bg-bullish/10" : "text-bearish bg-bearish/10"}`}>
                        {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="w-12 h-5 bg-white/5 rounded animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-muted mb-2">{s.title}</p>
                  {chartData.length > 0 ? (
                    <MiniChart data={chartData} color={color} />
                  ) : (
                    <div className="h-10 bg-white/5 rounded animate-pulse" />
                  )}
                  <div className="mt-3 flex items-center justify-between text-xs text-muted">
                    {heroLoaded && s.currentPrice > 0 ? (
                      <>
                        <span>Now: <span className="text-white font-mono">${s.currentPrice.toFixed(2)}</span></span>
                        <span>30d: <span className={`font-mono ${change >= 0 ? "text-bullish" : "text-bearish"}`}>${(s.medianTarget || 0).toFixed(2)}</span></span>
                      </>
                    ) : (
                      <>
                        <span className="w-20 h-3 bg-white/5 rounded animate-pulse" />
                        <span className="w-20 h-3 bg-white/5 rounded animate-pulse" />
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-accent/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to simulate →
                  </div>
                </Link>
              );
            })}
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
                  🔥 Community Scenarios
                </h2>
                <p className="text-xs text-muted mt-1">
                  Created by traders · Fork any scenario to make it yours
                </p>
              </div>
              <Link href="/explore" className="text-sm text-accent hover:text-accent/80 no-underline">
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

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-3">
            Why MonteCarloo?
          </h2>
          <p className="text-sm text-muted text-center mb-10 max-w-xl mx-auto">
            The only platform where prediction markets meet Monte Carlo simulation meets AI character debates.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-card border border-border rounded-2xl p-6 hover:border-accent/20 transition-colors"
              >
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-card/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-10">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: "1", icon: "🔍", title: "Pick a stock", desc: "Search any US stock — AAPL, NVDA, CVX, SPY..." },
              { step: "2", icon: "🌍", title: "Add events", desc: "Iran war? Fed rate cut? Tariffs? Adjust probability and severity." },
              { step: "3", icon: "📈", title: "See the future", desc: "Monte Carlo runs thousands of paths. See median, confidence bands, and export." },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-2xl mb-4">
                  {s.icon}
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">{s.title}</h3>
                <p className="text-xs text-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-b from-accent/5 to-transparent border border-accent/20 rounded-3xl p-8 sm:p-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Your portfolio deserves better than guessing
          </h2>
          <p className="text-muted mb-6">
            Start simulating in seconds. See how events impact your stocks before they happen.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sim/AAPL"
              className="px-8 py-3.5 bg-accent text-bg font-bold rounded-xl hover:bg-accentDim transition-all text-sm no-underline glow-accent"
            >
              Start Simulating →
            </Link>
            <Link
              href="/debate"
              className="px-6 py-3.5 border border-border text-muted font-medium rounded-xl hover:text-white hover:border-white/20 transition-all text-sm no-underline"
            >
              Or watch an AI debate first
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold gradient-text">MC</span>
              <span>MonteCarloo © 2025</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/methodology" className="hover:text-white transition-colors no-underline text-muted">Methodology</Link>
              <span>·</span>
              <Link href="/pricing" className="hover:text-white transition-colors no-underline text-muted">Pricing</Link>
              <span>·</span>
              <Link href="/debate" className="hover:text-white transition-colors no-underline text-muted">AI Debates</Link>
              <span>·</span>
              <span>Not financial advice</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
