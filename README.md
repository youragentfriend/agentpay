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

No transfer, signing, swap, or payment execution endpoint is enabled yet. Approved intents remain in the current server process until the durable receipt store is added.

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
