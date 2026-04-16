import LegalLayout from "../legal-layout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="April 15, 2026">
      <p>
        This Privacy Policy explains how MonteCarloo collects, uses, stores, and shares information when you use our
        website, account system, simulations, marketplace, billing features, feedback tools, and related services.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>Account information such as name, email address, login identifiers, and profile details.</li>
        <li>Usage information such as pages viewed, interactions, simulation actions, clicks, session activity, and device/browser metadata.</li>
        <li>Content you submit, such as saved scenarios, comments, marketplace listings, feedback, and profile content.</li>
        <li>Transaction and billing metadata provided through Stripe, such as subscription status, customer IDs, invoice IDs, and payment event records.</li>
        <li>Support and communications data if you contact us.</li>
      </ul>

      <h2>2. Information we do not directly store</h2>
      <p>
        We do not intentionally store full payment card numbers on our servers. Payment card information is processed by Stripe
        or other designated payment providers according to their security and compliance systems.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>To provide, maintain, secure, and improve the Service.</li>
        <li>To authenticate users and manage accounts.</li>
        <li>To process subscriptions, marketplace purchases, and billing events.</li>
        <li>To analyze product usage and improve performance, reliability, and UX.</li>
        <li>To respond to support requests and send service-related communications.</li>
        <li>To detect abuse, fraud, security incidents, or policy violations.</li>
      </ul>

      <h2>4. Analytics and product telemetry</h2>
      <p>
        We may use product analytics and session tools to understand how users interact with MonteCarloo, improve the product,
        detect bugs, and evaluate adoption of features. These tools may capture events such as pageviews, clicks, authenticated
        user IDs, and other interaction signals.
      </p>

      <h2>5. Legal bases and consent</h2>
      <p>
        Depending on your jurisdiction, we may process information based on contract performance, legitimate interests,
        compliance obligations, consent, or other lawful grounds recognized by applicable privacy law.
      </p>

      <h2>6. Sharing of information</h2>
      <p>We may share information with:</p>
      <ul>
        <li>service providers that help us host, operate, secure, analyze, or bill for the Service;</li>
        <li>payment processors such as Stripe;</li>
        <li>professional advisers, auditors, or legal authorities when reasonably necessary; and</li>
        <li>successors in connection with a merger, acquisition, financing, or sale of assets.</li>
      </ul>
      <p>
        We do not sell personal information in the ordinary sense of selling user data for cash consideration.
      </p>

      <h2>7. Data retention</h2>
      <p>
        We retain information for as long as reasonably necessary to operate the Service, comply with legal obligations,
        resolve disputes, enforce agreements, and maintain business records. Retention periods vary depending on the type
        of data and the purpose for which it was collected.
      </p>

      <h2>8. Cookies and similar technologies</h2>
      <p>
        We may use cookies, local storage, and similar technologies for authentication, performance, analytics,
        preference storage, fraud prevention, and product functionality.
      </p>

      <h2>9. Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, delete, export, or restrict certain personal
        information, or to object to certain processing. To make a request, contact <a href="mailto:support@montecarloo.com">support@montecarloo.com</a>.
      </p>

      <h2>10. Security</h2>
      <p>
        We use reasonable technical and organizational measures designed to protect information, but no system can be guaranteed
        to be completely secure. You are responsible for maintaining the confidentiality of your credentials.
      </p>

      <h2>11. International transfers</h2>
      <p>
        Your information may be processed in jurisdictions other than your own. By using the Service, you understand that data
        may be transferred to and processed where our providers and infrastructure operate, subject to applicable safeguards.
      </p>

      <h2>12. Children</h2>
      <p>
        The Service is not intended for children under 13, or under the minimum age required by local law to consent to data
        processing. If you believe a child has provided personal information, contact us so we can review and remove it.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will post the revised version on this page and update
        the effective date above.
      </p>

      <h2>14. Contact</h2>
      <p>
        Privacy questions or requests can be sent to <a href="mailto:support@montecarloo.com">support@montecarloo.com</a>.
      </p>
    </LegalLayout>
  );
}
