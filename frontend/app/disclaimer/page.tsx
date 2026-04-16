import LegalLayout from "../legal-layout";

export default function DisclaimerPage() {
  return (
    <LegalLayout title="Risk Disclosure & Disclaimer" updated="April 15, 2026">
      <p>
        MonteCarloo provides educational and informational tools for scenario analysis. The Service does not provide personalized
        investment advice, legal advice, tax advice, accounting advice, brokerage services, or fiduciary services.
      </p>

      <h2>1. Not investment advice</h2>
      <p>
        Nothing on MonteCarloo constitutes a solicitation, recommendation, endorsement, or offer to buy or sell securities,
        derivatives, or other financial instruments.
      </p>

      <h2>2. Hypothetical modeling</h2>
      <p>
        Simulations, scenario paths, projected price ranges, AI-generated commentary, marketplace materials, and event analyses are
        hypothetical outputs based on model assumptions and available inputs. Hypothetical performance has many inherent limitations
        and does not reflect actual trading results.
      </p>

      <h2>3. Market risk</h2>
      <p>
        Trading and investing involve substantial risk, including the risk of loss of principal and, for certain instruments,
        losses exceeding initial capital. You are solely responsible for evaluating risk and determining whether any action is appropriate.
      </p>

      <h2>4. Third-party data and delays</h2>
      <p>
        MonteCarloo may incorporate third-party market data, event feeds, analytics, or other external information that may be delayed,
        incomplete, unavailable, or inaccurate.
      </p>

      <h2>5. No guarantee of results</h2>
      <p>
        We do not warrant the accuracy, completeness, profitability, or reliability of any output, nor do we guarantee any future market result,
        investment outcome, or performance improvement.
      </p>

      <h2>6. Independent judgment required</h2>
      <p>
        You should use independent judgment and, where appropriate, consult qualified advisers before making investment, legal, tax,
        accounting, or business decisions.
      </p>
    </LegalLayout>
  );
}
