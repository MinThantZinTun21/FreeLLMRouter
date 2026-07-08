## Context

FreeLLMRouter has two parallel model systems today:

1. **Public catalog** (`free_models`) — synced from OpenRouter, exposed via `/api/v1/models/*`, used by the website and `fma_` API keys.
2. **Bridge router** (`model_catalog_free`) — used by `/api/bridge/v1/*` with `fbr_` keys, populated by scraping freellm.net HTML, with basic 3-hop failover and encrypted `provider_keys`.

The bridge router already records hops, tokens, cooldowns, and quota-reset hints, but lacks unified catalog metadata, discoverability APIs, per-model limit enforcement, complete provider-key UX, and working vision/embeddings catalogs.

## Goals / Non-Goals

**Goals:**

- Single source of truth: bridge catalog synced from `free_models` after each OpenRouter sync.
- List all free models and providers via bridge APIs for client discovery.
- Store per-model RPM, daily request, and daily token limits; track runtime usage and auto-switch when exceeded.
- Admin UI with per-provider official API key inputs, list/revoke, and tenant vs system scope.
- Forward inference to official provider endpoints when a matching provider key exists; fall back to OpenRouter.
- Fix streaming failover and include `quotaResetAt` in candidate ranking.
- Expose routing metadata (`model`, `_bridge` trace) to clients.

**Non-Goals:**

- Billing or paid-tier models.
- Replacing the public `/api/v1/models/*` catalog API.
- Real-time limit polling from provider dashboards (limits are configured + learned from 429 responses).
- Multi-region active-active routing.
- End-user self-service provider key management (admin-only for v1).

## Decisions

### 1. Catalog source: sync from `free_models` (not HTML scrape)

**Decision:** Replace `refreshCatalogFromFreellm()` HTML scrape with `syncBridgeCatalogFromFreeModels()` that reads active rows from `free_models`.

**Rationale:** `free_models` already has context length, max completion tokens, modalities, supported parameters, and provider prefix. One sync pipeline avoids drift.

**Mapping rules:**

- `provider` = first segment of model ID (`openai/gpt-4o-mini` → `openai`)
- `routeType` = `embeddings` if output modality is embedding; `vision` if input includes image; else `chat`
- `supportsTools` = `supported_parameters` includes `tools`
- `supportsJsonMode` = `supported_parameters` includes `response_format` or `structured_outputs`
- `maxContext` = `contextLength`; `maxOutput` = `maxCompletionTokens`
- Default limits seeded from provider registry defaults (see Decision 3)

**Alternative considered:** Keep freellm.net scrape — rejected because metadata is sparse and vision/embeddings never populate.

### 2. Provider registry table

**Decision:** Add `bridge_providers` table with known providers, display name, direct API base URL, and default limit templates.

**Rationale:** Powers provider list API, admin dropdowns, and direct adapter routing without hardcoding in multiple files.

**Initial providers:** `openrouter`, `openai`, `google`, `meta-llama`, `mistralai`, `qwen`, `deepseek`, `groq`, `together`, `cohere` (extensible).

### 3. Per-model limits: configured defaults + runtime counters

**Decision:** Add columns to `model_catalog_free`:

| Column              | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `rpmLimit`          | Max requests/minute for this model (default from provider) |
| `dailyRequestLimit` | Max requests/day per model (nullable = unlimited)          |
| `dailyTokenLimit`   | Max tokens/day per model (nullable = unlimited)            |

Add columns to `model_runtime_state`:

| Column               | Purpose                          |
| -------------------- | -------------------------------- |
| `requestsThisMinute` | Rolling counter, reset every 60s |
| `requestsToday`      | UTC-day counter                  |
| `tokensToday`        | UTC-day token counter            |

**Enforcement:** Before invoking a model, `isModelWithinLimits()` checks configured caps against runtime counters. If exceeded, skip candidate and try next. On upstream `429`, call `applyQuotaResetHint()` and increment failure score (existing behavior).

