# DB Migration Runbook (Slot-Based)

Quick cutover checklist:

- [docs/DB_SLOT_SWITCH_CHECKLIST.md](../../docs/DB_SLOT_SWITCH_CHECKLIST.md)

Slot model:

- Slot `1`: existing unsuffixed keys (`DATABASE_URL`, `DATABASE_URL_ADMIN`, ...)
- Slot `N` (`2+`): suffixed keys (`DATABASE_URL_N`, `DATABASE_URL_ADMIN_N`, ...)
- Active runtime slot: `ACTIVE_DB_SLOT`

Files:

- `db-slot-setup-wizard.ts` (interactive setup for one slot)
- `db-migrate-wizard.ts` (interactive copy from slot -> slot)
- `enable_rls.sql`

## Recommended flow

### 1) Setup a new slot (2/3/4...)

```bash
bun run db:new
```

This wizard:

1. asks target slot index
2. asks new owner URL
3. generates `*_N` keys into a temp env file
4. optionally bootstraps schema + RLS on that new DB

### 2) Migrate from one slot to another

```bash
bun run db:migrate
```

This wizard:

1. reads `.env` + process env
2. asks source (slot number or pasted postgres URL)
3. asks target (slot number or pasted postgres URL)
4. runs data copy and post-copy verification
5. if target is a slot, optionally updates local `.env` `ACTIVE_DB_SLOT=<target>`

### 3) Verify source/target are in sync

```bash
bun run db:verify --source-slot=1 --target-slot=2
```

This uses the exact same key-table count comparison used by `db:migrate` post-copy.
Input can be slot numbers or pasted postgres URLs.

## Supported commands

Use only:

```bash
bun run db:new
bun run db:migrate
bun run db:verify
```

Minimum credentials needed:

- `db:migrate`: `DATABASE_URL_OWNER[_N]` preferred, or `DATABASE_URL_ADMIN[_N]` fallback for slot selections
- `db:migrate`: source URL + target URL if you paste URLs directly (optional target owner URL for schema push)
- `db:verify`: source URL + target URL (slot-derived or pasted)

## Deployment notes

1. Keep `ACTIVE_DB_SLOT=1` until copy is complete and validated.
2. Update secrets for the new slot in:
   GitHub env, Cloudflare Pages env, Worker secrets.
3. For cutover, set `ACTIVE_DB_SLOT=<target-slot>` in all environments and deploy.
4. Re-enable writes/worker after successful cutover.
