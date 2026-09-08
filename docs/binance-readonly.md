# Binance Account read-only integration

AgentPay uses a Binance API key that is separate from Binance Pay credentials. It is used only from server routes and only for account visibility.

## Required protected environment values

- `BINANCE_READONLY_API_KEY`
- `BINANCE_READONLY_API_SECRET`
- optional `BINANCE_PORTFOLIO_DUST_USD` (default `0.10`)

Create a dedicated Binance key, enable account reading only, leave trading and withdrawals disabled, and restrict the key to the AgentPay server IP. Never paste these values into chat or a browser form.

For local AgentPay setup, run `npm run setup:binance-account` in a trusted host terminal. The command masks both inputs and saves them to `~/.local/share/agentpay/binance-readonly.json` with file mode `0600`. This is the same server-side configuration area used by the project, but a separate credential record from Binance Pay so the two products can be rotated and disabled independently. Environment variables remain supported for production deployment secret managers.

## Read-only endpoints

The implementation follows the official Binance REST documentation and calls only account-information endpoints:

- Spot account information: `GET /api/v3/account`
  - https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
- Funding Wallet: `POST /sapi/v1/asset/get-funding-asset`
  - https://developers.binance.com/docs/wallet/asset/funding-wallet
- USDⓈ-M Futures balance: `GET /fapi/v3/balance`
  - https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Futures-Account-Balance-V3
- Simple Earn flexible positions: `GET /sapi/v1/simple-earn/flexible/position`
  - https://developers.binance.com/docs/simple_earn/account/Get-Flexible-Product-Position
- Simple Earn locked positions: `GET /sapi/v1/simple-earn/locked/position`
  - https://developers.binance.com/docs/simple_earn/account/Get-Locked-Product-Position
- Cross Margin account details: `GET /sapi/v1/margin/account`
  - https://developers.binance.com/docs/margin_trading/account/Query-Cross-Margin-Account-Details
- Public valuation data: `GET /api/v3/ticker/price`
  - https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints

Signed parameters are percent-encoded before HMAC-SHA256 signing. The API key and secret remain server-only and are never returned by status or portfolio routes.

## Behavior

Each account source is fetched independently. A source denied by account state, IP restriction, geography, or API-key permissions is marked unavailable while other sources remain visible. USD values are estimates based on Binance public ticker prices; assets without a supported direct or derived pair remain visible as unpriced.

The integration deliberately contains no order, trading, transfer, withdrawal, leverage, or recommendation endpoint or UI.
