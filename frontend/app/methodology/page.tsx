import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function MethodologyPage() {
  return (
    <main className="min-h-screen pt-14">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Methodology</h1>
        <p className="text-muted mb-10">
          How MonteCarloo combines prediction markets with Monte Carlo simulation
          to project stock prices under real-world scenarios.
        </p>

        <div className="space-y-8">
          {/* Monte Carlo */}
          <Section
            number="1"
            title="Monte Carlo Simulation"
            description="We run thousands of random price paths for each stock, applying the statistical properties of historical returns. Each path represents one possible future."
          >
            <div className="bg-bg rounded-xl p-4 text-sm text-muted leading-relaxed space-y-3">
              <p>
                A Monte Carlo simulation works by:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Measuring the stock&apos;s historical daily volatility (how much it typically moves)</li>
                <li>Measuring the historical drift (general direction of returns)</li>
                <li>Adding event-specific adjustments based on probability and impact</li>
                <li>Generating 10,000 random paths using these parameters</li>
                <li>Summarizing the distribution: median, 25th/75th, and 5th/95th percentiles</li>
              </ol>
              <p>
                The result is a probability distribution of future prices — not a
                single prediction, but a range of likely outcomes.
              </p>
            </div>
          </Section>

          {/* Event Impact */}
          <Section
            number="2"
            title="Event Impact Calculation"
            description="Each event has three user-adjustable parameters that determine its effect on the simulation."
          >
            <div className="bg-bg rounded-xl p-4 space-y-4">
              <ParamRow
                label="Probability"
                value="0–100%"
                desc="How likely is this event to occur? Defaults to the live Polymarket odds. You can override this with your own estimate."
              />
              <ParamRow
                label="Impact"
                value="±30%"
                desc="If the event occurs, how much will it move the stock? Positive = bullish, negative = bearish. Based on historical analogs and analyst estimates."
              />
              <ParamRow
                label="Duration"
                value="1–180 days"
                desc="How long will the event&apos;s effect last? A short-lived supply disruption vs. a years-long trade war have very different cumulative impacts."
              />
              <p className="text-sm text-muted mt-3">
                The effective impact = probability × impact × duration_factor. This
                shifts the median path up or down, while the random component adds
                realistic uncertainty.
              </p>
            </div>
          </Section>

          {/* Polymarket */}
          <Section
            number="3"
            title="Polymarket Odds"
            description="Polymarket is a prediction market where traders bet on real-world events with real money. The odds reflect the crowd's best estimate of event probability."
          >
            <div className="bg-bg rounded-xl p-4 text-sm text-muted leading-relaxed space-y-3">
              <p>
                We use Polymarket odds as the default probability for each event
                because:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>They update in real-time as new information emerges</li>
                <li>They&apos;re economically grounded — traders have skin in the game</li>
                <li>They tend to be well-calibrated, especially for near-term events</li>
              </ul>
              <p>
                However, you can override these with your own probability estimates.
                The model is fully adjustable.
              </p>
            </div>
          </Section>

          {/* Limitations */}
          <Section
            number="4"
            title="Limitations"
            description="Important caveats to keep in mind when interpreting results."
          >
            <div className="bg-bg rounded-xl p-4 text-sm leading-relaxed space-y-3">
              <Warning
                text="Past volatility doesn't predict future volatility. Black swan events can cause moves far outside the simulated range."
              />
              <Warning
                text="Event impacts are estimates based on historical analogs. Real impacts may differ significantly."
              />
              <Warning
                text="Events are treated independently. In reality, geopolitical events are often correlated (e.g., oil disruption and Fed response)."
              />
              <Warning
                text="The simulation assumes log-normal price distributions. Real markets have fat tails and may not follow this model."
              />
              <Warning
                text="Polymarket odds reflect the market's consensus, not certainty. Markets can be wrong."
              />
            </div>
          </Section>

          {/* Disclaimer */}
          <div className="bg-bearish/5 border border-bearish/20 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">⚠️ Disclaimer</h3>
            <p className="text-sm text-muted leading-relaxed">
              MonteCarloo is a <strong className="text-white">simulation tool, not investment advice</strong>.
              The projections shown are probabilistic models based on historical data and
              market odds. They do not guarantee future performance. Always do your own
              research and consult a qualified financial advisor before making investment
              decisions. Past performance is not indicative of future results.
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

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-4 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent font-bold text-sm shrink-0">
          {number}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-muted mt-1">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ParamRow({
  label,
  value,
  desc,
}: {
  label: string;
  value: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-28 shrink-0">
        <div className="text-white font-medium text-sm">{label}</div>
        <div className="text-accent text-xs font-mono">{value}</div>
      </div>
      <div className="text-sm text-muted leading-relaxed">{desc}</div>
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
