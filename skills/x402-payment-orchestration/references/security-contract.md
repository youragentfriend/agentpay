# AgentPay x402 security contract

The skill may propose actions, but deterministic AgentPay code must enforce them.

## Endpoint and transport

- Accept public HTTPS URLs only.
- Reject credentials, fragments, custom ports, localhost, private or literal IP addresses, unsafe redirects, oversized requests, and oversized responses.
- Require the exact normalized URL and HTTP method in the user's trusted endpoint settings.
- Never let an LLM or catalog response create trust automatically.

## Payment policy

- Re-read the user's per-payment and daily x402 limits immediately before signing.
- Require a reliable USD valuation when a monetary limit is configured.
- Enforce supported x402 v2 networks: BSC `eip155:56`, Base `eip155:8453`, and supported Solana network IDs.
- Sign only `READY_TO_SIGN` options and preserve the preview's original index.
- Treat insufficient balance, wallet quota, stale preview, and policy uncertainty as fail-closed conditions.

## Confirmation and secrets

- Show the exact service, request, recipient, network, asset, amount, valuation, and expiry before asking whether to proceed.
- A clear confirmation approves only that exact review; questions, ambiguity, silence, or unrelated text do not authorize payment.
- Declining cancels without signing.
- Never store or display API keys, wallet secrets, private keys, seed phrases, payment signatures, or sensitive payment headers.
