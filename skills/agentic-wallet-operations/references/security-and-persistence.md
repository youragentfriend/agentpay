# Security and Persistence

AgentPay's deterministic backend is the security authority. The skill interprets requests but cannot approve, sign, submit, or override policy.

AgentPay checks wallet connection, positive amount, supported chain, recipient and token formats, token availability, balance, required gas asset, reliable USD valuation when limits require it, mandatory approval, per-payment and daily limits, trusted destination, intent status and expiry, wallet lock, and server execution state. Preparation and execution both enforce current policy.

Preparation, approval, and execution are separate. Any change to amount, asset, token, network, recipient, or gas priority requires a new intent and confirmation. Never reuse an expired intent or submit while the wallet is locked.

Real execution is controlled by `AGENTPAY_ENABLE_WALLET_SEND`; the skill must not change or bypass it.

AgentPay stores states such as `awaiting-approval`, `approved`, `submitting`, `submitted`, `confirmed`, and `failed`, then idempotently projects them into Activity as source `agentic-wallet` and type `transfer`. Do not create duplicate Activity records or store credentials, signatures, pairing information, or private provider data.
