import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-bg pt-14">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 text-xs text-muted mb-4">
            <Link href="/pricing" className="hover:text-white no-underline">Pricing</Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-white no-underline">Terms</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-white no-underline">Privacy</Link>
            <span>•</span>
            <Link href="/refunds" className="hover:text-white no-underline">Refunds</Link>
            <span>•</span>
            <Link href="/billing" className="hover:text-white no-underline">Billing</Link>
            <span>•</span>
            <Link href="/disclaimer" className="hover:text-white no-underline">Disclaimer</Link>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{title}</h1>
          <p className="text-sm text-muted">Last updated: {updated}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 prose prose-invert max-w-none prose-p:text-muted prose-li:text-muted prose-strong:text-white prose-headings:text-white prose-a:text-accent">
          {children}
        </div>
      </div>
    </main>
  );
}
