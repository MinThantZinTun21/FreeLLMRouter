# DB Slot Switch Checklist

Use this when moving runtime traffic from slot `1` to slot `2` (or any slot `N`).

This is the short operator checklist. For wizard details, see `scripts/db-migration/README.md`.

## 1. Prepare New Slot

- Run:

```bash
bun run db:new
```

- Confirm the new slot has:
  - `DATABASE_URL_<N>`
  - `DATABASE_URL_ADMIN_<N>`
  - `DATABASE_URL_STATS_<N>`
  - `DATABASE_URL_OWNER_<N>`

- Keep runtime on the old slot for now:
  - `ACTIVE_DB_SLOT=1`

## 2. Copy Data

- Run:

```bash
bun run db:migrate
```

- Copy from old slot to new slot.
- If prompted, truncate the target before re-copying.
- Do **not** switch runtime yet.

## 3. Verify Copy

- Run:

```bash
bun run db:verify --source-slot=1 --target-slot=2
```

- Confirm key-table counts are acceptable for cutover.
- If counts do not match as expected, stop here and re-run copy / inspect drift.

## 4. Freeze Writes (Recommended)

Before cutover, pause anything that writes to the old slot:

- sync worker
- admin/manual sync triggers
- write-heavy app flows if needed

Goal:

- avoid old-slot/new-slot drift during the cutover window

## 5. Update Secrets

### Cloudflare Pages

- set `ACTIVE_DB_SLOT=2`
- ensure these exist:
  - `DATABASE_URL`
  - `DATABASE_URL_ADMIN`
  - `DATABASE_URL_STATS`
  - `DATABASE_URL_2`
  - `DATABASE_URL_ADMIN_2`
  - `DATABASE_URL_STATS_2`

### Cloudflare Worker (`workers/sync-models`)

- set `ACTIVE_DB_SLOT=2`
- ensure these exist:
  - `DATABASE_URL_ADMIN`
  - `DATABASE_URL_ADMIN_2`

### GitHub Actions

- set `DATABASE_URL_OWNER` to the owner URL for the active target slot
- GitHub should not be the runtime source of truth for app DB reads

## 6. Deploy

- Deploy Pages
- Deploy the sync worker

After deploy:

- app runtime should read slot `2`
- worker should write slot `2`

## 7. Post-Cutover Checks

Check:

- app loads normally
- `/api/v1/models/ids` returns expected active free model IDs
- availability page loads
- sync worker logs show successful syncs
- newly synced models update in the target slot

Recommended spot checks:

- one model that is definitely still free
- one model that is definitely no longer free
- one API key request using saved preferences

## 8. Rollback

If cutover is bad:

### Cloudflare Pages

- set `ACTIVE_DB_SLOT=1`

### Cloudflare Worker

- set `ACTIVE_DB_SLOT=1`

### GitHub Actions

- point `DATABASE_URL_OWNER` back to slot `1` owner URL

Then:

- redeploy Pages
- redeploy worker

## 9. Rules to Remember

- Do not switch runtime before copy + verification are complete.
- `:free` and non-`:free` model IDs are distinct in this app.
- Free-model truth comes from OpenRouter `/api/v1/models`, not the website model page.
