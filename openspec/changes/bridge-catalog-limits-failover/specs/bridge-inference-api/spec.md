## ADDED Requirements

### Requirement: Bridge chat inference endpoint

The system SHALL expose `POST /api/bridge/v1/chat` accepting OpenAI-compatible chat payloads, authenticated with `Bearer fbr_` keys, routing to a free model and returning the provider response.

#### Scenario: Successful chat completion

- **WHEN** a client sends a valid chat payload with a valid bridge API key
- **THEN** the system SHALL return HTTP 200 with an OpenAI-compatible completion including the `model` field identifying the model that responded

#### Scenario: Optional model pinning

- **WHEN** a client includes a `model` field matching an active catalog entry
- **THEN** the router SHALL attempt that model first if eligible before falling back to ranked candidates

### Requirement: Bridge vision inference endpoint

The system SHALL expose `POST /api/bridge/v1/vision` for multimodal requests with image content, routing to vision-capable free models.

#### Scenario: Vision request routed

- **WHEN** a client sends a vision payload with `image_url` content and a valid bridge API key
- **THEN** the system SHALL route to an active vision catalog model and return a completion

### Requirement: Bridge embeddings inference endpoint

The system SHALL expose `POST /api/bridge/v1/embeddings` for embedding requests, routing to embedding-capable free models.

#### Scenario: Embeddings request routed

- **WHEN** a client sends a valid embeddings payload with a valid bridge API key
- **THEN** the system SHALL route to an active embeddings catalog model and return embeddings

### Requirement: Routing debug trace

When the client sends header `x-bridge-debug: 1`, the system SHALL include a `_bridge` object in non-streaming responses with request group ID and per-hop attempt details.

#### Scenario: Debug trace on success

- **WHEN** a client sends `x-bridge-debug: 1` and the request succeeds on the second hop
- **THEN** the response SHALL include `_bridge.attempts` with both hop records including `modelId`, `success`, and `latencyMs`

### Requirement: Tenant rate limits on bridge routes

The system SHALL enforce per-tenant RPM and daily request limits per route type before routing begins.

#### Scenario: Tenant RPM exceeded

- **WHEN** a tenant exceeds its chat RPM limit
- **THEN** the system SHALL return HTTP 429 with an error indicating tenant rate limit exceeded

#### Scenario: Tenant within limits

- **WHEN** a tenant is within all configured limits
- **THEN** the system SHALL proceed with model selection and routing
