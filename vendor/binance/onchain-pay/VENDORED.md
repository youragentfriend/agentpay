# Vendored Binance Onchain Pay skill

- Source: `https://github.com/binance/binance-skills-hub/tree/main/skills/binance/onchain-pay`
- Commit: `257d287079cfac7d9a173078fc574e8fd7bbf212`
- Retrieved: 2026-09-07
- Upstream version: `0.1.2`
- License: MIT (`LICENSE.md`)

The upstream files are retained unchanged for provenance and reference. AgentPay does not execute `scripts/sign_and_call.sh`: that helper accepts credentials as process arguments and its JSON-format fallback can repeat a state-changing POST. AgentPay uses a separate server-only TypeScript adapter with protected configuration, bounded requests, strict response parsing, persistence, and execution disabled by default.
