# AgentPay

AgentPay is a chat-first payment workflow application for the Binance Agent OS Payment Workflows track.

## Current phase

Phase 2 provides a real, read-only Binance Agentic Wallet integration:

- wallet connection status;
- Binance Wallet pairing and verification;
- supported chains and wallet addresses;
- live balances;
- recent transaction history.

Phase 3A adds a non-executing payment safety workflow:

- natural-language transfer intent parsing;
- structured transfer form;
- live chain, token, and balance validation;
- exact payment review;
- explicit approval with a ten-minute expiry.

Phase 3B adds SQLite persistence, guarded Agentic Wallet execution, transaction-status refresh, and Activity records. Real sends remain disabled by default; set `AGENTPAY_ENABLE_WALLET_SEND=true` only for a controlled test after reviewing the exact intent. A returned transaction hash is recorded as submitted, not confirmed.

Phase 4 adds the official Binance Payment skill as a pinned vendored integration:

- Binance C2C payment links and QR payloads;
- PIX QR payload support;
- QR image upload through the official decoder;
- official Binance receive-link generation;
- payee, amount, currency, and limit review;
- explicit confirmation and status polling;
- SQLite-backed Binance Pay receipts in unified Activity;
- fail-closed credential and execution gates.

Binance Pay requires `PAYMENT_API_KEY` and `PAYMENT_API_SECRET` with payment permissions plus Agent Pay limits configured in the Binance app. Image decoding additionally requires `python3.12-venv` and `libzbar0`; after installing those host packages, run `scripts/setup-binance-payment.sh`.

The dedicated x402 Service Finder has three modes: **Discover with AI**, **Browse Services**, and **Direct Endpoint**. It validates x402 v2 catalog entries for BSC (`eip155:56`), Base (`eip155:8453`), and Solana network IDs. Catalog metadata and AI rankings never authorize a payment: the shared server engine always fetches a fresh live 402, creates a durable prepared intent, and requires separate Review, Approve, and Pay actions before Agentic Wallet signing and one replay. Results, receipts, hashes, and failures are bounded and persisted to SQLite and Activity.

Configure merchant hosts independently with `AGENTPAY_X402_ALLOWED_HOSTS`, then add each exact `METHOD https://host/path` trust rule in Settings. These checks are intentionally separate. Real signing remains disabled unless `AGENTPAY_ENABLE_X402=true`; keep it false for ordinary development.

AI routing uses DeepSeek only and remains server-side through its official OpenAI-compatible chat-completions API. Store `DEEPSEEK_API_KEY` in the deployment secret manager; optionally set `AGENTPAY_DEEPSEEK_MODEL` (default `deepseek-v4-flash`) or `AGENTPAY_DEEPSEEK_BASE_URL`. For a local standalone demo, run `npm run setup:deepseek` in a trusted terminal; it uses hidden input and writes the key to git-ignored `.env.local` with owner-only permissions. The API key is never sent to the browser or stored in SQLite. DeepSeek's standalone API does not provide native web search, so AgentPay performs a bounded key-free DuckDuckGo search and supplies those untrusted results to DeepSeek for grounded x402 evaluation. Set `AGENTPAY_WEB_SEARCH_PROVIDER=duckduckgo` (the default) or disable it with another value; deterministic catalog browsing and direct endpoint workflows remain available without search. Candidate source URLs must match the supplied search results, and AgentPay does not fall back to another model provider.

The Binance menu also provides a separate, server-only read-only account portfolio across Spot, Funding, USDⓈ-M Futures, Simple Earn, and Margin. Run `npm run setup:binance-account` in a trusted host terminal for masked local setup, or configure `BINANCE_READONLY_API_KEY` and `BINANCE_READONLY_API_SECRET` through the production deployment secret manager. Do not reuse Binance Pay credentials. Sources fail independently, USD values are estimates from public Binance market prices, and no trading or withdrawal endpoint is present. See `docs/binance-readonly.md`.

## Local development

```bash
npm install
npm run dev
```

The Agentic Wallet session is held by the server-side `baw` CLI. Never put wallet credentials, session material, private keys, or seed phrases in browser environment variables.

## Verification

```bash
npm run test
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

## Deployment constraint

The wallet API is currently a single-user local integration and has no application authentication layer. Do not expose it publicly yet. The production deployment should use a persistent server/container for the Agentic Wallet session; a stateless frontend host alone is not sufficient for this architecture.
