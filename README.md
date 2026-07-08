# Free LLM Router

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

Open-source app for discovering healthy free OpenRouter models, with a dashboard for configuration and docs-driven SDK usage.

Availability source of truth:

- Current free-model status is based on the OpenRouter `/api/v1/models` feed.
- In this app, `provider/model:free` and `provider/model` are treated as distinct model IDs.
- Availability history means "last seen as free in the OpenRouter API feed", not "OpenRouter website page currently says Free".

## Quick Start (SDK + Dashboard)

1. Sign in at [freellmrouter.com/dashboard](https://freellmrouter.com/dashboard).
2. Create an API key and configure your model preferences in the dashboard.
3. Open [freellmrouter.com/docs](https://freellmrouter.com/docs) and follow the SDK/helper integration pattern.
4. Use the configured model IDs in your app via OpenRouter.

If you need raw HTTP details, the API is available under `/api/...` (full reference in docs).

## What You Get

- Live-updated free model discovery
- Health and availability signals
- Feedback ingestion to improve reliability rankings
- Per-key saved preferences from the dashboard

## Self-Hosting (Simple Path)

For self-hosting, keep README setup minimal, then use your own deployed docs as the source of truth.

### 1) Install

```bash
bun install
cp .env.example .env
```

### 2) Configure env

Set the required values in `.env` (Neon database + auth). Start with `.env.example`.

Analytics notes:

- Google Analytics uses `PUBLIC_GA_MEASUREMENT_ID` (for example `G-XXXXXXXXXX`).
- Because production/staging deploys are built in GitHub Actions, set this value in your GitHub Environment secrets (not only in Cloudflare dashboard variables) so it is available during `bun run build`.
- PostHog uses `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST`.

### 3) Run/deploy

```bash
bun run db:push
bun run dev
```

Local app: `http://localhost:4321`

After deploying, use your own docs page for integration and operations:

- `https://<your-domain>/docs`

That docs page covers API endpoints, query params, auth header format, SDK examples, and admin/ops routes.

## Core Scripts

- `bun run dev`
- `bun run build`
- `bun run preview`
- `bun run test`
- `bun run db:push`

For all other scripts and operational details, use the docs page.

## More Docs

- Hosted docs: [freellmrouter.com/docs](https://freellmrouter.com/docs)
- Availability semantics: [docs/AVAILABILITY.md](docs/AVAILABILITY.md)
- DB slot switch checklist: [docs/DB_SLOT_SWITCH_CHECKLIST.md](docs/DB_SLOT_SWITCH_CHECKLIST.md)
- RLS setup details: [docs/DATABASE_RLS.md](docs/DATABASE_RLS.md)
- Optional SQL for RLS roles/policies: [scripts/db-migration/enable_rls.sql](scripts/db-migration/enable_rls.sql)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT - see [LICENSE](LICENSE).
