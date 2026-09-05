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

Status: **complete**

- Add persistent SQLite-backed application settings.
- Add a validated Settings API.
- Replace hardcoded `Mark` name and `M` avatar with persisted profile values.
- Make the profile/avatar control navigate to General settings.
- Persist display name, supported display currency, and time zone.
- Keep unsupported currency/theme choices unavailable instead of presenting decorative controls.

Completion: changing the profile in Settings immediately updates the greeting, sidebar profile, and top-bar avatar and survives reload/restart.

## Priority 2 — Rules and approval enforcement

Status: **complete — enforcement shipped September 5, 2026**

- Keep approval for every payment mandatory and visibly locked on.
- Add persisted per-payment and daily USD limits.
- Add trusted wallet destinations and trusted x402 hosts.
- Enforce policies server-side in prepare/approve/execute paths; never rely on UI-only checks.
- Record policy rejections in normalized Activity.

Completion: rules can be edited, survive restart, and have tests proving every payment rail fails closed when a rule is violated.

Implemented evidence:

- Mandatory approval is a server-owned constant and cannot be disabled through Settings.
- SQLite migrations persist optional per-payment/daily USD limits, trusted wallet destinations, and trusted x402 hosts.
- A shared server policy evaluator uses wallet price data, Binance USD/stablecoin denominations, and x402 `amountUsd`; configured monetary rules fail closed when reliable USD data is unavailable.
- Agentic Wallet validates at prepare and approval, then revalidates immediately before send. Binance Pay validates prepared/updated orders and revalidates immediately before confirmation. x402 validates discovery options and revalidates the selected option immediately before signing.
- Daily spend is aggregated in UTC across in-flight/completed Agentic Wallet, Binance Pay, and x402 records.
- Automated coverage includes validation, migration/persistence, per-payment and daily limits, trusted destinations/hosts, and all three execution-time guards.

Concrete remaining subtask: add first-class normalized Activity events for policy rejections. Enforcement does not depend on this audit projection and was not weakened to fit it into this phase.

## Priority 3 — Connections and diagnostics

Status: **complete — live diagnostics shipped September 5, 2026**

- Replace static Agentic Wallet and Binance Pay connection rows with real status data.
- Make Manage actions navigate to the correct workspace.
- Show configured, connected, execution-enabled, dependency, and last-checked states separately.
- Add a real diagnostics API for SQLite, Agentic Wallet, Binance Pay/QR decoder, Binance Account, x402, execution flags, build version, and uptime.

Completion: no connection or diagnostic label is hardcoded as healthy/unhealthy.

Implemented evidence:

- `GET /api/diagnostics` returns a typed, secret-safe aggregate of process metadata, SQLite health, Agentic Wallet connection, Binance Pay and QR capability, read-only Binance Account source health, x402 allowlist count, and each execution flag.
- Every external source check is isolated; failures produce partial `unavailable` or `degraded` states without suppressing healthy source results or returning raw provider errors.
- Settings Connections and Diagnostics use the aggregate endpoint with refresh, loading/error handling, a generated-at timestamp, distinct configured/connected/ready/execution-disabled states, and working navigation actions.
- Disabled payment execution remains an intentional safe state rather than a health failure.
- Focused tests cover aggregate mapping, partial-source isolation, response redaction/shape, and status semantics.

## Priority 4 — General settings

Status: **complete — shipped with Priority 1**

- Persist the currently supported currency and time zone.
- Add only options that affect actual formatting/behavior.
- Defer theme switching until a second tested theme exists.

Completion evidence: display name and IANA time zone persist in SQLite and update the live identity/greeting; USD is presented honestly as the only supported valuation currency; no unsupported theme or currency control is interactive.

## Priority 5 — Activity completion

Status: **complete — shipped September 5, 2026**

- Search, status, source, activity-type, asset, date-range, and sort filters with pagination.
- Bounded filtered CSV export using normalized stored events, safe escaping, and spreadsheet-formula neutralization.
- Accessible event detail dialog containing normalized safe fields only.
- Durable manual Agentic Wallet and Binance Account balance snapshots with source-isolated failures and no wallet addresses or credentials.
- First-class idempotent policy-rejection events across Agentic Wallet, Binance Pay, and x402 route boundaries.

Completion evidence: users can filter, inspect, snapshot, and export normalized stored events without executing payments. Automated tests cover filter mapping, CSV safety, snapshot persistence/source isolation, policy-event idempotency/redaction, and existing Activity status semantics.

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
