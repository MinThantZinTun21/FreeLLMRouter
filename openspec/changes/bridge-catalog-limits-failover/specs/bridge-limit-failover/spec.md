## ADDED Requirements

### Requirement: Per-model limit configuration

The system SHALL store per-model RPM, daily request, and daily token limits on `model_catalog_free`, seeded from provider defaults and admin-editable.

#### Scenario: Default limits applied on sync

- **WHEN** a new model is added to the bridge catalog during sync
- **THEN** the system SHALL set `rpmLimit`, `dailyRequestLimit`, and `dailyTokenLimit` from the provider registry defaults

#### Scenario: Admin edits model limits

- **WHEN** an admin updates limit values for a catalog model via the admin API
- **THEN** the system SHALL persist the new limits and use them for subsequent routing decisions

### Requirement: Runtime usage tracking per model

The system SHALL track per-model requests this minute, requests today, and tokens today in `model_runtime_state`.

#### Scenario: Successful request increments counters

- **WHEN** a bridge inference request succeeds through a model
- **THEN** the system SHALL increment that model's request and token counters

#### Scenario: Minute counter resets

- **WHEN** 60 seconds have elapsed since the last minute-window reset for a model
- **THEN** the system SHALL reset `requestsThisMinute` to zero

### Requirement: Auto-switch on limit reached

The bridge router SHALL skip models that have reached configured RPM, daily request, or daily token limits and attempt the next eligible candidate.

#### Scenario: RPM limit exceeded

- **WHEN** a model's `requestsThisMinute` equals or exceeds its `rpmLimit`
- **THEN** the router SHALL NOT select that model and SHALL try the next ranked candidate

#### Scenario: Daily token limit exceeded

- **WHEN** a model's `tokensToday` equals or exceeds its `dailyTokenLimit`
- **THEN** the router SHALL NOT select that model and SHALL try the next ranked candidate

#### Scenario: Upstream rate limit response

- **WHEN** a provider returns HTTP 429 for a model
- **THEN** the router SHALL record the hop, set quota reset hint, and attempt the next eligible model

### Requirement: Streaming failover

The bridge router SHALL attempt failover to the next eligible model on streaming requests when the first attempt fails, up to the maximum hop count.

#### Scenario: Streaming first hop fails

- **WHEN** a streaming chat request fails on the first model attempt with a retriable error
- **THEN** the router SHALL attempt the next eligible model instead of immediately returning the error

### Requirement: Quota reset in ranking

The system SHALL deprioritize models with an active `quotaResetAt` timestamp when ranking candidates.

#### Scenario: Model in quota reset window

- **WHEN** a model's `quotaResetAt` is in the future
- **THEN** the router SHALL rank that model below models not in a quota reset window