**Alternative considered:** Tenant-level token caps only — rejected; user explicitly asked per-model limits.

### 4. Auto-switch logic: extend existing router

**Decision:** Keep `MAX_HOPS = 3` but improve candidate filtering:

1. Filter by route type + feature requirements (tools, jsonMode).
2. Exclude models where `isModelWithinLimits()` is false.
3. Exclude models/keys in cooldown or `quotaResetAt` window (ranking + invoke-time check).
4. Rank by health score, then by lowest `tokensToday` usage.
5. On failure (429, 5xx, timeout): record hop, try next.
6. **Fix streaming:** allow failover on first failed hop before returning error (remove early `break` on stream).

**Optional model pinning:** If client sends `model` in payload, try that model first if in catalog and eligible; then fall back to ranked list.

### 5. Provider key forwarding

**Decision:** Resolution order unchanged in `provider-keys.ts` (tenant key → system key). Extend `BridgeAdminTab` with:

- Provider dropdown from `bridge_providers`
- One input per provider section for official API key
- List saved keys (metadata only: provider, name, last4, scope, active)
- Revoke button per key
- Toggle: system vs tenant-scoped

**Forwarding:** Existing `direct.ts` adapter already supports groq, together, deepseek, openai, mistral. Extend registry to map all providers with OpenAI-compatible endpoints. Always try direct adapter when provider key exists; otherwise OpenRouter adapter with openrouter system key.

### 6. New bridge list APIs

**Decision:**

- `GET /api/bridge/v1/models?routeType=chat&provider=openai` — returns active catalog entries with limits and runtime status summary.
- `GET /api/bridge/v1/providers` — returns provider registry with model counts and key-configured flag.

Auth: same `Bearer fbr_` as inference routes (read-only for tenant's visibility).

### 7. Admin catalog browser

**Decision:** Add section to `BridgeAdminTab` showing models grouped by provider with columns: model ID, route type, RPM/daily limits, tokens today, status (healthy/cooldown/limit-reached).

### 8. Chat test page alignment

**Decision:** Update `/chat` to use `/api/bridge/v1/chat` with `fbr_` key input (not `fma_` catalog key). Display routed model from `response.model` or `_bridge.attempts`.

## Risks / Trade-offs

| Risk                                                             | Mitigation                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Provider default limits may be wrong                             | Admin-editable per model; learn from 429 `retry-after`                                |
| Dual catalog still exists (`free_models` + `model_catalog_free`) | Sync job keeps them aligned; long-term merge is out of scope                          |
| Direct provider APIs differ from OpenRouter format               | Limit direct adapter to OpenAI-compatible providers; OpenRouter as universal fallback |
| Runtime counters lost on DB reset                                | Acceptable for v1; counters are soft limits not billing                               |
| Streaming failover adds latency                                  | Cap at 3 hops; return error if all fail                                               |
| Encrypting many provider keys increases attack surface           | Existing AES-256-GCM; admin-only access; keys never returned in API responses         |

## Migration Plan

1. Add DB columns and `bridge_providers` table via Drizzle migration (`db:push`).
2. Seed `bridge_providers` with known providers and default limits.
3. Implement `syncBridgeCatalogFromFreeModels()` and call it after `syncModels()`.
4. Backfill `model_catalog_free` from existing `free_models` rows.
5. Deploy new list APIs and updated router logic.
6. Update admin UI and docs.
7. Deprecate freellm.net HTML scrape (keep as fallback flag for one release).

**Rollback:** Feature-flag new catalog sync; router falls back to existing `model_catalog_free` rows if sync disabled.

## Open Questions

1. Should tenants see only models their provider keys can reach, or full catalog? **Recommended:** full catalog with `keyConfigured` flag per provider.
2. Should per-model limits be admin-editable in UI v1 or config-only? **Recommended:** admin-editable in BridgeAdminTab.
3. Default daily token limit per free model? **Recommended:** 100k tokens/day/model until provider 429 teaches otherwise.
