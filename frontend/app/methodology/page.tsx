import Navbar from "@/components/Navbar";
import Link from "next/link";

export const metadata = {
  title: "Methodology — MonteCarloo Simulation Engine",
  description: "Technical documentation of MonteCarloo's Monte Carlo simulation engine, commodity beta model, temporal event profiles, and data sources.",
};

export default function MethodologyPage() {
  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded font-mono">v6.1</span>
          <span className="text-xs text-muted">Last updated: March 2026</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Methodology</h1>
        <p className="text-muted mb-4">
          Technical documentation of the MonteCarloo simulation engine, commodity beta model, and data pipeline.
        </p>
        <p className="text-sm text-muted/70 mb-10">
          MonteCarloo models stock price paths under user-defined event scenarios using a multi-factor Monte Carlo framework.
          Events propagate through a commodity impact layer, transformed into stock-level drift/volatility adjustments
          via a beta decomposition model. This document describes the architecture, assumptions, and limitations.
        </p>

        <div className="space-y-10">

          {/* 1. Architecture */}
          <Section number="1" title="System Architecture">
            <div className="bg-bg rounded-xl p-5 text-sm text-muted leading-relaxed space-y-4">
              <p>The simulation pipeline has four stages:</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center text-xs">
                <StageBox label="Events" sub="18 templates, user params" color="accent" />
                <StageBox label="Commodities" sub="9 asset classes" color="yellow-400" />
                <StageBox label="Stock Betas" sub="100+ individual betas" color="blue-400" />
                <StageBox label="Monte Carlo" sub="200–10K paths" color="green-400" />
              </div>
              <p>
                <strong className="text-white">Stage 1:</strong> User defines event(s) with probability, severity (1–10), and duration.
                Default probabilities sourced from Polymarket live odds when available.
              </p>
              <p>
                <strong className="text-white">Stage 2:</strong> Each event maps to commodity impacts via a hardcoded impact matrix.
                Example: <code className="text-accent">iran_escalation</code> → WTI +10%, BRENT +12%, GOLD +3%, VIX +25%.
                Impacts compound multiplicatively across multiple events.
              </p>
              <p>
                <strong className="text-white">Stage 3:</strong> Commodity impacts translate to stock-level price impact via a beta
                vector per stock. Example: CVX beta to WTI = 0.70. Correlated commodities (WTI/BRENT) are handled
                via correlation groups to prevent double-counting.
              </p>
              <p>
                <strong className="text-white">Stage 4:</strong> Geometric Brownian Motion (GBM) simulation with adjusted drift and volatility.
                Daily log returns: <code className="text-accent">r(t) = (μ + Δμ)dt - ½σ²dt + σ√dt·Z(t)</code> where
                Δμ is the event-adjusted drift and σ is scaled by VIX impact.
              </p>
            </div>
          </Section>

          {/* 2. Commodity Beta Model */}
          <Section number="2" title="Commodity Beta Model (v6)">
            <div className="bg-bg rounded-xl p-5 text-sm text-muted leading-relaxed space-y-4">
              <p>
                Unlike simple flat-drift models, MonteCarloo routes event impacts through an intermediate commodity layer.
                This captures the causal chain: geopolitical event → commodity price movement → stock price movement.
              </p>
              <h4 className="text-white font-semibold text-sm">Commodity Impact Matrix</h4>
              <p>
                Each event has calibrated impacts on up to 9 commodity classes: WTI, BRENT, NATGAS, GOLD, VIX, USD (DXY),
                10Y (Treasury yield), CHIPS (semiconductor index), COPPER, WHEAT, LITHIUM.
              </p>
              <p>
                Impacts are defined with base percentage, min/max range, delay days, and optional duration decay.
                Severity and probability scale the base impact with a power curve: <code className="text-accent">severity_factor = (raw/5)^0.7</code>.
              </p>

              <h4 className="text-white font-semibold text-sm">Stock Beta Vectors</h4>
              <p>
                Each stock has a beta vector mapping commodity sensitivities. Phase 1 uses analyst-estimated betas
                (100+ stocks across energy, tech, defense, airlines, financials, consumer, healthcare, real estate).
                Phase 2 will auto-calculate from rolling 90-day correlations via price data.
              </p>

              <h4 className="text-white font-semibold text-sm">Correlation-Aware Aggregation</h4>
              <p>
                Highly correlated commodities (WTI/BRENT, r &gt; 0.9) are grouped. Within a correlation group, only the
                member with the largest absolute weighted impact (Δcommodity × β) is used, preventing double-counting.
                Example: CVX has WTI β=0.70 and BRENT β=0.65. If both move +15%, only WTI×0.70 = +10.5% is applied.
              </p>

              <div className="bg-card border border-border rounded-lg p-3 text-xs">
                <span className="text-white font-mono">Example: CVX + Iran Escalation (p=0.8, severity=7)</span>
                <div className="mt-2 space-y-1 font-mono text-muted">
                  <div>WTI: +10% base × 1.31 severity × 0.8 prob = <span className="text-bullish">+10.5%</span></div>
                  <div>CVX β(WTI) = 0.70 → stock impact: <span className="text-bullish">+7.3%</span></div>
                  <div>BRENT: +12.6% (correlated with WTI — <span className="text-yellow-400">skipped</span>)</div>
                  <div>GOLD: +2.4% × β(0.03) = <span className="text-bullish">+0.1%</span></div>
                  <div>VIX: +20% × β(-0.08) = <span className="text-bearish">-1.6%</span></div>
                  <div className="text-white pt-1 border-t border-border">Net: +5.8% over 30 days → ~$224 median (from $212)</div>
                </div>
              </div>
            </div>
          </Section>

          {/* 3. Temporal Event Engine */}
          <Section number="3" title="Temporal Event Engine (v5)">
            <div className="bg-bg rounded-xl p-5 text-sm text-muted leading-relaxed space-y-4">
              <p>
                When events include a specific date, the temporal engine models three phases:
              </p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="text-yellow-400 font-bold mb-1">Anticipation</div>
                  <div>Drift builds as event approaches</div>
                  <div className="text-muted/60 mt-1">exponential ramp</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="text-bearish font-bold mb-1">Shock</div>
                  <div>Jump on event date</div>
                  <div className="text-muted/60 mt-1">Bernoulli × Normal</div>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="text-bullish font-bold mb-1">Decay / Regime</div>
                  <div>Mean reversion or permanent shift</div>
                  <div className="text-muted/60 mt-1">regime_shift ∈ [0,1]</div>
                </div>
              </div>
              <p>
                Each event template has a <code className="text-accent">TemporalProfile</code> with parameters:
                anticipation_days, shock_days, decay_days, regime_shift (fraction of impact that persists permanently),
                jump_mean, and jump_std. Events without dates fall back to the flat-drift v4 model.
              </p>
            </div>
          </Section>

          {/* 4. Data Sources */}
          <Section number="4" title="Data Sources & Calibration">
            <div className="bg-bg rounded-xl p-5 text-sm text-muted leading-relaxed space-y-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-white">Source</th>
                    <th className="text-left py-2 text-white">Data</th>
                    <th className="text-left py-2 text-white">Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2">Yahoo Finance</td><td>Stock prices, historical OHLCV, volatility</td><td>Real-time (15m delay)</td></tr>
                  <tr><td className="py-2">Polymarket</td><td>Event probabilities (live odds)</td><td>60s polling</td></tr>
                  <tr><td className="py-2">Commodity Impact Matrix</td><td>Event → commodity % change</td><td>Analyst-calibrated (monthly review)</td></tr>
                  <tr><td className="py-2">Stock Beta Vectors</td><td>Commodity → stock sensitivity</td><td>100+ stocks, Phase 2: auto-calculated</td></tr>
                  <tr><td className="py-2">Historical Analogs</td><td>Event calibration (2014 Russia, 2019 Aramco, 2020 COVID)</td><td>Manual</td></tr>
                </tbody>
              </table>

              <h4 className="text-white font-semibold text-sm">Calibration Process</h4>
              <p>
                Commodity impact ranges are calibrated against historical events: the 2019 Aramco drone attack (+15% WTI intraday),
                2014 Russia/Ukraine (+25% natgas), 2020 COVID (-30% WTI), and 2022 Russia/Ukraine (+60% natgas, +8% WTI).
                Severity=5 maps to the &quot;typical&quot; impact; severity=10 maps to the worst historical case.
              </p>
            </div>
          </Section>

          {/* 5. Simulation Parameters */}
          <Section number="5" title="Simulation Parameters">
            <div className="bg-bg rounded-xl p-5 text-sm text-muted leading-relaxed space-y-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-white">Parameter</th>
                    <th className="text-left py-2 text-white">Default</th>
                    <th className="text-left py-2 text-white">Range</th>
                    <th className="text-left py-2 text-white">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="py-2">Paths</td><td>2,000</td><td>200–10,000</td><td>More paths = smoother distribution</td></tr>
                  <tr><td className="py-2">Horizon</td><td>30 days</td><td>7–365 days</td><td>Trading days (252/year)</td></tr>
                  <tr><td className="py-2">Volatility</td><td>Historical 30d</td><td>—</td><td>Annualized, from Yahoo Finance</td></tr>
                  <tr><td className="py-2">Base drift</td><td>7% annual</td><td>—</td><td>Long-term equity risk premium</td></tr>
                  <tr><td className="py-2">Random seed</td><td>42</td><td>—</td><td>Reproducible results for same inputs</td></tr>
                  <tr><td className="py-2">Probability clamp</td><td>[0, 1]</td><td>—</td><td>Values &gt;1 auto-divided by 100</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* 6. AI Character Debates */}
          <Section number="6" title="AI Character Simulation">
            <div className="bg-bg rounded-xl p-5 text-sm text-muted leading-relaxed space-y-4">
              <p>
                The debate feature generates simulated responses from 18 AI characters (8 world leaders, 10 market analysts)
                using LLM-powered prompts. Each character has a defined expertise domain, historical decision patterns,
                and communication style.
              </p>
              <p>
                <strong className="text-white">Important:</strong> Character responses are AI-generated simulations of how these
                figures <em>might</em> respond based on their public statements and known positions. They are not predictions,
                endorsements, or actual statements by these individuals.
              </p>
              <p>
                Characters generate predictions (direction, target price, confidence) which feed into a consensus view.
                The consensus is display-only and does not affect the Monte Carlo simulation.
              </p>
            </div>
          </Section>

          {/* 7. Limitations */}
          <Section number="7" title="Limitations & Model Risk">
            <div className="bg-bg rounded-xl p-5 text-sm leading-relaxed space-y-3">
              <Warning text="GBM assumes log-normal returns. Real markets exhibit fat tails, volatility clustering, and regime changes that this model does not capture." />
              <Warning text="Commodity beta vectors are static estimates. True correlations vary by market regime, time horizon, and concurrent events." />
              <Warning text="Events are assumed conditionally independent given commodity impacts. In reality, events often cascade (Iran → oil → inflation → Fed response)." />
              <Warning text="Polymarket odds represent market consensus, not ground truth. Prediction markets can be illiquid, manipulated, or systematically biased." />
              <Warning text="Historical calibration is backward-looking. Structural market changes (e.g., US energy independence) may invalidate historical analogs." />
              <Warning text="The model does not account for options market dynamics, liquidity constraints, or market microstructure effects." />
              <Warning text="Monte Carlo convergence requires sufficient paths. Below 500 paths, percentile estimates have significant sampling error." />
            </div>
          </Section>

          {/* Disclaimer */}
          <div className="bg-bearish/5 border border-bearish/20 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">⚠️ Disclaimer</h3>
            <p className="text-sm text-muted leading-relaxed">
              MonteCarloo is a <strong className="text-white">simulation and educational tool, not investment advice</strong>.
              The projections shown are probabilistic models based on historical data, analyst estimates, and prediction market
              odds. They do not guarantee future performance. The models have known limitations and simplifications.
              Always conduct independent analysis and consult qualified financial advisors before making investment decisions.
              Past performance and historical analogs are not indicative of future results.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center pt-4">
            <Link
              href="/sim/AAPL"
              className="inline-block px-8 py-3 bg-accent text-bg font-semibold rounded-xl hover:bg-accentDim transition-colors text-sm no-underline glow-accent"
            >
              Try the Simulator →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent font-bold text-xs shrink-0 mt-0.5">
          {number}
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StageBox({ label, sub, color }: { label: string; sub: string; color: string }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-3`}>
      <div className={`text-${color} font-bold text-sm mb-1`}>{label}</div>
      <div className="text-muted/70">{sub}</div>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-bearish shrink-0">•</span>
      <p className="text-muted">{text}</p>
    </div>
  );
}
