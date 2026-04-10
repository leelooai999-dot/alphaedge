export type FeatureStatus = "live" | "coming_soon" | "beta";

export interface PricingFeature {
  key: string;
  name: string;
  status: FeatureStatus;
  notes?: string;
  free: string;
  pro: string;
  premium: string;
  enterprise?: string;
  highlight?: boolean;
}

// Single source of truth for pricing claims.
// Rule: if a feature is not clearly implemented + user-available in production, mark it coming_soon.
export const PRICING_FEATURES: PricingFeature[] = [
  { key: "simulations", name: "Monte Carlo Simulations", status: "live", free: "Unlimited", pro: "Unlimited", premium: "Unlimited", enterprise: "Unlimited" },
  { key: "scenarios", name: "Scenarios", status: "live", free: "Unlimited", pro: "Unlimited", premium: "Unlimited", enterprise: "Unlimited" },
  { key: "events_per_scenario", name: "Events per Scenario", status: "live", free: "2", pro: "Unlimited", premium: "Unlimited", enterprise: "Unlimited", highlight: true },
  { key: "pine_overlays", name: "Pine Script Overlays", status: "live", free: "1", pro: "Unlimited", premium: "Unlimited", enterprise: "Unlimited", highlight: true },
  { key: "pine_export", name: "Pine Script Export", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "ai_debates", name: "AI Character Debates", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "commodity_beta", name: "Commodity Beta Model", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "temporal_event_engine", name: "Temporal Event Engine", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "polymarket_odds", name: "Polymarket Live Odds", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "save_share", name: "Save & Share Scenarios", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "social_feed", name: "Social Features & Feed", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "leaderboard", name: "Leaderboard", status: "live", free: "✓", pro: "✓", premium: "✓", enterprise: "✓" },
  { key: "multi_timeframe", name: "Multi-timeframe Analysis", status: "beta", notes: "Implemented, but still evolving", free: "30d max", pro: "365d", premium: "365d", enterprise: "365d", highlight: true },
  { key: "custom_templates", name: "Custom Event Templates", status: "coming_soon", notes: "Not yet clearly user-available as a polished feature", free: "—", pro: "Coming soon", premium: "Coming soon", enterprise: "Coming soon" },
  { key: "api_access", name: "REST API Access", status: "coming_soon", notes: "Backend foundations exist, but do not market as fully available until auth/docs/limits are ready", free: "—", pro: "—", premium: "Coming soon", enterprise: "Coming soon", highlight: true },
  { key: "priority_support", name: "Priority Support", status: "coming_soon", notes: "Operational promise not yet backed by a clear support workflow", free: "—", pro: "Coming soon", premium: "Coming soon", enterprise: "Coming soon" },
  { key: "white_label", name: "White-label Exports", status: "coming_soon", free: "—", pro: "—", premium: "Coming soon", enterprise: "Coming soon" },
  { key: "priority_queue", name: "Priority Simulation Queue", status: "coming_soon", free: "—", pro: "Coming soon", premium: "Coming soon", enterprise: "Coming soon" },
  { key: "early_access", name: "Early Access to Features", status: "beta", notes: "Badge/points mechanics exist, but program should be described carefully", free: "—", pro: "—", premium: "Beta", enterprise: "Beta" },
  { key: "bulk_sim", name: "Bulk Simulation", status: "coming_soon", free: "—", pro: "—", premium: "—", enterprise: "Coming soon" },
  { key: "webhook_delivery", name: "Webhook Delivery", status: "coming_soon", free: "—", pro: "—", premium: "—", enterprise: "Coming soon" },
  { key: "sla_support", name: "SLA & Dedicated Support", status: "coming_soon", free: "—", pro: "—", premium: "—", enterprise: "Coming soon" },
];
