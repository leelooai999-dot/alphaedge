import LegalLayout from "../legal-layout";

export default function RefundsPage() {
  return (
    <LegalLayout title="Refund & Cancellation Policy" updated="April 15, 2026">
      <p>
        This Refund & Cancellation Policy explains how subscription cancellations, refunds, and digital purchases are handled
        for MonteCarloo paid plans and marketplace transactions.
      </p>

      <h2>1. Subscription cancellations</h2>
      <ul>
        <li>You may cancel your subscription at any time through the billing portal or by contacting support.</li>
        <li>When you cancel, your subscription remains active until the end of the current billing period unless otherwise stated.</li>
        <li>Cancellation stops future renewal charges, but does not automatically reverse charges already processed.</li>
      </ul>

      <h2>2. Subscription refunds</h2>
      <p>
        For first-time subscription purchases, MonteCarloo currently offers a 7-day refund window from the initial purchase date,
        provided the request is made in good faith and the account has not engaged in fraud, abuse, chargeback misuse, or material
        violation of our Terms.
      </p>
      <ul>
        <li>Refund requests should be sent to <a href="mailto:support@montecarloo.com">support@montecarloo.com</a>.</li>
        <li>Approved refunds are generally issued to the original payment method.</li>
        <li>We may deny refund requests involving abuse, repeated refund cycling, or clear policy evasion.</li>
      </ul>

      <h2>3. Renewal charges</h2>
      <p>
        Unless required by law, recurring renewal charges after the initial subscription period are generally non-refundable once billed,
        but we may review exceptional cases in our discretion.
      </p>

      <h2>4. Marketplace and digital goods</h2>
      <p>
        Marketplace purchases and downloadable digital goods are generally non-refundable once access has been granted or the digital
        item has been delivered, except where required by law or where the item is materially defective, inaccessible, or not as described.
      </p>

      <h2>5. Chargebacks and payment disputes</h2>
      <p>
        If you believe a charge is incorrect, please contact us before initiating a chargeback so we can attempt to resolve the issue.
        Fraudulent or abusive chargeback behavior may lead to suspension or termination of access.
      </p>

      <h2>6. How to request help</h2>
      <p>
        For billing questions, cancellation help, or refund review, contact <a href="mailto:support@montecarloo.com">support@montecarloo.com</a> and include
        the email address used for the purchase and any relevant invoice or receipt details.
      </p>
    </LegalLayout>
  );
}
