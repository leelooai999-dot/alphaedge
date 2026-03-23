"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { ActiveEvent, StockData } from "@/lib/events";
import { MOCK_STOCKS, mockSimulate } from "@/lib/mock";
import { useState, useEffect } from "react";

const SimChart = dynamic(() => import("@/components/SimChart"), { ssr: false });
const ImpactBreakdown = dynamic(
  () => import("@/components/ImpactBreakdown"),
  { ssr: false }
);

// Mock a shared scenario for demo purposes
export default function SharePage() {
  const params = useParams();
  const id = params.id as string;

  const [stock] = useState<StockData>(MOCK_STOCKS.CVX);
  const [events] = useState<ActiveEvent[]>([
    {
      ...MOCK_STOCKS.CVX,
      id: "iran-escalation",
      name: "Iran-Israel Escalation",
      category: "geopolitical",
      emoji: "🔴",
      polymarketOdds: 67,
      defaultImpact: 9.3,
      defaultDuration: 30,
      direction: "bullish",
      description: "",
      probability: 67,
      duration: 30,
      impact: 9.3,
    },
  ]);
  const [result] = useState(() => mockSimulate("CVX", [
    {
      id: "iran-escalation",
      name: "Iran-Israel Escalation",
      category: "geopolitical",
      emoji: "🔴",
      polymarketOdds: 67,
      defaultImpact: 9.3,
      defaultDuration: 30,
      direction: "bullish",
      description: "",
      probability: 67,
      duration: 30,
      impact: 9.3,
    },
  ]));

  const embedCode = `<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/s/${id}" width="100%" height="500" frameborder="0"></iframe>`;

  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted">Shared Scenario</span>
              <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-md">
                CVX
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              🔴 Iran-Israel Escalation → Chevron
            </h1>
            <p className="text-sm text-muted mt-1">
              Created by <span className="text-white">Anonymous</span> ·
              Shared just now
            </p>
          </div>
          <Link
            href="/sim/CVX"
            className="px-5 py-2.5 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm no-underline shrink-0"
          >
            Open in Simulator →
          </Link>
        </div>

        {/* Chart */}
        <div className="bg-card rounded-2xl border border-border p-4 mb-4">
          <SimChart stock={stock} result={result} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-card rounded-xl border border-border p-3">
            <div className="text-xs text-muted mb-1">30-day target</div>
            <div className="font-mono font-bold text-lg text-white">
              ${result.median30d.toFixed(0)}
            </div>
            <div className="text-xs text-neutral mt-0.5">median</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3">
            <div className="text-xs text-muted mb-1">Prob. of profit</div>
            <div className="font-mono font-bold text-lg text-bullish">
              {result.probProfit}%
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3">
            <div className="text-xs text-muted mb-1">Max drawdown</div>
            <div className="font-mono font-bold text-lg text-bearish">
              ${result.maxDrawdown5p.toFixed(0)}
            </div>
            <div className="text-xs text-neutral mt-0.5">5th percentile</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3">
            <div className="text-xs text-muted mb-1">Event impact</div>
            <div className="font-mono font-bold text-lg text-bullish">
              +${result.eventImpact.toFixed(0)}
            </div>
            <div className="text-xs text-neutral mt-0.5">vs base case</div>
          </div>
        </div>

        {/* Impact breakdown */}
        <ImpactBreakdown result={result} />

        {/* Embed code */}
        <div className="mt-6 bg-card rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Embed Widget</h3>
          <p className="text-xs text-muted mb-3">
            Paste this code into Reddit, Twitter, or any HTML page to embed this
            scenario.
          </p>
          <div className="relative">
            <code className="block bg-bg rounded-lg p-3 text-xs font-mono text-muted overflow-x-auto">
              {embedCode}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(embedCode)}
              className="absolute top-2 right-2 px-2 py-1 bg-card text-xs text-muted rounded hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
