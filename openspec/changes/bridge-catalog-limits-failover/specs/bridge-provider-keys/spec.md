## ADDED Requirements

### Requirement: Encrypted provider key storage

The system SHALL store official provider API keys encrypted at rest in `provider_keys` using AES-256-GCM, never returning plaintext keys in API responses.

#### Scenario: Save provider key

- **WHEN** an admin submits a provider API key via the admin API
- **THEN** the system SHALL encrypt and store the key with `keyLast4` for display and reject storing empty keys

### Requirement: Per-provider key input in admin UI

The bridge admin dashboard SHALL provide an input field for each supported provider's official API key, with provider name, key label, and system vs tenant scope selection.

#### Scenario: Save OpenAI provider key

- **WHEN** an admin selects provider `openai`, enters a key name and raw key, and clicks save
- **THEN** the system SHALL store the encrypted key and show confirmation with last-4 characters only

#### Scenario: Save tenant-scoped key

- **WHEN** an admin saves a provider key with tenant scope selected
- **THEN** the system SHALL associate the key with the active tenant and prefer it over system keys for that tenant's requests

### Requirement: List and revoke provider keys

The bridge admin dashboard SHALL list saved provider keys (metadata only) and allow revocation.

#### Scenario: List saved keys

- **WHEN** an admin opens the provider key section
- **THEN** the system SHALL display provider, key name, last4, scope, and active status for each saved key

#### Scenario: Revoke a key

- **WHEN** an admin revokes a provider key
- **THEN** the system SHALL set `isActive` to false and stop using that key for forwarding

### Requirement: Direct provider forwarding

When an official provider API key exists for a model's provider, the bridge router SHALL forward the inference call to that provider's official API endpoint before falling back to OpenRouter.

#### Scenario: Direct call with provider key

- **WHEN** a chat request routes to an `openai` model and an active `openai` provider key exists
- **THEN** the router SHALL call the OpenAI-compatible endpoint using the official key

#### Scenario: Fallback to OpenRouter

- **WHEN** no official provider key exists for a model's provider
- **THEN** the router SHALL forward the request through the OpenRouter adapter using the OpenRouter system key
