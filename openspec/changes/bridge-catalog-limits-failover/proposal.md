## Why

The bridge router already exists but its catalog is disconnected from the main `free_models` feed, lacks discoverable model/provider listings, does not enforce per-model rate or token limits, and has incomplete provider-key admin UX. Users need one FreeLLM route that lists all free models, forwards calls through official provider APIs when keys are configured, and automatically switches models when a provider or model hits its limit.

## What Changes

- Unify bridge catalog sync from `free_models` (OpenRouter sync) instead of scraping freellm.net HTML, populating provider, context/output limits, modalities, and route types (chat, vision, embeddings).
- Add `GET /api/bridge/v1/models` and `GET /api/bridge/v1/providers` for clients to discover routable free models and providers.
- Add per-model limit metadata (RPM, daily request cap, daily token cap) stored in `model_catalog_free` and runtime counters in `model_runtime_state`.
- Extend router failover to skip models at RPM/token/request limits and auto-switch to the next healthy candidate (including streaming requests).
- Improve provider key admin: per-provider official API key inputs, list/revoke keys, tenant-scoped vs system keys, and forward calls to official provider endpoints when keys exist.
- Add bridge catalog browser in dashboard admin showing models grouped by provider with limit status.
- Update chat test page to use bridge API (`fbr_` keys) and display selected model from routing trace.

## Capabilities

### New Capabilities

- `bridge-catalog`: Unified free model and provider catalog for bridge routing, synced from `free_models`, with list APIs and admin browser.
- `bridge-limit-failover`: Per-model rate and token limit tracking, enforcement, and automatic model switching when limits are reached.
- `bridge-provider-keys`: Per-provider official API key management (storage, UI, resolution, and direct-provider forwarding).
- `bridge-inference-api`: Bridge inference endpoints (`chat`, `vision`, `embeddings`, `models`, `providers`) with OpenAI-compatible payloads and routing metadata.

### Modified Capabilities

- _(none — no existing OpenSpec specs in repo)_

## Impact

- **Database**: Extend `model_catalog_free` with limit columns; extend `model_runtime_state` with usage counters; optional `bridge_providers` registry table.
- **Bridge core**: `src/bridge/catalog.ts`, `router.ts`, `scoring.ts`, `limits.ts`, `providers/*`.
- **API routes**: New `GET` endpoints under `src/pages/api/bridge/v1/`; extend admin routes for catalog and limit config.
- **Admin UI**: `BridgeAdminTab.tsx` — provider key forms per provider, catalog table, limit status.
- **Sync pipeline**: Hook bridge catalog refresh into existing `syncModels()` or post-sync step.
- **Docs**: Update `docs/API.md` with new bridge list endpoints and limit/failover behavior.
