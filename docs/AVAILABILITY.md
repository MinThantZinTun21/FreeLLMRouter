# Availability Semantics

This document defines how Free LLM Router decides whether a model is considered free, currently available, or historically available.

## Source of Truth

Current free-model status is based on the OpenRouter `/api/v1/models` feed.

In this codebase:

- `provider/model:free` and `provider/model` are distinct model IDs
- the OpenRouter website model page is not the source of truth for free-model classification
- "available as a free model" means "returned by `/api/v1/models` with free pricing"

## Data Sources

### `free_models`

`free_models` stores the current sync-state for model IDs seen in the feed.

Important fields:

- `id`: the exact model ID, including `:free` when present
- `is_active`: whether the latest successful sync marked this model as currently active/free
- `last_seen_at`: the last sync time when this model ID was seen as free in the feed

### `model_availability_snapshots`

`model_availability_snapshots` stores historical positive sightings.

Important fields:

- `model_id`
- `snapshot_date`
- `is_available`

Today this table is used as a history of "seen as free on this day".

## Sync Behavior

The sync job fetches OpenRouter `/api/v1/models`, filters to free models, and then:

1. upserts seen free model IDs into `free_models`
2. sets `is_active = true` for seen IDs
3. sets `is_active = false` for previously active IDs that are no longer present
4. writes daily snapshot rows for seen IDs

This means:

- `free_models.is_active` is the current-state flag
- snapshots are historical evidence that a model was seen as free on a given day

## Meaning of "Last Seen as Free"

"Last seen as free" means the latest day the `:free` model ID was observed in the OpenRouter API feed.

It does not mean:

- the OpenRouter website page still shows "Free"
- the non-`:free` variant is unavailable
- the provider/model family disappeared entirely

Example:

- `deepseek/deepseek-v4-flash:free`
- `deepseek/deepseek-v4-flash`

These are different IDs for this app. If the feed stops returning `:free` but still returns the paid variant, the free variant is treated as no longer currently free.

## Known Limitation

Snapshots are historical sightings, not a complete daily truth table.

In the current implementation, missing from the latest snapshot does not by itself prove a model was unavailable that day; it only proves we did not record a positive sighting for that model/day.

Because of that:

- current-state decisions should prefer `free_models.is_active`
- snapshot history should be interpreted as "when did we last see it as free"

## Troubleshooting

If availability looks wrong:

1. Check whether the exact `:free` model ID exists in the current OpenRouter `/api/v1/models` feed.
2. Check `free_models.is_active` and `last_seen_at` for that exact model ID.
3. Check the latest row in `model_availability_snapshots` for that exact model ID.
4. Do not treat the non-`:free` variant or the OpenRouter website model page as proof that the `:free` variant is still current in the feed.
