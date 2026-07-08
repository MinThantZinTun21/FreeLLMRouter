# API Reference

HTTP API documentation for **Free LLM Router**. This covers the public model catalog, health/availability endpoints, the bridge router, dashboard auth APIs, and admin utilities.

## Base URLs

| Environment  | Base URL                             |
| ------------ | ------------------------------------ |
| Production   | `https://freellmrouter.com`          |
| Vercel alias | `https://free-llm-router.vercel.app` |
| Local dev    | `http://localhost:4321`              |

All paths below are relative to the base URL (e.g. `GET /api/v1/models/ids`).

## Authentication Overview

| API group                                       | Auth method                                | Notes                                                               |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Model catalog (`/api/v1/models/*`)              | Optional `Authorization: Bearer <api_key>` | Public without a key; key enables saved preferences and `myReports` |
| Health / availability                           | None (optional key for `myReports`)        | Public community data by default                                    |
| Bridge router (`/api/bridge/v1/*`)              | Required `Authorization: Bearer fbr_...`   | Per-tenant bridge API keys                                          |
| Bridge admin (`/api/bridge/admin/*`)            | Dashboard session cookie                   | Requires signed-in admin session                                    |
| Dashboard auth (`/api/auth/*`)                  | Session cookie                             | Better Auth session from `/login`                                   |
| Model feedback (`POST /api/v1/models/feedback`) | Required API key                           | Does not count toward rate limit                                    |
| Site admin (`/api/admin/*`)                     | `X-Admin-Secret` header                    | Server-side secret (`ADMIN_SECRET`)                                 |

### Common headers

| Header                           | Used by                   | Description                             |
| -------------------------------- | ------------------------- | --------------------------------------- |
| `Authorization: Bearer <token>`  | Catalog, bridge, feedback | API key or bridge key                   |
| `x-bridge-debug: 1`              | Bridge router             | Include routing trace in JSON responses |
| `X-Admin-Secret`                 | `/api/admin/*`            | Admin operations secret                 |
| `Content-Type: application/json` | POST/PUT bodies           | Required for JSON endpoints             |

### CORS

Catalog model endpoints (`/api/v1/models/*`) support CORS for all origins and respond to `OPTIONS` preflight. Most other endpoints do not enable broad CORS.

---

## Public Model Catalog

Discover free LLM models synced from OpenRouter. Data is filtered, sorted, and enriched with community reliability signals.

### `GET /api/v1/models/full`

Returns full model objects with metadata and feedback counts.

**Auth:** Optional. Without a key, returns public community data. With a valid API key, saved dashboard preferences may apply as defaults.

**Query parameters**

| Param             | Type    | Default   | Description                                                                    |
| ----------------- | ------- | --------- | ------------------------------------------------------------------------------ |
| `useCase`         | string  | —         | Comma-separated filters: `chat`, `vision`, `tools`, `longContext`, `reasoning` |
| `sort`            | string  | `capable` | `contextLength`, `maxOutput`, `capable`, `leastIssues`, `newest`               |
| `topN`            | number  | —         | Limit results after filtering                                                  |
| `maxErrorRate`    | number  | —         | Keep models with error rate ≤ value (0–100)                                    |
| `timeRange`       | string  | `24h`     | Feedback window: `15m`, `30m`, `1h`, `6h`, `24h`, `7d`, `30d`, `all`           |
| `myReports`       | boolean | `false`   | Filter to your own feedback (requires API key)                                 |
| `excludeModelIds` | string  | —         | Comma-separated model IDs to exclude                                           |

**Response `200`**

```json
{
  "models": [
    /* OpenRouter-style model objects */
  ],
  "feedbackCounts": {
    "provider/model": { "errorRate": 12.5 }
  },
  "lastUpdated": "2026-07-08T12:00:00.000Z",
  "sort": "capable",
  "count": 27,
  "_meta": { "stale": false }
}
```

**Response headers**

- `Cache-Control: public, max-age=60`
- `X-Data-Stale: true` and `X-Data-Age-Seconds` when catalog data is stale

**Errors**

