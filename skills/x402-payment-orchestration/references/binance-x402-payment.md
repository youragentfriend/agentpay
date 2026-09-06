# Binance x402 payment contract

This is an AgentPay adaptation of Binance Agentic Wallet's published x402 guidance. The published source remains authoritative and must be checked when the wallet skill changes:

- https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet
- https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/x402-payment.md
- https://developers.binance.com/en/docs/llms-full.txt

## Required sequence

1. Let the LLM agent propose an exact service endpoint from live web search or the user's pasted endpoint; do not treat the proposal as trusted.
2. After deterministic endpoint and method trust pass, send the exact service request without payment and require HTTP 402.
3. Pass the bounded `PAYMENT-REQUIRED` value to `baw x402-payment preview`.
4. Treat the preview as the source of truth for payment ID, option index, asset, network, amount, recipient, readiness, approvals, and expiry.
5. Select only a preview option reported as `READY_TO_SIGN` and retain its original 1-based index.
6. Obtain the user's natural-language confirmation for the exact review before signing.
7. Call `baw x402-payment sign` once. Never expose or persist the returned payment signature.
8. If the signature requires an approval transaction, wait for confirmation before replay.
9. Replay the original method, URL, and body once with `PAYMENT-SIGNATURE`.
10. Read bounded settlement metadata from `PAYMENT-RESPONSE`, then validate and deliver the result.

## Invariants

- Payment signatures are single-use and expire; an expired flow requires a fresh request and preview.
- Never change the resource, method, body, option, token, or network after confirmation.
- Never silently retry a paid request or substitute another service.
- Binance wallet authentication and signing credentials are separate from Binance read-only account credentials and LLM provider credentials.
