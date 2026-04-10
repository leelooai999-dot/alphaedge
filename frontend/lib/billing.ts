import { PRICING_FEATURES, type FeatureStatus } from "./pricingFeatures";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export interface BillingTierResponse {
  tier: string;
  limits: {
    max_events_per_scenario?: number;
    max_pine_overlays?: number;
    can_export_pine?: boolean;
    api_access?: boolean;
    priority_support?: boolean;
    enterprise_features?: boolean;
  };
  entitlements?: Record<string, unknown>;
}

export async function fetchBillingTier(): Promise<BillingTierResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("alphaedge_token") : null;
  const res = await fetch(`${API_BASE}/api/billing/tier`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    return { tier: "free", limits: { max_events_per_scenario: 2, max_pine_overlays: 1 } };
  }
  const data = await res.json();
  return {
    tier: data.tier || "free",
    limits: data.limits || {},
    entitlements: data.entitlements || {},
  };
}

export function getFeatureStatus(key: string): FeatureStatus {
  return PRICING_FEATURES.find((f) => f.key === key)?.status || "coming_soon";
}

export function isFeatureLive(key: string): boolean {
  return getFeatureStatus(key) === "live";
}

export function getUpgradeCopy(reason: "events" | "pine", maxAllowed: number): string {
  if (reason === "events") {
    return `Free accounts can add up to ${maxAllowed} events per scenario. Upgrade to Pro for higher limits.`;
  }
  return `Free accounts can use ${maxAllowed} Pine Script overlay. Upgrade to Pro for higher limits.`;
}
