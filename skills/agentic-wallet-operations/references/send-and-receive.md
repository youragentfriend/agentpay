# Send and Receive

## Receive

Read `GET /api/wallet/overview`, require `CONNECTED`, match the requested network, and return its full address. If multiple networks are possible, ask which one. Receiving creates no payment intent.

## Send

1. Collect asset, exact positive amount, full recipient, network, and optional `LOW`, `MEDIUM`, or `HIGH` gas priority. Do not infer “send all”; AgentPay currently requires an exact amount.
2. Send structured values to `POST /api/payments/prepare`. Preparation validates and stores an expiring intent but sends no funds.
3. Show the exact returned amount, asset, USD value when available, network, full recipient, balance, gas priority, warnings, and expiry.
4. After explicit confirmation, send the intent ID to `POST /api/payments/approve`. Approval does not broadcast funds.
5. Send the approved intent ID to `POST /api/payments/execute`. If execution is disabled, report that nothing was sent and do not use a direct CLI fallback.
6. When a hash is returned, report the transfer as submitted and pending. Use `POST /api/payments/refresh` to distinguish confirmed, failed, and still-pending outcomes.

Binance Agentic Wallet requires the recipient to exist in the user's Binance Wallet address book. If Binance rejects it, direct the user to add it in the Binance Wallet app and prepare a fresh intent.
