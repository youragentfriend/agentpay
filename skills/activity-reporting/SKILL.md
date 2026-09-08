---
name: "activity-reporting"
description: "Use for persisted AgentPay transaction history, status searches, date or asset filters, cross-rail spending summaries, and reports across Agentic Wallet, Binance Pay, and x402; not current wallet or exchange balances and never to initiate a payment."
---

# AgentPay Activity Reporting

## Procedure

- **Interpret the report request.** Determine the requested source, activity type, status group, asset, date range, search text, ordering, page, and limit. Ask only when ambiguity changes the result.
- **Query persisted Activity.** Use `GET /api/payments/activity` with supported filters. Activity covers `agentic-wallet`, `binance-pay`, and `x402`, and normalizes their statuses without changing source records.
- **Summarize accurately.** Report matching count, amounts and assets, source, normalized status, time range, and safely shortened references. Separate unlike assets unless a reliable common USD value exists; never add raw token amounts across different assets.
- **Explain lifecycle states.** Distinguish awaiting approval, in progress, successful, and failed. A submitted wallet transfer or processing Binance Pay order is not yet successful.
- **Protect data.** Use only safe Activity fields and never expose credentials, signatures, payment payload secrets, pairing data, or full confidential provider responses.
- **Remain read-only.** This skill searches and summarizes persisted records. It never prepares, approves, retries, or executes a payment.

## Boundaries

- Current Agentic Wallet balances and addresses use `agentic-wallet-operations`.
- Current Binance exchange holdings use `binance-portfolio`.
- A new Binance Pay flow uses `binance-pay-orchestration`.
- A new premium HTTP resource purchase uses `x402-payment-orchestration`.
