import type { APIRoute } from 'astro';
import { apiKeys, withUserContext } from '@/db';
import { eq, and } from 'drizzle-orm';
import { validatePreferences } from '@/lib/api-definitions';
import { getAuthSession, isSessionError } from '@/lib/auth-session';
import {
  jsonResponse,
  createRequestId,
  withRequestId,
  errorJsonResponse,
  logApiStage,
} from '@/lib/api-response';
import { extractApiKeyPreferences, parseApiKeyMetadata } from '@/lib/api-key-metadata';

// GET /api/auth/preferences?apiKeyId=xxx - Get preferences for an API key
export const GET: APIRoute = async ({ request, locals, url }) => {
  const requestId = createRequestId();
  logApiStage('/api/auth/preferences', requestId, 'start', { method: 'GET' });

  try {
    const result = await getAuthSession(request, locals);
    if (isSessionError(result)) {
      logApiStage('/api/auth/preferences', requestId, 'session_error', { status: result.status });
      return errorJsonResponse(
        { error: result.error, code: 'SESSION_ERROR' },
        { requestId, status: result.status }
      );
    }

    const { session, databaseUrl } = result;
    logApiStage('/api/auth/preferences', requestId, 'session_ok', { userId: session.user.id });
    const apiKeyId = url.searchParams.get('apiKeyId');

    if (!apiKeyId) {
      logApiStage('/api/auth/preferences', requestId, 'validation_error', { apiKeyId: null });
      return errorJsonResponse(
        { error: 'apiKeyId is required', code: 'VALIDATION_ERROR' },
        { requestId, status: 400 }
      );
    }

    logApiStage('/api/auth/preferences', requestId, 'select_start', {
      userId: session.user.id,
      apiKeyId,
    });
    const [key] = await withUserContext(databaseUrl, session.user.id, async (tx) => {
      return tx
        .select({ metadata: apiKeys.metadata })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, session.user.id)))
        .limit(1);
    });
    const preferences = key ? extractApiKeyPreferences(key.metadata) : null;

    if (preferences === null) {
      logApiStage('/api/auth/preferences', requestId, 'not_found', {
        userId: session.user.id,
        apiKeyId,
      });
      return errorJsonResponse(
        { error: 'API key not found', code: 'NOT_FOUND' },
        { requestId, status: 404 }
      );
    }

    logApiStage('/api/auth/preferences', requestId, 'select_ok', {
      userId: session.user.id,
      apiKeyId,
    });
    return jsonResponse(
      { preferences },
      {
        headers: withRequestId(
          { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
          requestId
        ),
      }
    );
  } catch (error) {
    logApiStage('/api/auth/preferences', requestId, 'error', {
      method: 'GET',
      error: error instanceof Error ? error.message : String(error),
    });
    return errorJsonResponse(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { requestId, status: 500 }
    );
  }
};

// PUT /api/auth/preferences - Save preferences for an API key
export const PUT: APIRoute = async ({ request, locals }) => {
  const requestId = createRequestId();
  logApiStage('/api/auth/preferences', requestId, 'start', { method: 'PUT' });

  try {
    const result = await getAuthSession(request, locals);
    if (isSessionError(result)) {
      logApiStage('/api/auth/preferences', requestId, 'session_error', { status: result.status });
      return errorJsonResponse(
        { error: result.error, code: 'SESSION_ERROR' },
        { requestId, status: result.status }
      );
    }

    const { session, databaseUrl } = result;
    logApiStage('/api/auth/preferences', requestId, 'session_ok', { userId: session.user.id });

    let body: { apiKeyId?: string; preferences?: unknown };
    try {
      body = await request.json();
    } catch {
      logApiStage('/api/auth/preferences', requestId, 'validation_error', {
        reason: 'invalid_json',
      });
      return errorJsonResponse(
        { error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
        { requestId, status: 400 }
      );
    }

    const { apiKeyId, preferences: rawPreferences } = body;

    if (!apiKeyId) {
      logApiStage('/api/auth/preferences', requestId, 'validation_error', { apiKeyId: null });
      return errorJsonResponse(
        { error: 'apiKeyId is required', code: 'VALIDATION_ERROR' },
        { requestId, status: 400 }
      );
    }

    const preferences = validatePreferences(rawPreferences);
    logApiStage('/api/auth/preferences', requestId, 'update_start', {
      userId: session.user.id,
      apiKeyId,
    });

    const [existing] = await withUserContext(databaseUrl, session.user.id, async (tx) => {
      return tx
        .select({ metadata: apiKeys.metadata })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, session.user.id)))
        .limit(1);
    });

    const updated = (() => {
      if (!existing) return null;
      return preferences;
    })();
    if (existing) {
      const metadata: Record<string, unknown> = parseApiKeyMetadata(existing.metadata);
      metadata.preferences = preferences;

      await withUserContext(databaseUrl, session.user.id, async (tx) => {
        await tx
          .update(apiKeys)
          .set({
            metadata: JSON.stringify(metadata),
            updatedAt: new Date(),
          })
          .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, session.user.id)));
      });
    }

    if (updated === null) {
      logApiStage('/api/auth/preferences', requestId, 'not_found', {
        userId: session.user.id,
        apiKeyId,
      });
      return errorJsonResponse(
        { error: 'API key not found', code: 'NOT_FOUND' },
        { requestId, status: 404 }
      );
    }

    logApiStage('/api/auth/preferences', requestId, 'update_ok', {
      userId: session.user.id,
      apiKeyId,
    });
    return jsonResponse(
      { preferences: updated, message: 'Preferences saved' },
      {
        headers: withRequestId(
          { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
          requestId
        ),
      }
    );
  } catch (error) {
    logApiStage('/api/auth/preferences', requestId, 'error', {
      method: 'PUT',
      error: error instanceof Error ? error.message : String(error),
    });
    return errorJsonResponse(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { requestId, status: 500 }
    );
  }
};
