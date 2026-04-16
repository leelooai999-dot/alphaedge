import LegalLayout from "../legal-layout";

export default function BillingPage() {
  return (
    <LegalLayout title="Billing & Subscription Terms" updated="April 15, 2026">
      <p>
        This page summarizes important billing disclosures for MonteCarloo subscriptions and purchases processed through Stripe.
      </p>

      <h2>1. Recurring billing</h2>
      <p>
        Paid subscriptions renew automatically on a recurring basis until canceled. By starting a paid subscription, you authorize
        MonteCarloo and Stripe to charge your payment method for the recurring amount shown at checkout, plus applicable taxes and fees.
      </p>

      <h2>2. Pricing disclosure</h2>
      <ul>
        <li>Free plan: $0</li>
        <li>Pro plan: billed monthly at the price shown on the pricing page and Stripe checkout</li>
        <li>Premium plan: billed monthly at the price shown on the pricing page and Stripe checkout</li>
        <li>Enterprise or custom plans: billed according to a separate written agreement or quote if offered</li>
      </ul>
      <p>
        Current public pricing is displayed on <a href="/pricing">/pricing</a>. If the price displayed on Stripe checkout differs from a stale page,
        the price shown at checkout controls for that transaction.
      </p>

      <h2>3. Taxes</h2>
      <p>
        Taxes may be added where required by law based on your billing location, tax status, or the rules applied by Stripe and relevant authorities.
      </p>

      <h2>4. Cancellation</h2>
      <p>
        You may cancel at any time through the billing portal made available after purchase. Canceling stops future renewals but usually does not
        revoke access before the current paid period ends.
      </p>

      <h2>5. Failed payments</h2>
      <p>
        If a payment fails, access to paid features may be limited, paused, or downgraded until billing is successfully resolved.
      </p>

      <h2>6. Refund reference</h2>
      <p>
        Refund eligibility, if any, is described in our <a href="/refunds">Refund & Cancellation Policy</a>.
      </p>

      <h2>7. Payment processor</h2>
      <p>
        Payments are processed by Stripe. Your use of payment functionality may also be subject to Stripe&apos;s terms, privacy policy, and checkout interface.
      </p>

      <h2>8. Contact</h2>
      <p>
        For billing support, contact <a href="mailto:support@montecarloo.com">support@montecarloo.com</a>.
      </p>
    </LegalLayout>
  );
}
