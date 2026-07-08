## ADDED Requirements

### Requirement: Bridge catalog syncs from free_models

The system SHALL populate and update `model_catalog_free` from active rows in `free_models` after each OpenRouter model sync, deriving provider, route type, modality flags, and context/output limits.

#### Scenario: Chat model synced

- **WHEN** a model in `free_models` has text input and text output modalities
- **THEN** the bridge catalog SHALL contain a row with `routeType` of `chat` and `isActive` matching the source model

#### Scenario: Vision model synced

- **WHEN** a model in `free_models` accepts image input
- **THEN** the bridge catalog SHALL contain a row with `routeType` of `vision`

#### Scenario: Embeddings model synced

- **WHEN** a model in `free_models` produces embedding output
- **THEN** the bridge catalog SHALL contain a row with `routeType` of `embeddings`

### Requirement: Bridge models list API

The system SHALL expose `GET /api/bridge/v1/models` authenticated with a valid bridge API key, returning all active catalog models with provider, route type, limits, and runtime status summary.

#### Scenario: List chat models

- **WHEN** a client sends `GET /api/bridge/v1/models?routeType=chat` with a valid `fbr_` key
- **THEN** the system SHALL return a JSON array of active chat models with `modelId`, `provider`, `rpmLimit`, `dailyRequestLimit`, `dailyTokenLimit`, and `status`

#### Scenario: Filter by provider

- **WHEN** a client sends `GET /api/bridge/v1/models?provider=openai`
- **THEN** the system SHALL return only models whose provider is `openai`

### Requirement: Bridge providers list API

The system SHALL expose `GET /api/bridge/v1/providers` authenticated with a valid bridge API key, returning known providers with model counts and whether an official API key is configured.

#### Scenario: List providers

- **WHEN** a client sends `GET /api/bridge/v1/providers` with a valid `fbr_` key
- **THEN** the system SHALL return providers with `name`, `displayName`, `modelCount`, and `keyConfigured` fields

### Requirement: Admin catalog browser

The bridge admin dashboard SHALL display all catalog models grouped by provider with limit and runtime status columns.

#### Scenario: View catalog in admin

- **WHEN** an admin opens the Bridge tab catalog section
- **THEN** the system SHALL show models with provider, route type, configured limits, and current usage status
