# Contributing to AgentPay

## Development setup

Follow [`docs/INSTALLATION.md`](docs/INSTALLATION.md), then run:

```bash
npm run skills:validate
npm run lint
npm run test
npm run build
```

## Payment changes

Do not use real funds in automated tests. Keep payment capability flags disabled and use isolated temporary databases. Any payment change must preserve server-side validation, approval, trust, spending-limit, signing, execution, persistence, and Activity checks.

## Pull requests

Describe the user-visible behavior, affected payment rail, tests run, and any configuration changes. Never include credentials, provider state, databases, or private wallet data in a pull request.
