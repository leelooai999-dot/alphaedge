import type { Metadata } from "next";
import "./globals.css";
import PostHogProvider from "@/components/PostHogProvider";
import FeedbackWidget from "@/components/FeedbackWidget";

export const metadata: Metadata = {
  title: "MonteCarloo — What If the World Changes? Simulate Your Stocks.",
  description:
    "Monte Carlo simulation + Polymarket live odds + AI character debates. See how Iran, Fed rate cuts, tariffs, and 18 events impact any US stock. Free, no signup.",
  keywords: ["stock simulator", "monte carlo simulation", "polymarket odds", "geopolitical stock impact", "what if stock analysis", "AI stock debate", "event simulator", "options trading", "iran oil stocks", "fed rate cut stocks"],
  openGraph: {
    title: "MonteCarloo — What If the World Changes?",
    description: "Simulate how Iran, Fed rate cuts, tariffs, and 18 events impact your stocks. Live Polymarket odds × Monte Carlo × AI debates. Free.",
    type: "website",
    url: "https://montecarloo.com",
    siteName: "MonteCarloo",
    images: [
      {
        url: "https://api.montecarloo.com/api/og/home",
        width: 1200,
        height: 630,
        alt: "MonteCarloo — Stock Event Simulator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MonteCarloo — What If the World Changes?",
    description: "Simulate how events impact your stocks. Monte Carlo × Polymarket × AI debates.",
    images: ["https://api.montecarloo.com/api/og/home"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://montecarloo.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />

      </head>
      <body className="bg-bg text-gray-200 min-h-screen antialiased">
        <PostHogProvider>
          {children}
          <FeedbackWidget />
        </PostHogProvider>
      </body>
    </html>
  );
}
