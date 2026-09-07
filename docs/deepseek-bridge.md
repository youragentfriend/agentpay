# AgentPay OpenClaw DeepSeek bridge

## Runtime contract

AgentPay is a standalone Next.js service on `127.0.0.1:3001`. It does not receive or resolve `DEEPSEEK_API_KEY`. Each model request writes a mode-0600 temporary prompt, invokes the local OpenClaw CLI through the running Gateway, targets the isolated `agentpay-bridge` agent, validates the returned provider/model/fallback receipt, then deletes the temporary directory.

The OpenClaw side is intentionally narrow:

- official pinned plugin: `@openclaw/deepseek-provider@2026.8.2`;
- provider API key: `{ source: "store", provider: "default", id: "DEEPSEEK_API_KEY" }`;
- provider host: `https://api.deepseek.com`;
- model: `deepseek/deepseek-v4-flash`;
- isolated agent: `agentpay-bridge`;
- fallback list: empty;
- model allowlist: only `deepseek/deepseek-v4-flash`;
- tool profile: `minimal`;
- skills: empty.

The protected store entry is independently restricted to exact host `api.deepseek.com`. The global OpenAI defaults and the `main` agent's OpenAI fallback remain unchanged.

Optional application settings:

- `AGENTPAY_OPENCLAW_BIN` — OpenClaw executable; defaults to `/home/ubuntu/.npm-global/bin/openclaw` on this deployment.
- `AGENTPAY_OPENCLAW_AGENT` — bridge agent id; defaults to `agentpay-bridge`.
- `AGENTPAY_DEEPSEEK_MODEL` — provider model id; defaults to `deepseek-v4-flash`.
- `AGENTPAY_DEEPSEEK_BRIDGE_ENABLED=false` — disables model routing fail-closed.

Payment execution gates remain independent and default off: `AGENTPAY_ENABLE_WALLET_SEND=false`, `AGENTPAY_ENABLE_BINANCE_PAY=false`, and `AGENTPAY_ENABLE_X402=false`.

## x402 discovery limitation

The installed official DeepSeek provider exposes text inference through OpenAI-compatible completions but does not expose a native web-search tool. OpenClaw's native `web_search` request injection is OpenAI-specific. AgentPay therefore rejects live x402 discovery before inference and makes no fallback request. Catalog browsing and direct, user-supplied endpoint inspection remain deterministic and available.

## Verification

```bash
openclaw plugins inspect deepseek
openclaw models list --provider deepseek
openclaw config validate
npm run test
npm run lint
npm run skills:validate
npm run build
curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:33785/
```

A live Overview request must report `provider=deepseek`, `model=deepseek-v4-flash`, and `fallbackUsed=false` in the OpenClaw terminal receipt. A live x402 discovery request must return the documented native-search blocker without a provider call.

## Rollback

1. Revert the AgentPay bridge commit and rebuild the app.
2. Restart only `agentpay.service`.
3. Remove the isolated agent with `openclaw agents delete agentpay-bridge` after confirming no app process still targets it.
4. Remove the DeepSeek provider config/plugin only if no other OpenClaw surface uses it: `openclaw plugins uninstall deepseek`.
5. Leave the protected store entry in place unless the operator explicitly decides to soft-delete it through OpenClaw Secrets.

Rollback does not require changing `agentpay-front.socket`, `agentpay-compat.socket`, their proxy services, the Gateway's OpenAI defaults, heartbeat configuration, or `tools.exec.notifyOnExit`.
