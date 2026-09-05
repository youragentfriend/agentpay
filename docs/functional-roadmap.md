# AgentPay functional completion roadmap

_Last updated: September 5, 2026_

This roadmap prioritizes incomplete, static, or non-enforced behavior before another UI/UX polish cycle. Every phase includes focused tests while it is built; the later validation phase is a full-system pass, not the first time features are tested.

## Guardrails

- Preserve approval-first execution: prepare, visibly review, explicitly approve, explicitly send.
- Keep ordinary-development execution flags disabled unless Mark authorizes a controlled real test.
- Keep the Binance Account portfolio read-only. Never add trading, withdrawal, leverage, or recommendation controls.
- Reuse the existing payment, Binance Pay, Agentic Wallet, x402, and Activity engines instead of duplicating them in the Assistant.
- Keep the existing user-facing portal and port arrangement.

## Priority 1 — Settings foundation and dynamic identity

Status: **in progress**

- Add persistent SQLite-backed application settings.
- Add a validated Settings API.
- Replace hardcoded `Mark` name and `M` avatar with persisted profile values.
- Make the profile/avatar control navigate to General settings.
- Persist display name, supported display currency, and time zone.
- Keep unsupported currency/theme choices unavailable instead of presenting decorative controls.

Completion: changing the profile in Settings immediately updates the greeting, sidebar profile, and top-bar avatar and survives reload/restart.

## Priority 2 — Rules and approval enforcement

Status: pending

- Keep approval for every payment mandatory and visibly locked on.
- Add persisted per-payment and daily USD limits.
- Add trusted wallet destinations and trusted x402 hosts.
- Enforce policies server-side in prepare/approve/execute paths; never rely on UI-only checks.
- Record policy rejections in normalized Activity.

Completion: rules can be edited, survive restart, and have tests proving every payment rail fails closed when a rule is violated.

## Priority 3 — Connections and diagnostics

Status: pending

- Replace static Agentic Wallet and Binance Pay connection rows with real status data.
- Make Manage actions navigate to the correct workspace.
- Show configured, connected, execution-enabled, dependency, and last-checked states separately.
- Add a real diagnostics API for SQLite, Agentic Wallet, Binance Pay/QR decoder, Binance Account, x402, execution flags, build version, and uptime.

Completion: no connection or diagnostic label is hardcoded as healthy/unhealthy.

## Priority 4 — General settings

Status: pending after Priority 1 foundation

- Persist the currently supported currency and time zone.
- Add only options that affect actual formatting/behavior.
- Defer theme switching until a second tested theme exists.

Completion: every visible General control changes real behavior and survives reload.

## Priority 5 — Activity completion

Status: partially working

Already working: search, status filter, source filter, sort, pagination.

Remaining:

- Expose activity-type, asset, and date-range filters already supported by the backend.
- Add CSV export of the filtered result set.
- Add event detail view.
- Add durable balance snapshots for later portfolio history/reporting.

Completion: users can filter, inspect, and export normalized events without querying providers again.

## Priority 6 — x402 readiness

Status: workflow implemented; production configuration incomplete

- Configure and verify trusted merchant hosts.
- Validate real discovery and purchase flows only under explicit controlled-test authorization.
- Keep execution disabled by default.

Completion: allowlisted hosts can be validated end to end, with failures recorded safely.

## Priority 7 — UI/UX refinement

Status: pending functional completion

- Review every desktop/mobile state.
- Refine loading, empty, partial, error, approval, and success states.
- Remove layout shifts, overflow, clipping, misleading controls, and inaccessible contrast.

Completion: no decorative or dead control remains, and all pages are responsive.

## Priority 8 — Full regression, accessibility, security, and bug validation

Status: pending

- Full workflow regression suite.
- Keyboard and screen-reader checks.
- Security review of API access, secret handling, SSRF boundaries, and payment policies.
- Production deployment/access-control review before any public exposure.

Completion: documented evidence for tests, build, live health, accessibility, and security checks.

## Priority 9 — AgentPay Assistant

Status: deliberately last

- Add durable server-side conversations.
- Add model integration and intent routing.
- Orchestrate existing tools/workflows without duplicating payment logic.
- Add clarification, recovery, idempotency, and structured approval/result cards.
- Never infer destinations, silently retry payments, or bypass explicit approval.

Completion: the Assistant can safely perform supported workflows end to end using stable underlying APIs.
