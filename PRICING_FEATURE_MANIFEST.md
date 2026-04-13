# Pricing Feature Manifest

Purpose: keep monetized feature claims, gating, and implementation aligned.

## How to use
For any paid/marketed feature, track these fields before calling it live.

| Feature | Marketed Status | Intended Tier | Backend Entitlement | Frontend Gate | Production Reachable | Docs/Support Ready | Last Verified | Notes |
|---|---|---:|---|---|---|---|---|---|
| Monte Carlo Simulations | live | free | n/a | n/a | yes | basic | 2026-04-06 | Core product |
| Events per Scenario | live | free/pro/premium/enterprise | partial (`max_events_per_scenario`) | yes | yes | basic | 2026-04-06 | Limit-based entitlement exists |
| Pine Script Overlays | live | free/pro/premium/enterprise | partial (`max_pine_overlays`) | yes | yes | basic | 2026-04-06 | Limit-based entitlement exists |
| Pine Script Export | live | free+ | no dedicated entitlement | no explicit gate found | yes | basic | 2026-04-06 | Needs explicit entitlement if sold harder later |
| AI Character Debates | live | free+ | no dedicated entitlement | no explicit gate found | yes | basic | 2026-04-06 | |
| Polymarket Live Odds | live | free+ | n/a | n/a | yes | basic | 2026-04-06 | |
| Save & Share Scenarios | live | free+ | partial | partial | yes | basic | 2026-04-06 | |
| Social Features & Feed | live | free+ | partial | partial | yes | basic | 2026-04-06 | |
| Leaderboard | live | free+ | n/a | n/a | yes | basic | 2026-04-06 | |
| Multi-timeframe Analysis | beta | broadly available | no clear dedicated entitlement | no enforced plan gate found | yes | limited | 2026-04-13 | Implemented and reachable in production, but pricing should not imply plan-specific range caps until entitlement gating exists |
| Custom Event Templates | coming_soon | premium+/enterprise | no clear entitlement | no clear UI path | unclear | no | 2026-04-06 | Do not market as live yet |
| REST API Access | coming_soon | premium+/enterprise | partial (`api_access`) | no mature product path | unclear | no | 2026-04-06 | Backing exists but product promise not ready |
| Priority Support | coming_soon | pro/premium/enterprise | partial (`priority_support`) | no operational workflow | no | no | 2026-04-06 | Selling this requires real support ops |
| White-label Exports | coming_soon | premium+/enterprise | no | no | unclear | no | 2026-04-06 | |
| Priority Simulation Queue | coming_soon | pro+ | no | no | no | no | 2026-04-06 | |
| Bulk Simulation | coming_soon | enterprise | no | no | no | no | 2026-04-06 | |
| Webhook Delivery | coming_soon | enterprise | no | no | no | no | 2026-04-06 | |
| SLA & Dedicated Support | coming_soon | enterprise | no | no | no | no | 2026-04-06 | Requires ops commitment |

## Promotion rule
A feature cannot move to `live` until all are true:
1. reachable in production
2. intended entitlement/gating exists and works
3. support/docs are good enough for paid users
4. pricing copy does not overstate scope

## Drift rule
If implementation or entitlements regress, downgrade the marketed status instead of leaving stale claims live.
