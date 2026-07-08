import type { APIRoute } from 'astro';
import { createDb, modelFeedback, apiRequestLogs, modelAvailabilitySnapshots } from '@/db';
import { lt } from 'drizzle-orm';
import { apiResponseHeaders, jsonResponse } from '@/lib/api-response';
import { access } from '@/lib/runtime-access';

const MODEL_FEEDBACK_RETENTION_DAYS = 90;
const API_LOGS_RETENTION_DAYS = 30;
const AVAILABILITY_SNAPSHOTS_RETENTION_DAYS = 90;

/**
 * Admin endpoint to clean up old data.
 * Protected by ADMIN_SECRET env var.
 *
 * POST /api/admin/cleanup
 * Headers: X-Admin-Secret: <secret>
 *
 * Deletes:
 * - model_feedback older than 90 days
 * - api_request_logs older than 30 days
 */
type CleanupDeps = {
  createDb?: typeof createDb;
  now?: () => Date;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const rt = access(locals);
  const deps = (locals as { cleanupDeps?: CleanupDeps }).cleanupDeps;
  const dbFactory = deps?.createDb ?? createDb;
  const now = deps?.now ? deps.now() : new Date();
  const adminSecret = rt.env('ADMIN_SECRET');
  const databaseUrl = rt.dbUrl('admin');

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

  if (!databaseUrl) {
    return jsonResponse(
      { error: 'Database not configured' },
      { status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }

  try {
    const db = dbFactory(databaseUrl);

    // Calculate cutoff dates
    const feedbackCutoff = new Date(
      now.getTime() - MODEL_FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const logsCutoff = new Date(now.getTime() - API_LOGS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const availabilityCutoff = new Date(
      now.getTime() - AVAILABILITY_SNAPSHOTS_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    // Delete old model feedback
    const feedbackResult = await db
      .delete(modelFeedback)
      .where(lt(modelFeedback.createdAt, feedbackCutoff));

    // Delete old API request logs
    const logsResult = await db
      .delete(apiRequestLogs)
      .where(lt(apiRequestLogs.createdAt, logsCutoff));

    // Delete old availability snapshots
    const availabilityResult = await db
      .delete(modelAvailabilitySnapshots)
      .where(lt(modelAvailabilitySnapshots.snapshotDate, availabilityCutoff));

    return jsonResponse(
      {
        success: true,
        deleted: {
          modelFeedback: feedbackResult.rowCount ?? 0,
          apiRequestLogs: logsResult.rowCount ?? 0,
          availabilitySnapshots: availabilityResult.rowCount ?? 0,
        },
        cutoffs: {
          modelFeedback: feedbackCutoff.toISOString(),
          apiRequestLogs: logsCutoff.toISOString(),
          availabilitySnapshots: availabilityCutoff.toISOString(),
        },
      },
      { headers: apiResponseHeaders({ cors: false }) }
    );
  } catch (error) {
    console.error('[API/admin/cleanup] Error:', error);
    return jsonResponse(
      { error: 'Cleanup failed' },
      { status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }
};
