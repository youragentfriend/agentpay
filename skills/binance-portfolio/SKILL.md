---
name: "binance-portfolio"
description: "Use only for read-only Binance exchange account holdings across Spot, Funding, USDⓈ-M Futures, Simple Earn, and Margin, including source health and estimated USD value; not Agentic Wallet on-chain balances, transfers, Binance Pay, x402, or transaction history reports."
---

# AgentPay Binance Portfolio

## Procedure

- **Recognize exchange holdings.** Use this skill when the user asks about their Binance account portfolio, Spot, Funding, Futures, Earn, Margin, asset allocation, available exchange balance, or estimated exchange account value.
- **Check protected configuration.** Read `GET /api/binance-account/status`. If not configured, direct the operator to the protected read-only setup; never request API credentials in chat or browser forms.
- **Load the portfolio.** Request `GET /api/binance-account/portfolio`. Report connection state, refresh time, source health, balances by source, available and total amounts, and returned USD estimates.
- **Preserve uncertainty.** Keep Spot, Funding, Futures, Earn, and Margin separate. Label unavailable sources and unpriced assets, and never invent prices or count hidden dust as a known zero balance.
- **Remain read-only.** Never trade, transfer, withdraw, convert, subscribe, redeem, or change account settings. This skill produces information only.

## Boundaries

- Agentic Wallet balances are on-chain and use `agentic-wallet-operations`.
- Binance Pay orders and receive links use `binance-pay-orchestration`.
- Past AgentPay transactions and spending reports use `activity-reporting`.
- The API connection must remain read-only and secrets must stay server-side and redacted.
