# AgentPay

**An automated payment layer for AI agents, built on Binance Agent OS.**

AgentPay lets users describe a payment, confirm the exact details, and allow the Assistant to complete supported transactions automatically through one secure workspace. It brings Agentic Wallet transfers, Binance Pay, exchange balances, x402 services, approvals, activity, and spending controls together while keeping the user in control of what can happen and where funds can go.

## Why AgentPay

AI agents are becoming better at making decisions, but they still struggle to take safe, useful action in the real world. Payments are split across wallets, exchange accounts, merchant QR codes, and pay-per-call services, each with different rules and approval steps.

AgentPay turns a simple instruction into a real, controlled, and trackable payment workflow. It gives people and AI agents one place to choose the right payment rail, check the details, approve the exact action, and see what happened afterward:

- **One interface** for multiple payment rails.
- **Real provider workflows** for wallet transfers, Binance Pay, and x402 services.
- **A clear review before money moves**, whether the workflow starts with a form or a conversation.
- **Server-side controls** for destinations, endpoints, balances, spending limits, approvals, and execution.
- **A unified Activity and Reports layer** so every payment can be tracked and understood.

This is the bridge between AI that can recommend an action and AI that can responsibly complete an approved one.

AgentPay is built for the **Binance Agent OS Payment Workflows** track and uses selected capabilities from the [Binance Skills Hub](https://github.com/binance/binance-skills-hub).

## Demo

Watch the AgentPay demo on [YouTube](https://www.youtube.com/watch?v=9M1q2WujYP8).

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

The Overview Assistant is the conversational entry point to AgentPay. It selects one of AgentPay's bundled skills for wallet operations, Binance Pay, Binance portfolio, Activity and Reports, or x402. It is an execution agent, not just a form launcher: for supported payment actions, an explicit confirmation in chat lets the backend approve and execute the prepared action automatically, without a second manual send-button click. The deterministic backend remains the authority for validation, policy, approval, signing, execution, persistence, and user-facing results.

## How AgentPay works

AgentPay supports both direct user workflows and conversational agent workflows. Both use the same server-side payment controls.

### Manual workflow

1. Connect the required Binance account or Agentic Wallet.
2. Choose a payment rail: Binance Pay, Agentic Wallet, or x402 Services.
3. Enter or inspect the payment details.
4. Review the recipient, amount, network, limits, and policy checks.
5. Approve and execute the payment.
6. Track the result in Activity and Reports.

Manual workflows support Binance Pay QR codes, payment links, receive links, Agentic Wallet transfers, x402 service requests, and read-only Binance portfolio inspection.

### AgentPay Assistant workflow

1. The user describes the task in natural language.
2. AgentPay selects the relevant bundled skill.
3. The Assistant gathers any missing information.
4. The backend validates balances, destinations, limits, and payment rules.
5. AgentPay presents the exact action for approval in the conversation.
6. After the user explicitly confirms in chat, the backend approves and executes the supported action automatically.
7. The result is recorded for tracking and reporting.

Conversational automation does not bypass the controls used by the manual workflows. Both paths lead to the same validation, approval, execution, and Activity records; the difference is that the Assistant can carry out a supported action after the user's confirmation without requiring another manual button click.

### Try the Assistant

Open **Overview** and start a new conversation. Use one of these example prompts:

```text
What is my Agentic Wallet USDT balance on BNB Chain?
What is my Binance Spot USDT balance?
Show my recent payment activity.
Show my failed USDT activity this month.
How much did I spend this month?
Give me a breakdown of my spending by payment rail this month.
Create a Binance Pay receive link for 0.01 USDT with the note "AgentPay demo".
Use the verified Nansen Smart Money Netflow service on BNB Chain.
```

For a wallet transfer, the conversation can be completed in stages:

```text
Prepare a transfer.
Send 0.001 USDT to YOUR_APPROVED_ADDRESS
BNB
Confirm
```

The Assistant asks only for missing details, prepares an exact review, and waits for a clear confirmation. After `Confirm`, supported payments are approved and executed automatically through the backend—without another manual send-button click. Replace `YOUR_APPROVED_ADDRESS` with a destination you have verified and trusted. For Binance Pay, paste the real payment link or QR payload when requested. Read-only balance, Activity, and Reports prompts do not move funds.

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

### Security and payment controls

- **Trusted wallet destinations:** when the wallet destination list is configured, transfers are allowed only to approved addresses.
- **Exact x402 endpoint trust:** x402 payments require the exact HTTP method and HTTPS endpoint to be trusted; a trusted host or different path is not enough.
- **Per-payment limits:** each rail can have its own maximum USD value for one payment.
- **Daily limits:** each rail can also have its own daily USD spending limit, calculated from persisted payment activity.
- **Mandatory approval:** every outgoing payment must pass an exact review and explicit approval before signing or execution.
- **Emergency stop:** the master payment switch stops all outgoing payments immediately while keeping read-only, receiving, inspection, Activity, and Reports features available.
- **Independent rail switches:** Agentic Wallet, Binance Pay, and x402 can be enabled or disabled separately.
- **Server-side enforcement:** browser settings and Assistant messages cannot bypass server capability flags, trust checks, balances, limits, approvals, signing, or execution controls.
- **Secret isolation:** provider credentials, wallet sessions, private keys, and payment signatures stay on the server and are never placed in browser code or SQLite activity records.
- **Audit trail:** payment outcomes and statuses are persisted in Activity and used by Reports; preparation states are not treated as completed payments.

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