| Status | Body                                    |
| ------ | --------------------------------------- |
| `500`  | `{ "error": "Failed to fetch models" }` |

**Example**

```bash
curl "https://freellmrouter.com/api/v1/models/full?useCase=chat&sort=leastIssues&topN=10"
```

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://freellmrouter.com/api/v1/models/full?myReports=true"
```

---

### `GET /api/v1/models/ids`

Lightweight variant returning only model IDs (no full objects or feedback counts in the body).

**Auth:** Optional (same as `/full`).

**Query parameters:** Same as `/api/v1/models/full`.

**Response `200`**

```json
{
  "ids": ["meta-llama/llama-3.3-70b-instruct:free"],
  "count": 27,
  "requestId": "optional-when-authenticated",
  "_meta": { "stale": false }
}
```

**Example**

```bash
curl "https://freellmrouter.com/api/v1/models/ids?useCase=chat&topN=5"
```

---

### `POST /api/v1/models/feedback`

Submit success or issue reports for a model. **Requires API key.** Does not count toward your API rate limit.

**Auth:** Required — `Authorization: Bearer <api_key>`

**Request body**

```json
{
  "modelId": "provider/model",
  "success": true
}
```

Or for an issue report:

```json
{
  "modelId": "provider/model",
  "issue": "rate_limited",
  "details": "optional text",
  "requestId": "optional-linked-request-id",
  "dryRun": false
}
```

| Field       | Required            | Description                                    |
| ----------- | ------------------- | ---------------------------------------------- |
| `modelId`   | Yes                 | Model identifier                               |
| `success`   | For success reports | `true` — mutually exclusive with `issue`       |
| `issue`     | For issue reports   | One of: `rate_limited`, `unavailable`, `error` |
| `details`   | No                  | Free-text details                              |
| `requestId` | No                  | Link to a prior API request log ID             |
| `dryRun`    | No                  | If `true`, validates but skips DB write        |

**Response `200`**

```json
{ "received": true }
```

**Errors**

| Status | Body                                                                 |
| ------ | -------------------------------------------------------------------- |
| `400`  | Missing/invalid `modelId`, `issue`, or conflicting `success`+`issue` |
| `401`  | Missing/invalid API key or user context                              |
| `500`  | `{ "error": "Failed to submit feedback" }`                           |

**Example**

```bash
curl -X POST "https://freellmrouter.com/api/v1/models/feedback" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"modelId":"meta-llama/llama-3.3-70b-instruct:free","issue":"rate_limited"}'
```

---

## Health & Availability

### `GET /api/health`

Community health data for the health page and dashboard charts.

**Auth:** None. `myReports=true` optionally filters to your reports when a valid API key is provided.

**Query parameters**

| Param          | Type    | Default | Description                                  |
| -------------- | ------- | ------- | -------------------------------------------- |
| `range`        | string  | `24h`   | `15m`, `30m`, `1h`, `6h`, `24h`, `7d`, `30d` |
| `myReports`    | boolean | `false` | Filter to authenticated user's reports       |
| `useCases`     | string  | —       | Comma-separated use case filters             |
| `sort`         | string  | —       | Sort order (same values as catalog)          |
| `topN`         | number  | —       | Limit issue list                             |
| `maxErrorRate` | number  | —       | Filter by max error rate                     |

**Response `200`**

```json
{
  "issues": [
    {
      "modelId": "provider/model",
      "modelName": "Model Name",
      "errorRate": 5.2
    }
  ],
  "timeline": [{ "date": "2026-07-08", "provider/model": 5.2 }],
  "range": "24h",
  "lastUpdated": "2026-07-08T12:00:00.000Z",
  "count": 10
}
```

**Example**

```bash
curl "https://freellmrouter.com/api/health?range=7d&useCases=chat&topN=20"
```

---

### `GET /api/availability`

Daily availability history snapshots for models (last seen as free in the OpenRouter feed).

**Auth:** None.

**Query parameters**

| Param      | Type   | Default | Description                                     |
| ---------- | ------ | ------- | ----------------------------------------------- |
| `days`     | number | `90`    | History length (1–90)                           |
| `useCases` | string | —       | Comma-separated use case filters                |
| `sort`     | string | —       | `contextLength`, `maxOutput`, `capable`, `name` |

**Response `200`**

```json
{
  "models": [
    /* per-model availability grid */
  ],
  "dates": ["2026-07-01", "2026-07-02"],
  "lastUpdated": "2026-07-08T12:00:00.000Z",
  "count": 27
}
```

**Errors**

| Status | Code             | Description             |
| ------ | ---------------- | ----------------------- |
| `500`  | `CONFIG_ERROR`   | Database not configured |
| `500`  | `INTERNAL_ERROR` | Fetch failed            |

**Example**

```bash
curl "https://freellmrouter.com/api/availability?days=30&useCases=chat"
```

---

## Bridge Router

Auto-routing proxy that selects free models from the bridge catalog, fails over across providers (up to 3 hops), and tracks usage per tenant.

Bridge API keys are prefixed with `fbr_` and issued via the bridge admin console (dashboard → Bridge tab).

### Shared behavior

- **Auth:** `Authorization: Bearer fbr_...` (required)
- **Debug:** `x-bridge-debug: 1` adds `_bridge` routing trace to JSON responses
- **Tenant limits:** Per-tenant RPM and daily request caps per route type (`429` with `RPM_LIMIT` or `DAILY_LIMIT`)
- **Per-model limits:** Each catalog model has `rpmLimit`, `dailyRequestLimit` (nullable = unlimited), and `dailyTokenLimit`. Runtime counters (`requestsThisMinute`, `requestsToday`, `tokensToday`) are tracked per model in UTC windows.
- **Auto-switch:** Models at or over configured limits are skipped during candidate selection. On upstream `429`, the router records a quota-reset hint and tries the next eligible model. Streaming requests fail over across hops the same as non-streaming (up to 3 attempts).
- **Failover:** Up to 3 hops; models in cooldown or active `quotaResetAt` windows are deprioritized or skipped
- **Model pinning:** Include `model` in inference payloads to try that catalog entry first when eligible, then fall back to ranked candidates
- **Catalog:** Models synced from active `free_models` rows after each OpenRouter sync (admin `sync-catalog` also available). Default per-model limits are seeded from the `bridge_providers` registry.
- **Provider keys:** When an official provider API key is configured, inference is forwarded to that provider's direct endpoint; otherwise the OpenRouter adapter is used with the system OpenRouter key

### Bridge error codes

| Code              | Status | Meaning                                            |
| ----------------- | ------ | -------------------------------------------------- |
| `UNAUTHORIZED`    | `401`  | Missing or invalid bridge API key                  |
| `RPM_LIMIT`       | `429`  | Tenant exceeded requests-per-minute for route type |
| `DAILY_LIMIT`     | `429`  | Tenant exceeded daily request cap                  |
| `NO_MODELS`       | `503`  | No eligible models in catalog                      |
| `NO_PROVIDER_KEY` | `503`  | No active upstream provider key configured         |
| `COOLDOWN`        | `503`  | Provider key/model in cooldown                     |
| `RATE_LIMIT`      | varies | Upstream provider rate limit                       |
| `ROUTING_FAILED`  | `503`  | All failover attempts failed                       |

---

### `POST /api/bridge/v1/chat`

OpenAI-compatible chat completions routed through the bridge.

**Request body**

```json
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": false,
  "tools": [],
  "response_format": { "type": "json_object" }
}
```

| Field      | Required | Description                                                   |
| ---------- | -------- | ------------------------------------------------------------- |
| `messages` | Yes      | Non-empty array; roles: `system`, `user`, `assistant`, `tool` |
| `stream`   | No       | If `true`, returns SSE stream (`text/event-stream`)           |
| `tools`    | No       | Enables tool-capable model filtering when non-empty           |
| `model`    | No       | Pin routing to this catalog `modelId` when eligible           |

**Response `200` (non-streaming):** OpenAI-style chat completion JSON from the upstream provider.

**Response `200` (streaming):** Server-sent events stream passthrough.

**Example**

```bash
curl -X POST "https://freellmrouter.com/api/bridge/v1/chat" \
  -H "Authorization: Bearer fbr_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hi in one word"}]}'
