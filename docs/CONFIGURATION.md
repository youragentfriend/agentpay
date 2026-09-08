# AgentPay configuration

Copy `.env.example` to `.env.local` for local development. Environment variables are read by the server only.

## Payment capability flags

These are intentionally disabled in a fresh checkout:

| Variable | Purpose | Default |
| --- | --- | --- |
| `AGENTPAY_ENABLE_WALLET_SEND` | Allows Agentic Wallet transfer execution after all checks pass. | `false` |
| `AGENTPAY_ENABLE_BINANCE_PAY` | Allows outgoing Binance Pay confirmation. | `false` |
| `AGENTPAY_ENABLE_X402` | Allows x402 signing and payment. | `false` |

These server flags are only one layer. The master emergency stop and individual rail switches in **Settings → Rules & approvals** must also be enabled, and every payment still requires exact review, approval, trust, limits, signing, and confirmation.

## Assistant

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | Server-only key for Assistant routing and execution interpretation. |
| `AGENTPAY_DEEPSEEK_MODEL` | Optional DeepSeek model override. |
| `AGENTPAY_DEEPSEEK_BASE_URL` | Optional OpenAI-compatible DeepSeek endpoint override. |
| `AGENTPAY_WEB_SEARCH_PROVIDER` | Optional x402 discovery provider; `duckduckgo` is the built-in key-free adapter. |

Use `npm run setup:deepseek` to enter the key without echoing it. Never use a `NEXT_PUBLIC_` variable for provider credentials.

## Binance Pay

| Variable | Purpose |
| --- | --- |
| `PAYMENT_API_KEY` | Server-only Binance Pay API key. |
| `PAYMENT_API_SECRET` | Server-only Binance Pay API secret. |
| `AGENTPAY_PAYMENT_PYTHON` | Optional path to the Python interpreter created by `scripts/setup-binance-payment.sh`. |

The upstream Payment skill may also use its ignored local configuration file. The application never sends these values to the browser.

## Binance read-only portfolio

| Variable | Purpose |
| --- | --- |
| `BINANCE_READONLY_API_KEY` | Binance API key restricted to read-only permissions. |
| `BINANCE_READONLY_API_SECRET` | Matching secret for the read-only key. |
| `BINANCE_PORTFOLIO_DUST_USD` | Optional display threshold for very small holdings. |
| `AGENTPAY_BINANCE_READONLY_CONFIG` | Optional protected-file path for the read-only credentials. |

Prefer `npm run setup:binance-account`, which stores credentials outside the repository with mode `0600`. Do not enable trading or withdrawals on this key.

## x402

| Variable | Purpose |
| --- | --- |
| `AGENTPAY_X402_ALLOWED_HOSTS` | Comma-separated public HTTPS hostnames that the server may inspect. |
| `AGENTPAY_X402_BAZAAR_URLS` | Optional configured discovery directory URLs. |

The server allowlist and the exact endpoint trust rule in Settings are independent checks. Search results never create trust automatically.

## Persistence

| Variable | Purpose |
| --- | --- |
| `AGENTPAY_DB_PATH` | Optional absolute SQLite path. Use a persistent path in deployment. |

The default database is `data/agentpay.sqlite`. Database files are ignored by Git and should be backed up using the deployment provider's protected storage process.
