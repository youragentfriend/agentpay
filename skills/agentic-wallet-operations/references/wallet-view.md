# Wallet View

Request `GET /api/wallet/overview` for read-only Agentic Wallet information.

- `chains` identifies supported on-chain networks. Never guess a chain identifier.
- `addresses` contains receiving addresses by chain. Show the exact network and full copyable address, and warn the user to use only that network.
- `balances` contains on-chain token balances, token addresses, chain identifiers, and returned USD estimates. Keep duplicate symbols separated by network unless the user asks for a combined summary.
- `transactions` contains recent wallet transaction hashes, times, chains, and statuses. A hash means submission, not confirmation.

These are Binance Agentic Wallet on-chain balances. Do not describe them as Binance Spot, Funding, Futures, Earn, or Margin holdings; those belong to `binance-portfolio`. Read-only requests never require payment approval.