```

```bash
curl -X POST "https://freellmrouter.com/api/bridge/v1/chat" \
  -H "Authorization: Bearer fbr_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

---

### `POST /api/bridge/v1/vision`

Multimodal chat for image inputs. Payload is routed as a vision request; messages must include at least one `image_url` part.

**Request body**

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What is in this image?" },
        { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
      ]
    }
  ],
  "max_tokens": 1024
}
```

**Response:** OpenAI-style completion JSON (or error object with `code`).

**Example**

```bash
curl -X POST "https://freellmrouter.com/api/bridge/v1/vision" \
  -H "Authorization: Bearer fbr_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":[{"type":"text","text":"Describe"},{"type":"image_url","image_url":{"url":"https://example.com/a.png"}}]}]}'
```

---

### `POST /api/bridge/v1/embeddings`

OpenAI-compatible embeddings endpoint.

**Request body**

```json
{
  "input": "The food was delicious.",
  "dimensions": 1536
}
```

| Field        | Required | Description                   |
| ------------ | -------- | ----------------------------- |
| `input`      | Yes      | String or array of strings    |
| `dimensions` | No       | Optional embedding dimensions |

**Response:** OpenAI-style embeddings JSON from upstream.

**Example**

```bash
curl -X POST "https://freellmrouter.com/api/bridge/v1/embeddings" \
  -H "Authorization: Bearer fbr_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":["hello world","goodbye world"]}'
