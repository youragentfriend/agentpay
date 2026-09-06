---
name: "agentic-wallet-operations"
description: "Use for Binance Agentic Wallet on-chain connection, receiving addresses, supported chains, on-chain token balances, token transfers, and transfer tracking; not Binance exchange portfolio holdings, Binance Pay, x402, or cross-rail activity reports."
---

# AgentPay Agentic Wallet

## Procedure

- **Identify the wallet operation.** Distinguish connection, receiving address, supported chain, on-chain balance, transfer preparation, approval, execution, or transfer tracking. Ask only for missing values and never confuse Agentic Wallet balances with Binance exchange holdings.
- **Use AgentPay APIs.** Read wallet state through AgentPay and let its deterministic backend invoke Binance Agentic Wallet. Never construct direct wallet CLI calls or request wallet credentials in chat.
- **Handle read-only requests directly.** Return exact chain, address, balance, and transaction data from the wallet overview. Read-only requests do not require payment approval.
- **Prepare transfers safely.** Collect the exact asset, positive amount, recipient, network, and optional gas priority. Let AgentPay validate connection, chain, token, address formats, balance, gas balance, USD valuation, trusted destination, and spending limits.
- **Review and confirm.** Show the exact prepared amount, asset, USD estimate when available, network, full recipient, available balance, gas priority, warnings, and expiry. Require explicit confirmation tied to that review; changed details require a new intent.
- **Approve and execute separately.** Let AgentPay record approval, revalidate the intent, check expiry and wallet lock, and submit once only when server execution is enabled. Never bypass a disabled execution setting.
- **Track and record.** Treat a transaction hash as submitted, not confirmed. Refresh status when requested and report `submitted`, `confirmed`, or `failed` precisely. AgentPay persists the lifecycle and synchronizes Activity automatically.

## References

- Read [Authentication](references/authentication.md) for connection and verification behavior.
- Read [Wallet view](references/wallet-view.md) for on-chain addresses, balances, chains, and transactions.
- Read [Send and receive](references/send-and-receive.md) for transfer sequencing.
- Read [Security and persistence](references/security-and-persistence.md) for backend enforcement and lifecycle rules.
