# Feedback + PostHog Security Runbook

## Purpose
Keep the UX improvement loop useful without letting attackers poison decisions, exfiltrate data, or turn telemetry into a liability.

## Threat Model
Primary risks:
- feedback spam / product-roadmap poisoning
- stored XSS in internal review tools
- data leakage from unauthenticated review endpoints
- telemetry overcollection (PII, auth/session secrets)
- unsafe automation from raw user feedback

## Controls Implemented
### API
- feedback read/review endpoints are restricted and must not be exposed publicly
- feedback write endpoints are rate limited in-memory
- feedback payloads are length-limited and normalized
- suspicious feedback is auto-tagged as `spam`
- CORS is restricted to configured frontend origins
- baseline security headers added to API responses

### Storage + Rendering
- feedback text is HTML-escaped before storage
- page/session/category fields are normalized
- emails are validated and invalid values dropped
- admin listing endpoint omits raw email and raw user agent

### PostHog
- all inputs masked by default
- email/password/token/secret-style properties stripped before capture
- session recording disabled on auth, billing, settings, and admin routes
- use `data-sensitive="true"` or class `ph-no-capture` on any sensitive UI block

## Required Environment Variables
- `CORS_ALLOWED_ORIGINS` = comma-separated allowed frontends

Example:
```bash
CORS_ALLOWED_ORIGINS=https://frontend-leeloo-ai.vercel.app,https://montecarloo.com,https://www.montecarloo.com
```

## Operating Policy
### Never auto-ship from one signal
A UX improvement should require at least two of:
- multiple feedback reports
- replay evidence
- funnel drop-off
- error spike
- performance regression
- support/contact repetition

### Treat all feedback as hostile input
- never render as raw HTML
- never pass raw feedback directly into codegen or autonomous implementation prompts
- if AI reviews feedback, wrap it as `UNTRUSTED USER CONTENT`

### Promotion Rules
- `new` -> `triaged` only after duplicate/spam check
- `triaged` -> action item only with corroborating evidence
- `spam` stays excluded from roadmap decisions and analytics summaries

## Next Hardening Steps
1. move rate limiting to Redis / edge instead of in-memory
2. add explicit admin RBAC for feedback review surfaces
3. add CSRF protection if cookie auth is introduced
4. add WAF rules / bot detection at Cloudflare
5. exclude admin/internal domains entirely from PostHog capture
6. add tests for feedback auth, sanitization, and rate limiting
7. build a trust-scored evidence synthesis layer before weekly UX automation

## Safe Weekly UX Review Flow
1. pull authenticated stats
2. exclude `spam`
3. cluster duplicate reports
4. correlate with product analytics and errors
5. create proposal, not direct patch
6. apply only reversible UX changes automatically
7. require review for auth, billing, permissions, infra, or data-flow changes