```

---

### `GET /api/bridge/v1/models`

List active bridge catalog models with configured limits, current usage, and availability status. Use this to discover routable free models before calling inference endpoints.

**Auth:** Required — `Authorization: Bearer fbr_...`

**Query parameters**

| Param       | Type   | Description                                           |
| ----------- | ------ | ----------------------------------------------------- |
| `routeType` | string | Filter by route: `chat`, `vision`, or `embeddings`    |
| `provider`  | string | Filter by provider slug (e.g. `openai`, `meta-llama`) |

**Response `200`**

```json
{
  "models": [
    {
      "id": "catalog-row-id",
      "provider": "openai",
      "modelId": "openai/gpt-4o-mini",
      "routeType": "chat",
      "supportsTools": true,
      "supportsJsonMode": true,
      "maxContext": 128000,
      "maxOutput": 16384,
      "rpmLimit": 60,
      "dailyRequestLimit": 1000,
      "dailyTokenLimit": 100000,
      "isActive": true,
      "updatedAt": "2026-07-08T12:00:00.000Z",
      "usage": {
        "requestsThisMinute": 3,
        "requestsToday": 120,
        "tokensToday": 45000,
        "limitReached": false
      },
      "status": "available"
    }
  ]
}
```

| Field    | Description                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------- |
| `status` | `available` or `limit_reached` (RPM, daily request, or daily token cap hit)                        |
| `usage`  | Rolling counters for the model; minute window resets every 60s, day counters reset at UTC midnight |

**Errors**

| Status | Code           | Description                       |
| ------ | -------------- | --------------------------------- |
| `401`  | `UNAUTHORIZED` | Missing or invalid bridge API key |

**Example**

```bash
curl "https://freellmrouter.com/api/bridge/v1/models?routeType=chat&provider=openai" \
  -H "Authorization: Bearer fbr_YOUR_KEY"
```

---

### `GET /api/bridge/v1/providers`

List known bridge providers with active model counts and whether an API key is configured for the authenticated tenant.

**Auth:** Required — `Authorization: Bearer fbr_...`

**Response `200`**

```json
{
  "providers": [
    {
      "name": "openai",
      "displayName": "OpenAI",
      "directBaseUrl": "https://api.openai.com/v1",
      "modelCount": 5,
      "defaultRpmLimit": 60,
      "defaultDailyRequestLimit": 1000,
      "defaultDailyTokenLimit": 100000,
      "keyConfigured": true
    }
  ]
}
```

| Field           | Description                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `keyConfigured` | `true` when a tenant-scoped or system provider key exists for this provider                         |
| `directBaseUrl` | Official API base URL when direct forwarding is supported; `null` when routing uses OpenRouter only |
| `default*Limit` | Default limit template applied to new catalog models for this provider                              |

**Example**

```bash
curl "https://freellmrouter.com/api/bridge/v1/providers" \
  -H "Authorization: Bearer fbr_YOUR_KEY"
