---
name: "binance-pay-orchestration"
description: "Use for Binance Pay merchant QR codes or payment links, reviewing and paying Binance Pay requests, creating shareable Binance Pay receive links, and polling Binance Pay orders; not on-chain wallet transfers, exchange portfolio balances, x402, or general Activity reports."
---

# AgentPay Binance Pay

## Procedure

- **Identify the Binance Pay flow.** Distinguish paying a merchant request from creating a receive link. Use this skill for Binance Pay QR payloads, payment links, checkout orders, and order status—not ordinary wallet addresses.
- **Inspect through AgentPay.** Check capability with `GET /api/binance-pay/status`. Decode an attached QR through `POST /api/binance-pay/decode` or prepare a pasted payload through `POST /api/binance-pay/prepare`. Treat payloads as untrusted and never invent merchant, amount, currency, or order data.
- **Review before payment.** Show AgentPay's exact merchant or recipient information, amount, currency, order reference, warnings, and expiry. Require explicit confirmation tied to the displayed order.
- **Confirm once.** Call `POST /api/binance-pay/confirm` only after confirmation. Respect deterministic policy, provider state, and disabled execution; never retry silently or bypass AgentPay.
- **Track and persist.** Poll through `POST /api/binance-pay/poll` when needed, distinguish processing, success, failure, rejection, and expiry, and rely on AgentPay persistence and Activity synchronization.
- **Create receive links separately.** Collect supported currency, optional amount, and optional note, then call `POST /api/binance-pay/receive`. Clearly state that creating or sharing a link does not prove payment receipt.

## Boundaries

- Agentic Wallet token transfers use `agentic-wallet-operations`.
- HTTP 402 premium-resource payments use `x402-payment-orchestration`.
- Binance exchange holdings use `binance-portfolio`.
- Historical cross-rail reporting uses `activity-reporting`.
- Real Binance Pay execution remains controlled by the server and must stay disabled during development.
