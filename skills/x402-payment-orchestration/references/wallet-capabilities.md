# Wallet capability boundary

AgentPay reuses one shared Agentic Wallet adapter, but keeps workflows separate.

## Shared adapter

- Wallet authentication and session checks
- Address and balance reads
- Supported chain and network information
- Transaction status polling
- Safe CLI invocation and redacted errors
- x402 preview and x402 signing

## Separate workflows

- Wallet operations handle balances, send, receive, and direct transfer policy.
- x402 orchestration handles catalog discovery, service inputs, HTTP 402, payment options, endpoint trust, replay, result delivery, and Activity.
- A wallet send must never be used as a substitute for an x402 purchase.
- Binance read-only account credentials are for portfolio visibility only and cannot sign wallet or x402 operations.