```

---

## Bridge Admin

Manage bridge tenants, API keys, provider key vault, catalog sync, and operational data. All endpoints require an authenticated dashboard session (cookie from `/login`).

### `GET /api/bridge/admin/tenants`

List all bridge tenants with limit configuration.

**Response `200`**

```json
{
  "tenants": [
    {
      "id": "...",
      "name": "Acme",
      "slug": "acme",
      "isActive": true,
      "rpmLimitChat": 120,
      "rpmLimitVision": 60,
      "rpmLimitEmbeddings": 240,
      "dailyLimitChat": 5000,
      "dailyLimitVision": 2000,
      "dailyLimitEmbeddings": 10000
    }
  ]
}
```

---

### `POST /api/bridge/admin/tenants`

Create a tenant.

**Request body**

```json
{ "name": "Acme Corp", "slug": "acme" }
```

**Response `201`**

```json
{ "id": "...", "name": "Acme Corp", "slug": "acme" }
```

---

### `PUT /api/bridge/admin/tenants`

Update tenant limits or active status.

**Request body** (include only fields to change)

```json
{
  "id": "tenant-id",
  "rpmLimitChat": 200,
  "dailyLimitChat": 10000,
  "isActive": true
}
```

**Response `200`**

```json
{
  "tenant": {
    /* updated tenant row */
  }
}
```

---

### `GET /api/bridge/admin/api-keys?tenantId=<id>`

List bridge API keys for a tenant (prefix only, not full secret).

---

### `POST /api/bridge/admin/api-keys`

Create a bridge API key. **The plaintext key is returned once.**

**Request body**

```json
{ "tenantId": "...", "name": "Production Key" }
```

**Response `201`**

```json
{
  "id": "...",
  "tenantId": "...",
  "name": "Production Key",
  "prefix": "fbr_abcd",
  "key": "fbr_abcd..."
}
```

---

### `PUT /api/bridge/admin/api-keys?action=revoke|rotate`

Revoke or rotate a key.

**Request body**

```json
{ "id": "key-id" }
```

**Rotate response**

```json
{
  "ok": true,
  "oldId": "...",
  "id": "new-id",
  "key": "fbr_new...",
  "prefix": "fbr_new"
}
```

---

### `GET /api/bridge/admin/provider-keys`

List encrypted provider keys (metadata only — never returns plaintext secrets).

**Query parameters:** `tenantId`, `provider` (optional filters)

**Response `200`**

```json
{
  "keys": [
    {
      "id": "...",
      "tenantId": null,
      "provider": "openai",
      "name": "OpenAI System Key",
      "keyLast4": "abcd",
      "isSystem": true,
      "isActive": true,
      "lastUsedAt": "2026-07-08T12:00:00.000Z",
      "createdAt": "2026-07-01T00:00:00.000Z"
    }
  ]
}
```

---

### `POST /api/bridge/admin/provider-keys`

Store an upstream provider API key (encrypted at rest with AES-256-GCM).

**Request body**

```json
{
  "provider": "openai",
  "name": "OpenAI System Key",
  "rawKey": "sk-...",
  "isSystem": true,
  "tenantId": "optional-for-byok"
}
```

| Field      | Required | Description                                                                         |
| ---------- | -------- | ----------------------------------------------------------------------------------- |
| `provider` | Yes      | Provider slug from the bridge registry (see table below)                            |
| `name`     | Yes      | Human-readable label for the key                                                    |
| `rawKey`   | Yes      | Official provider API key (rejected if empty)                                       |
| `isSystem` | No       | `true` for shared system pool keys; `false` for tenant BYOK                         |
| `tenantId` | For BYOK | Associates key with a tenant; preferred over system keys for that tenant's requests |

**Key resolution order:** tenant-scoped active key → system active key → OpenRouter fallback (no direct key).

**Response `201`**

```json
{
  "id": "...",
  "provider": "openai",
  "name": "OpenAI System Key",
  "isSystem": true,
  "keyLast4": "abcd"
}
```

#### Supported providers

Configure one official API key per provider. When a key exists, inference for that provider's models is forwarded to the direct endpoint; otherwise the OpenRouter adapter is used.

| Provider    | Slug         | Direct API                                                | Notes                                                                |
| ----------- | ------------ | --------------------------------------------------------- | -------------------------------------------------------------------- |
| OpenRouter  | `openrouter` | `https://openrouter.ai/api/v1`                            | Universal fallback; required for providers without direct forwarding |
| OpenAI      | `openai`     | `https://api.openai.com/v1`                               | OpenAI-compatible                                                    |
| Google      | `google`     | `https://generativelanguage.googleapis.com/v1beta/openai` | OpenAI-compatible endpoint                                           |
| Mistral AI  | `mistralai`  | `https://api.mistral.ai/v1`                               | OpenAI-compatible                                                    |
| DeepSeek    | `deepseek`   | `https://api.deepseek.com/v1`                             | OpenAI-compatible                                                    |
| Groq        | `groq`       | `https://api.groq.com/openai/v1`                          | OpenAI-compatible                                                    |
| Together AI | `together`   | `https://api.together.xyz/v1`                             | OpenAI-compatible                                                    |
| Cohere      | `cohere`     | `https://api.cohere.ai/v1`                                | OpenAI-compatible                                                    |
| Meta Llama  | `meta-llama` | —                                                         | Routed via OpenRouter unless a direct key is added later             |
| Qwen        | `qwen`       | —                                                         | Routed via OpenRouter unless a direct key is added later             |

