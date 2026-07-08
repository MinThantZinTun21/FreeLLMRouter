import type { APIRoute } from 'astro';
import { createDb, syncMeta } from '@/db';
import { syncModels, getLastUpdated, type SyncResult } from '@/services/openrouter';
import { eq } from 'drizzle-orm';
import { apiResponseHeaders, jsonResponse } from '@/lib/api-response';
import { access } from '@/lib/runtime-access';

// Sync lock duration in milliseconds (5 minutes)
const SYNC_LOCK_DURATION_MS = 5 * 60 * 1000;

// Staleness threshold - consider data stale after 1 hour
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Admin endpoint to trigger model sync from OpenRouter.
 * Protected by ADMIN_SECRET env var.
 * Implements database-level locking to prevent thundering herd.
 *
 * POST /api/admin/sync-models
 * Headers: X-Admin-Secret: <secret>
 *
 * Optional query params:
 * - force=true: Skip staleness check and force sync
 *
 * Response:
 * - 200: Sync completed (or skipped if fresh)
 * - 401: Unauthorized
 * - 409: Sync already in progress
 * - 500: Server error
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  const rt = access(locals);
  const adminSecret = rt.env('ADMIN_SECRET');
  const db = rt.db('admin');

  // Validate admin secret
  if (!adminSecret) {
    return jsonResponse(
      { error: 'ADMIN_SECRET not configured' },
      { status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }

  const providedSecret = request.headers.get('X-Admin-Secret');
  if (!providedSecret || providedSecret !== adminSecret) {
    return jsonResponse(
      { error: 'Unauthorized' },
      { status: 401, headers: apiResponseHeaders({ cors: false }) }
    );
  }

  if (!db) {
    return jsonResponse(
      { error: 'Database not configured' },
      { status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }

  try {
    const forceSync = url.searchParams.get('force') === 'true';

    // Try to acquire sync lock using database
    const lockResult = await tryAcquireSyncLock(db, forceSync);

    if (!lockResult.acquired) {
      return jsonResponse(
        {
          skipped: true,
          reason: lockResult.reason,
          lastUpdated: lockResult.lastUpdated,
        },
        {
          status: lockResult.reason === 'sync_in_progress' ? 409 : 200,
          headers: apiResponseHeaders({ cors: false }),
        }
      );
    }

    // Perform sync
    const startTime = Date.now();
    let result: SyncResult;

    try {
      result = await syncModels(db);
    } finally {
      // Always release lock, even if sync fails
      await releaseSyncLock(db);
    }

    const duration = Date.now() - startTime;

    if (result.error) {
      return jsonResponse(
        {
          success: false,
          error: result.error,
          duration,
        },
        { status: 500, headers: apiResponseHeaders({ cors: false }) }
      );
    }

    const lastUpdated = await getLastUpdated(db);

    return jsonResponse(
      {
        success: true,
        result,
        duration,
        lastUpdated: lastUpdated?.toISOString(),
      },
      { headers: apiResponseHeaders({ cors: false }) }
    );
  } catch (error) {
    console.error('[API/admin/sync-models] Error:', error);
    return jsonResponse(
      { error: 'Sync failed' },
      { status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }
};

/**
 * Try to acquire sync lock using sync_meta table.
 * Uses 'sync_in_progress' key with timestamp to implement distributed locking.
 */
async function tryAcquireSyncLock(
  db: ReturnType<typeof createDb>,
  forceSync: boolean
): Promise<{
  acquired: boolean;
  reason?: 'data_fresh' | 'sync_in_progress';
  lastUpdated?: string;
}> {
  const now = new Date();

  // Check if sync is already in progress
  const [lockRow] = await db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.key, 'sync_in_progress'))
    .limit(1);

  if (lockRow?.value === 'true' && lockRow.updatedAt) {
    // Check if lock has expired (stale lock from crashed sync)
    const lockAge = now.getTime() - lockRow.updatedAt.getTime();
    if (lockAge < SYNC_LOCK_DURATION_MS) {
      return { acquired: false, reason: 'sync_in_progress' };
    }
    // Lock expired, continue to acquire
  }

  // Check data freshness (skip if not forced and data is fresh)
  if (!forceSync) {
    const [lastUpdatedRow] = await db
      .select()
      .from(syncMeta)
      .where(eq(syncMeta.key, 'models_last_updated'))
      .limit(1);

    if (lastUpdatedRow?.updatedAt) {
      const age = now.getTime() - lastUpdatedRow.updatedAt.getTime();
      if (age < STALE_THRESHOLD_MS) {
        return {
          acquired: false,
          reason: 'data_fresh',
          lastUpdated: lastUpdatedRow.updatedAt.toISOString(),
        };
      }
    }
  }

  // Acquire lock
  await db
    .insert(syncMeta)
    .values({
      key: 'sync_in_progress',
      value: 'true',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { value: 'true', updatedAt: now },
    });

  return { acquired: true };
}

/**
 * Release sync lock after sync completes.
 */
async function releaseSyncLock(db: ReturnType<typeof createDb>): Promise<void> {
  await db
    .update(syncMeta)
    .set({ value: 'false', updatedAt: new Date() })
    .where(eq(syncMeta.key, 'sync_in_progress'));
}
