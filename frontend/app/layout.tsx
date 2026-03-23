import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlphaEdge — What-if Stock Event Simulator",
  description:
    "Simulate how geopolitical events, macro shifts, and sector news impact your stocks. Powered by Polymarket odds and Monte Carlo simulation.",
  keywords: ["stock simulator", "monte carlo", "polymarket", "geopolitical events", "stock analysis"],
  openGraph: {
    title: "AlphaEdge — What-if Stock Event Simulator",
    description: "See the impact of world events on your stocks before they happen.",
    type: "website",
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
        {children}
      </body>
    </html>
  );
}