**Example — system OpenAI key**

```bash
curl -X POST "https://freellmrouter.com/api/bridge/admin/provider-keys" \
  -H "Content-Type: application/json" \
  -b "session=YOUR_SESSION_COOKIE" \
  -d '{"provider":"openai","name":"OpenAI System Key","rawKey":"sk-...","isSystem":true}'
```

**Example — tenant BYOK key**

```bash
curl -X POST "https://freellmrouter.com/api/bridge/admin/provider-keys" \
  -H "Content-Type: application/json" \
  -b "session=YOUR_SESSION_COOKIE" \
  -d '{"provider":"groq","name":"Acme Groq Key","rawKey":"gsk_...","isSystem":false,"tenantId":"tenant-id"}'
```

---

### `PUT /api/bridge/admin/provider-keys?action=revoke`

Revoke a provider key (sets `isActive: false`; stops use for forwarding).

**Request body:** `{ "id": "key-id" }`

**Response `200`:** `{ "ok": true, "revoked": "key-id" }`

---

### `GET /api/bridge/admin/catalog`

Admin catalog browser with per-model limits, usage counters, and runtime health. Same filters as the public list API but includes additional runtime detail.

**Query parameters:** `routeType`, `provider` (optional)

**Response `200`**

```json
{
  "models": [
    {
      "id": "catalog-row-id",
      "provider": "openai",
      "modelId": "openai/gpt-4o-mini",
      "routeType": "chat",
      "rpmLimit": 60,
      "dailyRequestLimit": 1000,
      "dailyTokenLimit": 100000,
      "usage": {
        "requestsThisMinute": 3,
        "requestsToday": 120,
        "tokensToday": 45000
      },
      "runtime": {
        "score": 85,
        "status": "healthy",
        "inCooldown": false,
        "inQuotaReset": false
      },
      "status": "available"
    }
  ]
}
```

---

### `PUT /api/bridge/admin/catalog`

Update per-model limit caps. Changes take effect on subsequent routing decisions.

**Request body** (include only fields to change)

```json
{
  "id": "catalog-row-id",
  "rpmLimit": 120,
  "dailyRequestLimit": 2000,
  "dailyTokenLimit": 200000
}
```

