## 1. Database Schema

- [x] 1.1 Add `bridge_providers` table with provider name, display name, direct base URL, and default limit templates
- [x] 1.2 Add limit columns to `model_catalog_free`: `rpmLimit`, `dailyRequestLimit`, `dailyTokenLimit`
- [x] 1.3 Add usage counter columns to `model_runtime_state`: `requestsThisMinute`, `requestsToday`, `tokensToday`, `minuteWindowStart`
- [x] 1.4 Run `db:push` and seed `bridge_providers` with initial provider list and defaults

## 2. Catalog Sync

- [x] 2.1 Implement `syncBridgeCatalogFromFreeModels()` in `src/bridge/catalog.ts` mapping modalities, tools, json mode, context/output limits
- [x] 2.2 Derive `routeType` (chat/vision/embeddings) and `provider` from `free_models` rows
- [x] 2.3 Hook catalog sync into `syncModels()` post-sync step in `src/services/openrouter.ts`
- [x] 2.4 Backfill existing `model_catalog_free` from current `free_models` on first deploy
- [x] 2.5 Deprecate freellm.net HTML scrape (keep behind env flag `BRIDGE_CATALOG_SCRAPE_FALLBACK`)

## 3. Limit Enforcement & Failover

- [x] 3.1 Implement `isModelWithinLimits()` in `src/bridge/limits.ts` checking RPM, daily request, and daily token caps
- [x] 3.2 Implement `incrementModelUsage()` to update runtime counters after each hop
- [x] 3.3 Update `rankCandidatesByHealth()` to deprioritize `quotaResetAt` and limit-exceeded models
- [x] 3.4 Update `routeRequest()` to filter candidates by limits before invoking
- [x] 3.5 Fix streaming failover: remove early break on first stream failure, retry up to MAX_HOPS
- [x] 3.6 Add optional model pinning: honor client `model` field as first candidate if eligible

## 4. Provider Keys & Direct Forwarding

- [x] 4.1 Extend `bridge_providers` registry usage in `src/bridge/providers/direct.ts` for all OpenAI-compatible providers
- [x] 4.2 Ensure tenant-scoped key resolution works end-to-end in `src/bridge/provider-keys.ts`
- [x] 4.3 Add `GET /api/bridge/admin/provider-keys` list call to BridgeAdminTab UI
- [x] 4.4 Add per-provider key input sections with provider dropdown in BridgeAdminTab
- [x] 4.5 Add revoke key action in BridgeAdminTab wired to `PUT /api/bridge/admin/provider-keys`
- [x] 4.6 Add system vs tenant scope toggle when saving provider keys

## 5. Bridge List APIs

- [x] 5.1 Create `GET /api/bridge/v1/models` with routeType and provider filters, limit metadata, and runtime status
- [x] 5.2 Create `GET /api/bridge/v1/providers` with model counts and `keyConfigured` flag
- [x] 5.3 Add admin endpoint `GET /api/bridge/admin/catalog` for dashboard catalog browser
- [x] 5.4 Add admin endpoint `PUT /api/bridge/admin/catalog/:id` for per-model limit editing

## 6. Admin UI

- [x] 6.1 Add catalog browser section to BridgeAdminTab grouped by provider
- [x] 6.2 Show per-model limits, tokens today, request counts, and status badges
- [x] 6.3 Add inline limit editor for RPM, daily request, and daily token caps
- [x] 6.4 Add provider key list with revoke buttons and last-used timestamp

## 7. Chat Test Page & Docs

- [x] 7.1 Update `/chat` page to use `fbr_` bridge keys and `/api/bridge/v1/chat`
- [x] 7.2 Display routed model from `response.model` or `_bridge.attempts` with debug header
- [x] 7.3 Update `docs/API.md` with new bridge list endpoints, limit behavior, and provider key setup
- [x] 7.4 Document provider official API key configuration per provider in docs

## 8. Tests & Validation

- [x] 8.1 Add tests for catalog sync mapping (chat, vision, embeddings route types)
- [x] 8.2 Add tests for limit enforcement and auto-switch on RPM/token cap exceeded
- [x] 8.3 Add tests for streaming failover across multiple hops
- [x] 8.4 Add tests for provider key resolution (tenant vs system) and direct forwarding
- [x] 8.5 Add tests for `GET /api/bridge/v1/models` and `GET /api/bridge/v1/providers`
- [x] 8.6 Run `npm run build` and manual smoke test on `/chat` with `fbr_` key
