import { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://alphaedge-api-production.up.railway.app";

type Props = {
  params: { id: string };
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = params.id;
  
  try {
    const res = await fetch(`${API_BASE}/api/scenarios/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error("Not found");
    const scenario = await res.json();
    
    const title = scenario.title || `${scenario.ticker} Scenario`;
    const description = scenario.description || `Monte Carlo simulation for $${scenario.ticker} with ${scenario.events ? JSON.parse(scenario.events).length : 0} events`;
    const ogImageUrl = `${API_BASE}/api/og/${id}`;
    
    return {
      title: `${title} | MonteCarloo`,
      description,
      openGraph: {
        title,
        description,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
        type: "article",
        siteName: "MonteCarloo",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImageUrl],
      },
    };
  } catch {
    return {
      title: "Scenario | MonteCarloo",
      description: "Stock event simulation",
    };
  }
}

export default function ScenarioLayout({ children }: Props) {
  return <>{children}</>;
}