Set `dailyRequestLimit` to `null` for unlimited daily requests.

**Response `200`**

```json
{
  "ok": true,
  "model": {
    /* updated catalog row */
  }
}
```

---

### `POST /api/bridge/admin/sync-catalog`

Sync bridge catalog from active `free_models` rows into `model_catalog_free`. New models receive default limits from the `bridge_providers` registry.

**Response `200`**

```json
{ "ok": true, "imported": 42, "source": "free_models" }
```

Set `BRIDGE_CATALOG_SCRAPE_FALLBACK=1` to use the legacy freellm.net HTML scrape instead (`source: "freellm-scrape"`).

---

### `GET /api/bridge/admin/runtime-state?limit=100`

Model health, cooldown, and scoring state (max `limit` 500).

**Response `200`**

```json
{
  "states": [
    {
      "id": "provider:model:key-id",
      "provider": "meta-llama",
      "modelId": "meta-llama/llama-3",
      "score": 85,
      "status": "healthy",
      "consecutiveFailures": 0,
      "inCooldown": false,
      "inQuotaReset": false
    }
  ]
}
```

---

### `GET /api/bridge/admin/usage?tenantId=<id>&days=7`

Daily usage aggregates for bridge requests.

**Response `200`**

```json
{
  "usage": [
    {
      "dateKey": "2026-07-08",
      "routeType": "chat",
      "provider": "meta-llama",
      "modelId": "meta-llama/llama-3",
      "requestCount": 10,
      "successCount": 9,
      "failureCount": 1,
      "totalTokens": 4200
    }
  ],
  "totals": { "requests": 10, "successes": 9, "failures": 1, "tokens": 4200 },
  "days": 7
}
```

---

### `POST /api/bridge/admin/maintenance`

Prune old bridge request logs and usage aggregates.

**Request body**

```json
{
  "requestLogDays": 30,
  "aggregateDays": 180
}
```

**Response `200`**

```json
{
  "ok": true,
  "pruned": {
    "requestGroups": 0,
    "requestHops": 0,
    "usageAggregates": 0
  },
  "retention": { "requestLogDays": 30, "aggregateDays": 180 }
}
```

CLI equivalent: `bun run bridge:maintenance`

---

## Dashboard Auth APIs

Session-based endpoints for the logged-in dashboard. Obtain a session by signing in at `/login`. Better Auth also handles OAuth/session routes under `/api/auth/*` (catch-all).

### `POST /api/auth/api-key/create`

Create a catalog API key (max 10 per user).

**Auth:** Session cookie

**Request body**

```json
{ "name": "My App Key", "expiresIn": null }
```

**Response:** Better Auth API key object including the plaintext key (shown once).

**Errors:** `403` if user already has 10 keys.

---

### `GET /api/auth/preferences?apiKeyId=<id>`

Get saved filter preferences for an API key.

**Response `200`**

```json
{ "preferences": { "useCases": ["chat"], "sort": "capable" } }
```

---

### `PUT /api/auth/preferences`

Save preferences for an API key.

**Request body**

```json
{
  "apiKeyId": "...",
  "preferences": {
    "useCases": ["chat"],
    "sort": "leastIssues",
    "topN": 10,
    "maxErrorRate": 20,
    "timeRange": "24h"
  }
}
```

---

### `GET /api/auth/history`

Paginated request and feedback history.

**Query parameters**

| Param      | Default    | Description                          |
| ---------- | ---------- | ------------------------------------ |
| `type`     | `requests` | `requests`, `feedback`, or `unified` |
| `page`     | `1`        | Page number                          |
| `limit`    | `20`       | Items per page (max 100)             |
| `apiKeyId` | —          | Filter by API key                    |

**Response `200`**

```json
{
  "items": [
    /* ... */
  ],
  "hasMore": true
}
```

---

### `GET /api/auth/rate-limit`

Current API rate-limit status for the authenticated user.

**Response `200`**

```json
{
  "remaining": 180,
  "limit": 200,
  "requestCount": 20,
  "timeWindow": 86400000,
  "lastRequest": "2026-07-08T12:00:00.000Z"
}
```

