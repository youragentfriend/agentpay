# Security policy

AgentPay handles payment credentials and can submit real mainnet transactions. Treat deployments and configuration as sensitive.

## Never commit

- API keys or secrets;
- wallet pairing/session material;
- private keys or seed phrases;
- payment signatures;
- SQLite databases or provider state files;
- `.env.local` or deployment environment exports.

The repository includes `.env.example` with names and safe defaults only.

## Payment safeguards

- Fresh installs fail closed.
- Payment capabilities are controlled by server flags and Settings controls.
- Approval is mandatory and enforced server-side.
- Trusted wallet destinations, exact x402 endpoints, spending limits, expiry, and provider status are rechecked by the backend.
- A transaction hash is reported as submitted until the provider reports confirmation.
- x402 signatures are not returned to the browser or persisted.

## Deployment warning

The current application is a single-user integration without application authentication. Keep it on a protected server or localhost. Do not expose it directly to the public Internet.

## Reporting a vulnerability

Do not open a public issue containing credentials, private payment data, or an exploitable security detail. Use a private GitHub Security Advisory or contact the repository maintainer through the private channel configured for the repository.
