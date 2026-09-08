# AgentPay

**A universal payment layer for AI agents, built for Binance Agent OS.**

AgentPay brings wallet transfers, Binance Pay, exchange balances, x402 services, approvals, activity, and spending controls into one payment workspace. It is designed to let people and AI agents prepare real payment actions while keeping the user in control of what can happen and where funds can go.

## Why AgentPay

AI agents can understand requests, but payments are fragmented across wallets, exchange accounts, merchant QR codes, and pay-per-call services. AgentPay gives agents one controlled payment layer:

- **One interface** for multiple payment rails.
- **Real provider workflows** instead of simulated payment screens.
- **Clear review before money moves.**
- **Server-side policy enforcement** for destinations, endpoints, spending limits, approvals, and execution.
- **A unified Activity and Reports layer** across every supported rail.

AgentPay is built for the **Binance Agent OS Payment Workflows** track and uses selected capabilities from the [Binance Skills Hub](https://github.com/binance/binance-skills-hub).

## What it includes

### Agentic Wallet

- Binance Wallet pairing and verification.
- Supported chains, addresses, balances, and transaction history.
- Token transfer preparation with network, balance, gas, recipient, and policy validation.
- Separate approval and execution stages.
- Transaction status reconciliation and explorer links.
- x402 preview and signing through the same wallet session.

### Binance Pay

- Inspect supported Binance Pay QR codes, payment links, and PIX payloads.
- Review payee, amount, currency, and limits before payment.
- Confirm and poll Binance Pay orders.
- Generate official Binance Pay receive links.

### Binance portfolio

- Read-only Spot, Funding, USDⓈ-M Futures, Simple Earn, and Margin holdings.
- Independent source health, so one unavailable account source does not hide the others.
- Estimated USD values using public market prices.
- No trading, withdrawal, or account-modification endpoints.

### x402 Services

- Browse a curated catalog or inspect an explicitly supplied endpoint.
- Discover services through bounded web search when configured.
- Validate public HTTPS, supported networks, exact endpoint trust, live HTTP 402 requirements, balance, limits, and expiry.
- Review, approve, sign, replay once, validate the response, and record the result.

### AgentPay Assistant

The Overview Assistant selects one of AgentPay's bundled skills for wallet operations, Binance Pay, Binance portfolio, Activity and Reports, or x402. The deterministic backend remains the authority for validation, policy, approval, signing, execution, persistence, and user-facing results.

## Binance Agent OS and Skills Hub integrations

AgentPay uses the smallest relevant Binance capabilities instead of installing broad trading functionality:

| Capability | How AgentPay uses it | Why it is included |
| --- | --- | --- |
| [Binance Agentic Wallet skill](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet) | Uses the official `@binance/agentic-wallet` package and its `baw` CLI through a server-only adapter. | Provides wallet pairing, chains, balances, transfers, transaction tracking, and x402 wallet operations. |
| [Binance Payment skill](https://github.com/binance/binance-skills-hub/tree/main/skills/binance/payment) | Vendored under `vendor/binance/payment` at a recorded upstream commit and invoked only by the server adapter. | Provides Binance Pay QR/link inspection, payment preparation, receive links, confirmation, and status polling. |
| Binance Agentic Wallet x402 guidance | Adapted into `skills/x402-payment-orchestration` and enforced by AgentPay's deterministic x402 service. | Connects HTTP 402 payments to the existing wallet while preserving exact endpoint trust, review, signing, replay, and result validation. |
| Binance read-only portfolio APIs | Implemented separately with signed read-only requests. | Shows exchange holdings without adding trading or withdrawal capability to the project. |

The vendored Payment skill is kept unmodified. AgentPay places policy, credentials, execution controls, and persistence around it rather than allowing browser code or model output to call payment commands directly. See [`vendor/binance/payment/VENDORED.md`](vendor/binance/payment/VENDORED.md).

## Safety model

Every outgoing payment passes through the server-side sequence:

```text
Input validation
  → trusted destination or endpoint checks
  → balance and network checks
  → spending limits
  → exact review
  → explicit approval
  → signing and execution
  → status reconciliation and Activity
```

Fresh installations are fail-closed. Server capability flags and the Settings payment controls are off by default. Enabling a capability does not authorize a payment: approval, signing, trust, spending-limit, confirmation, and execution checks still apply.

The current deployment is a single-user local integration without an application authentication layer. Do not expose it directly to the public Internet. Use a protected server or container with persistent state for the Agentic Wallet session.

## Quick start

Requirements and the complete setup flow are documented in [`docs/INSTALLATION.md`](docs/INSTALLATION.md).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` after the development server starts. Optional provider setup is described in the installation guide; no credentials are required for the initial build and test run.

## Configuration

Use [`.env.example`](.env.example) as the complete list of supported environment variables. Never commit `.env.local`, provider configuration files, wallet session material, private keys, signatures, or database files.

Important defaults:

```text
AGENTPAY_ENABLE_WALLET_SEND=false
AGENTPAY_ENABLE_BINANCE_PAY=false
AGENTPAY_ENABLE_X402=false
```

The [configuration guide](docs/CONFIGURATION.md) explains optional DeepSeek, Binance Pay, read-only Binance account, x402, and payment-capability setup.

## Verification

```bash
npm run skills:validate
npm run lint
npm run test
npm run build
```

`npm run lint` is the project's TypeScript check. The test suite uses isolated temporary databases and does not require real payment execution.

## Project structure

```text
app/                         Next.js pages, API routes, and UI workflows
lib/                         Domain types, validation, policy, providers, and stores
skills/                      AgentPay skill contracts and references
vendor/binance/payment/      Pinned Binance Payment skill runtime
scripts/                     Safe local setup helpers and skill validation
tests/                       Unit and integration tests
docs/                        Installation, configuration, and architecture guides
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the request flow and provider boundaries.