---

## Site & Platform Admin

### `POST /api/site-feedback`

Submit general site feedback (contact form).

**Auth:** None. Rate-limited by IP (5 per 10 min) and email cooldown (5 min). Turnstile captcha required when `TURNSTILE_SECRET_KEY` is configured.

**Request body**

```json
{
  "type": "bug",
  "message": "At least ten characters of feedback",
  "email": "you@example.com",
  "pageUrl": "https://freellmrouter.com/models",
  "cf-turnstile-response": "token-if-configured"
}
```

| Field     | Required | Values             |
| --------- | -------- | ------------------ |
| `type`    | Yes      | `general`, `bug`   |
| `message` | Yes      | 10–5000 characters |
| `email`   | Yes      | Valid email        |

**Response `200`:** `{ "success": true }`

---

### `GET /api/demo/models`

**Deprecated for external use.** Origin-restricted proxy for the website demo. Prefer calling `/api/v1/models/full` directly.

Returns same shape as `/api/v1/models/full` when called from allowed origins. Rate-limited to 20 req/min per IP.

---

### `POST /api/admin/sync-models`

Trigger OpenRouter model sync. Protected by admin secret.

**Headers:** `X-Admin-Secret: <ADMIN_SECRET>`

**Query parameters:** `force=true` to skip staleness check

**Response `200`**

```json
{
  "success": true,
  "result": { "added": 0, "updated": 5, "deactivated": 1 },
  "duration": 1200,
  "lastUpdated": "2026-07-08T12:00:00.000Z"
}
```

**Errors:** `401` unauthorized, `409` sync already in progress, `500` sync failure

**Example**

```bash
curl -X POST "https://freellmrouter.com/api/admin/sync-models?force=true" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET"
```

---

### `POST /api/admin/cleanup`

Delete old feedback, request logs, and availability snapshots. Protected by admin secret.

**Headers:** `X-Admin-Secret: <ADMIN_SECRET>`

**Retention defaults**

| Table                          | Retention |
| ------------------------------ | --------- |
| `model_feedback`               | 90 days   |
| `api_request_logs`             | 30 days   |
| `model_availability_snapshots` | 90 days   |

**Response `200`**

```json
{
  "success": true,
  "deleted": {
    "modelFeedback": 10,
    "apiRequestLogs": 50,
    "availabilitySnapshots": 5
  },
  "cutoffs": {
    /* ISO timestamps */
  }
}
```

---

## Quick Reference

| Method         | Path                        | Auth                |
| -------------- | --------------------------- | ------------------- |
| `GET`          | `/api/v1/models/full`       | Optional API key    |
| `GET`          | `/api/v1/models/ids`        | Optional API key    |
| `POST`         | `/api/v1/models/feedback`   | API key             |
| `GET`          | `/api/health`               | None                |
| `GET`          | `/api/availability`         | None                |
| `POST`         | `/api/bridge/v1/chat`       | Bridge key (`fbr_`) |
| `POST`         | `/api/bridge/v1/vision`     | Bridge key          |
| `POST`         | `/api/bridge/v1/embeddings` | Bridge key          |
| `GET`          | `/api/bridge/v1/models`     | Bridge key          |
| `GET`          | `/api/bridge/v1/providers`  | Bridge key          |
| `GET/POST/PUT` | `/api/bridge/admin/*`       | Dashboard session   |
| `GET/PUT`      | `/api/auth/preferences`     | Session             |
| `GET`          | `/api/auth/history`         | Session             |
| `GET`          | `/api/auth/rate-limit`      | Session             |
| `POST`         | `/api/auth/api-key/create`  | Session             |
| `POST`         | `/api/site-feedback`        | None                |
| `POST`         | `/api/admin/sync-models`    | `X-Admin-Secret`    |
| `POST`         | `/api/admin/cleanup`        | `X-Admin-Secret`    |

## Related docs

- [Availability semantics](./AVAILABILITY.md) — how free-model availability is defined
- [Database RLS](./DATABASE_RLS.md) — row-level security roles
- Interactive docs UI: `/docs` on the deployed site
