import type { APIRoute } from 'astro';
import { users, withUserContext } from '@/db';
import { eq } from 'drizzle-orm';
import { getAuthSession, isSessionError } from '@/lib/auth-session';
import {
  jsonResponse,
  createRequestId,
  withRequestId,
  errorJsonResponse,
  logApiStage,
} from '@/lib/api-response';

export const GET: APIRoute = async ({ request, locals }) => {
  const requestId = createRequestId();
  logApiStage('/api/auth/rate-limit', requestId, 'start', { method: 'GET' });

  try {
    const result = await getAuthSession(request, locals);
    if (isSessionError(result)) {
      logApiStage('/api/auth/rate-limit', requestId, 'session_error', { status: result.status });
      return errorJsonResponse(
        { error: result.error, code: 'SESSION_ERROR' },
        { requestId, status: result.status }
      );
    }

    const { session, databaseUrl } = result;
    logApiStage('/api/auth/rate-limit', requestId, 'session_ok', { userId: session.user.id });

    const [record] = await withUserContext(databaseUrl, session.user.id, async (tx) => {
      return tx
        .select({
          remaining: users.remaining,
          limit: users.rateLimitMax,
          requestCount: users.requestCount,
          timeWindow: users.rateLimitTimeWindow,
          lastRequest: users.lastRequest,
        })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
    });

    if (!record) {
      return errorJsonResponse(
        { error: 'User not found', code: 'NOT_FOUND' },
        { requestId, status: 404 }
      );
    }

    return jsonResponse(
      {
        remaining: record.remaining ?? 0,
        limit: record.limit ?? 200,
        requestCount: record.requestCount ?? 0,
        timeWindow: record.timeWindow ?? 86400000,
        lastRequest: record.lastRequest,
      },
      { headers: withRequestId(undefined, requestId) }
    );
  } catch (error) {
    logApiStage('/api/auth/rate-limit', requestId, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorJsonResponse(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { requestId, status: 500 }
    );
  }
};
