# Agentic Wallet Authentication

Use AgentPay's wallet API instead of calling the Binance Agentic Wallet CLI directly.

## Connect

1. Request `GET /api/wallet/overview` and continue only when the returned state is understood: `CONNECTED`, `CREATING`, or `UNCONNECTED`.
2. When unconnected, request `POST /api/wallet/connect`. The trusted AgentPay interface renders the official Binance sign-in URL and pairing details.
3. Never copy pairing codes, QR identifiers, session details, or authentication data into LLM messages, logs, or Activity.
4. After the user confirms in Binance Wallet, send the opaque `qrCodeId` returned by AgentPay to `POST /api/wallet/verify`.
5. Keep verification active until it succeeds, fails, or times out, then request the overview again. Treat the wallet as connected only when AgentPay returns `CONNECTED`.

If verification expires or is rejected, do not retry the same identifier. Start a fresh connection. Never request a private key, seed phrase, signature, API secret, session token, pairing code, or QR identifier in chat.
