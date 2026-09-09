# AgentPay installation and replication

This guide has two stages:

1. **Verified core installation:** install AgentPay, run its validation checks, and start the application without provider credentials.
2. **Full workflow setup:** connect the providers and configure only the payment rails you want to use.

The core installation is complete and functional without real funds. Provider credentials are only required for live wallet, Binance Pay, Binance portfolio, Assistant, or x402 data and payment workflows.

## What each setup provides

| Setup | What works after setup |
| --- | --- |
| Core installation | Application UI, bundled skills, validation, tests, production build, read-only pages, and local development server. |
| Agentic Wallet | Wallet connection, chains, addresses, balances, receiving, transfers, and transaction tracking. Outgoing execution remains disabled until explicitly enabled. |
| DeepSeek | AgentPay Assistant skill selection and conversational routing. |
| Binance read-only account | Live Spot, Funding, Futures, Earn, and Margin portfolio data. |
| Binance Pay | Payment-link inspection, receive links, and—after payment credentials and controls are configured—payments. QR image inspection also requires the documented decoder setup. |
| x402 | Service discovery and inspection; payment requires an allowed host, trusted exact endpoint, connected wallet, supported balance, and enabled execution controls. |

Completing only the core installation is a valid working installation. Completing the provider steps is required only for the corresponding live workflows.

## 1. Requirements

Required:

- Linux, macOS, or another environment that can run Node.js and SQLite.
- Node.js **22 or newer**. This project has been verified in the submission workspace with Node.js `24.20.0` and npm `11.19.0`.
- npm.

Optional:

- Python 3 and `python3-venv` for Binance Pay QR image decoding.
- `libzbar0` on Ubuntu/Debian for the `pyzbar` QR decoder.
- Provider credentials for DeepSeek, Binance Pay, or the read-only Binance portfolio.

Check the required tools:

```bash
node --version
npm --version
```

## 2. Install the application

Clone the repository and enter it:

```bash
git clone <your-agentpay-repository-url>
cd agentpay
```

Install the exact locked dependency versions:

```bash
npm ci
```

Create the local environment file:

```bash
cp .env.example .env.local
```

The copied file keeps all payment capabilities disabled. Do not commit `.env.local`.

## 3. Verify the clean installation

Run the same checks used by CI:

```bash
npm run skills:validate
npm run lint
npm run test
npm run build
```

Expected result:

- skill validation succeeds;
- TypeScript reports no errors;
- tests pass using isolated temporary databases;
- the Next.js production build completes.

At this point, the core AgentPay installation is verified. Continue with the provider steps below to reproduce live integrations.

## 4. Start AgentPay

For local development:

```bash
npm run dev
```

Open `http://localhost:3000` in a browser. Stop the server with `Ctrl+C`.

For a production-style local run:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

Keep the server bound to localhost until an application authentication layer and deployment hardening are added.

## 5. Connect the Agentic Wallet

The project installs the official `@binance/agentic-wallet` package with `npm ci` and invokes its local `baw` binary from the server. No wallet private key or seed phrase belongs in `.env.local` or browser code.

1. Start AgentPay.
2. Open **Agentic Wallet**.
3. Select **Connect wallet**.
4. Open the official Binance sign-in page shown by AgentPay.
5. Verify the pairing code in the Binance Wallet app.
6. Select **I approved it** in AgentPay.

The wallet page should then show connection status, chains, addresses, balances, and recent transactions. Receiving and read-only wallet inspection are available after connection. Outgoing transfers remain blocked until the server capability and Settings controls are deliberately enabled in Step 10.

## 6. Configure the AgentPay Assistant

The Assistant requires a server-side DeepSeek key for model routing. This step requires Python 3 because the setup helper is written in Python. Store the key through the hidden-input helper:

```bash
npm run setup:deepseek
```

The helper writes `.env.local` with owner-only permissions and never prints the key. Restart AgentPay after changing it.

The key is never sent to the browser or stored in SQLite.

## 7. Configure the Binance read-only portfolio

This step is required only if live Binance exchange balances are needed. Create a Binance API key restricted to read-only access. Do not enable trading or withdrawals. Then run:

```bash
npm run setup:binance-account
```

The helper prompts without echoing credentials and stores them outside the repository at:

```text
~/.local/share/agentpay/binance-readonly.json
```

The file is created with owner-only permissions. Restart AgentPay, open **Binance**, and refresh the portfolio.

## 8. Configure Binance Pay

This step is required only if Binance Pay workflows are needed. Binance Pay QR image decoding needs Python virtual-environment support and the system QR library. On Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y python3-venv libzbar0
bash scripts/setup-binance-payment.sh
```

The script creates the virtual environment outside the repository at:

```text
~/.local/share/agentpay/payment-venv
```

Payment links and receive-link workflows remain separate from image decoding. Configure Binance Pay credentials only through a protected server environment or the ignored provider configuration. Never commit them.

## 9. Configure x402 Services

x402 discovery and inspection can work without payment execution. An x402 payment requires all of the following:

1. A public HTTPS host in `AGENTPAY_X402_ALLOWED_HOSTS`, comma-separated.
2. The exact `METHOD https://host/path` endpoint trusted in **Settings → Rules & approvals**.
3. A connected Agentic Wallet with a supported network and sufficient balance.
4. A fresh live HTTP 402 response.
5. Review, approval, signing, and payment execution controls.

Catalog browsing and deterministic inspection can remain available while execution is disabled.

## 10. Enable real payment execution only for controlled tests

Keep the defaults off during ordinary development. For a controlled, low-value test only, configure the required server flags in the deployment environment:

```text
AGENTPAY_ENABLE_WALLET_SEND=true
AGENTPAY_ENABLE_BINANCE_PAY=true
AGENTPAY_ENABLE_X402=true
```

Restart the server, then enable the matching master and rail controls in **Settings → Rules & approvals**. Server availability does not automatically authorize spending. AgentPay still requires exact review, approval, trust checks, spending limits, signing, and confirmation.

## 11. Full replication checklist

Use this checklist when reproducing the complete project:

1. `npm run skills:validate` succeeds.
2. `npm run lint` succeeds.
3. `npm run test` reports all tests passing.
4. `npm run build` completes successfully.
5. AgentPay starts and opens at `http://localhost:3000`.
6. **Agentic Wallet** shows a connected status after pairing.
7. **AgentPay Assistant** responds after DeepSeek setup.
8. **Binance** shows portfolio data after read-only account setup.
9. **Binance Pay** can inspect links or generate receive links after its provider setup.
10. **x402 Services** can inspect an allowed endpoint after host and endpoint trust setup.
11. Real payment execution is enabled only for a deliberate, low-value test after reviewing all controls.

If a provider is not configured, AgentPay should show a setup or unavailable state for that provider. This is expected and does not mean the core installation failed.

## Troubleshooting

### Build or tests fail after changing dependencies

```bash
npm ci
npm run lint
npm run test
npm run build
```

### Agentic Wallet is unavailable

- Confirm the app is running on the same persistent server where the local `baw` session exists.
- Reconnect through the Agentic Wallet page.
- Check **Settings → Diagnostics** for a secret-safe status.

### Binance Pay says QR decoding is unavailable

- Confirm `python3 -m venv` works.
- Confirm `libzbar0` is installed on Ubuntu/Debian.
- Run `bash scripts/setup-binance-payment.sh` again.
- Use a supported Binance Pay link while image decoding is being repaired.

### The Assistant is unavailable

- Confirm `DEEPSEEK_API_KEY` exists only in the server environment.
- Restart AgentPay after changing the key.
- Use the manual workflows while the Assistant provider is unavailable.
