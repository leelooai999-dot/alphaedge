# Pricing Feature Audit

Last updated: 2026-04-06

## Purpose
Keep pricing claims aligned with what users can actually use in production.

## Status Definitions
- **live**: implemented and user-available now
- **beta**: implemented but still evolving / not fully hardened
- **coming_soon**: planned, partially built, or not clearly production-ready for users yet

## Single Source of Truth
Frontend pricing claims should come from:
- `frontend/lib/pricingFeatures.ts`

Do not hardcode feature claims directly inside `frontend/app/pricing/page.tsx`.

## Current Audit Notes
### Safe to market as live
- Monte Carlo simulations
- scenarios
- event count limits
- Pine overlays
- Pine export
- AI character debates
- commodity beta model
- temporal event engine
- Polymarket live odds
- save/share scenarios
- social feed
- leaderboard

### Safer as beta
- multi-timeframe analysis (implemented and reachable, but not tightly entitlement-gated by plan yet)
- early access program wording

### Safer as coming soon
- custom event templates
- REST API access
- priority support
- white-label exports
- priority simulation queue
- bulk simulation
- webhook delivery
- SLA / dedicated support

## Review Process Before Changing Pricing Claims
For each feature, confirm all 4:
1. implemented in code
2. reachable by users in production
3. gated/entitled correctly for the intended tier
4. documented enough that support/sales won't improvise the promise

If any are missing -> keep `coming_soon` or `beta`

## Recommended Process Improvements
1. keep all pricing features in one registry file with status + notes
2. add a small internal checklist for promoting a feature from `coming_soon` -> `beta` -> `live`
3. tie tier gating to entitlements, not page copy
4. add a recurring audit step to compare pricing registry vs real implementation
5. expose an internal admin view later showing each feature's claimed status vs actual readiness

## Promotion Checklist
### coming_soon -> beta
- core implementation exists
- feature can be reached in production
- major breakages resolved
- entitlement path exists or feature is intentionally ungated

### beta -> live
- production tested
- entitlement/gating stable
- support path exists if sold as paid feature
- docs/help text exist
- analytics show normal usage without major errors
