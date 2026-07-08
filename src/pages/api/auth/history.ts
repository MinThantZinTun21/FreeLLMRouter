import type { APIRoute } from 'astro';
import { apiRequestLogs, modelFeedback, apiKeys, withUserContext } from '@/db';
import { eq, desc, and } from 'drizzle-orm';
import { getAuthSession, isSessionError } from '@/lib/auth-session';
import {
  jsonResponse,
  createRequestId,
  withRequestId,
  errorJsonResponse,
  logApiStage,
} from '@/lib/api-response';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const requestId = createRequestId();
  logApiStage('/api/auth/history', requestId, 'start', { method: 'GET' });

  try {
    const result = await getAuthSession(request, locals);
    if (isSessionError(result)) {
      logApiStage('/api/auth/history', requestId, 'session_error', { status: result.status });
      return errorJsonResponse(
        { error: result.error, code: 'SESSION_ERROR' },
        { requestId, status: result.status }
      );
    }

    const { session, databaseUrl } = result;

    const type = url.searchParams.get('type') || 'requests';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const apiKeyId = url.searchParams.get('apiKeyId');
    logApiStage('/api/auth/history', requestId, 'session_ok', {
      userId: session.user.id,
      type,
      page,
      limit,
      apiKeyId,
    });

    if (type === 'requests') {
      // Fetch request logs with API key info (RLS-protected)
      // Fetch limit+1 to check if there are more items
      const items = await withUserContext(databaseUrl, session.user.id, async (tx) => {
        return tx
          .select({
            id: apiRequestLogs.id,
            endpoint: apiRequestLogs.endpoint,
            method: apiRequestLogs.method,
            statusCode: apiRequestLogs.statusCode,
            responseTimeMs: apiRequestLogs.responseTimeMs,
            responseData: apiRequestLogs.responseData,
            createdAt: apiRequestLogs.createdAt,
            apiKeyId: apiRequestLogs.apiKeyId,
            apiKeyName: apiKeys.name,
            apiKeyPrefix: apiKeys.prefix,
          })
          .from(apiRequestLogs)
          .leftJoin(apiKeys, eq(apiRequestLogs.apiKeyId, apiKeys.id))
          .where(
            and(
              eq(apiRequestLogs.userId, session.user.id),
              apiKeyId ? eq(apiRequestLogs.apiKeyId, apiKeyId) : undefined
            )
          )
          .orderBy(desc(apiRequestLogs.createdAt))
          .limit(limit + 1)
          .offset(offset);
      });

      const hasMore = items.length > limit;
      const returnItems = hasMore ? items.slice(0, limit) : items;

      return jsonResponse(
        { items: returnItems, hasMore },
        { headers: withRequestId(undefined, requestId) }
      );
    } else if (type === 'feedback') {
      // Fetch feedback submitted by this user with API key info (RLS-protected)
      // Fetch limit+1 to check if there are more items
      const items = await withUserContext(databaseUrl, session.user.id, async (tx) => {
        return tx
          .select({
            id: modelFeedback.id,
            modelId: modelFeedback.modelId,
            requestId: modelFeedback.requestId,
            isSuccess: modelFeedback.isSuccess,
            issue: modelFeedback.issue,
            details: modelFeedback.details,
            source: modelFeedback.source,
            createdAt: modelFeedback.createdAt,
            apiKeyId: modelFeedback.apiKeyId,
            apiKeyName: apiKeys.name,
            apiKeyPrefix: apiKeys.prefix,
          })
          .from(modelFeedback)
          .leftJoin(apiKeys, eq(modelFeedback.apiKeyId, apiKeys.id))
          .where(
            and(
              eq(modelFeedback.source, session.user.id),
              apiKeyId ? eq(modelFeedback.apiKeyId, apiKeyId) : undefined
            )
          )
          .orderBy(desc(modelFeedback.createdAt))
          .limit(limit + 1)
          .offset(offset);
      });

      const hasMore = items.length > limit;
      const returnItems = hasMore ? items.slice(0, limit) : items;

      return jsonResponse(
        { items: returnItems, hasMore },
        { headers: withRequestId(undefined, requestId) }
      );
    }

    if (type === 'unified') {
      // Fetch both requests and feedback, merge by createdAt
      // For "See More" pattern: fetch offset+limit+1 from each source to check hasMore
      const fetchLimit = offset + limit + 1;

      const [requests, feedback] = await withUserContext(databaseUrl, session.user.id, async (tx) =>
        Promise.all([
          tx
            .select({
              id: apiRequestLogs.id,
              endpoint: apiRequestLogs.endpoint,
              method: apiRequestLogs.method,
              statusCode: apiRequestLogs.statusCode,
              responseTimeMs: apiRequestLogs.responseTimeMs,
              responseData: apiRequestLogs.responseData,
              createdAt: apiRequestLogs.createdAt,
              apiKeyId: apiRequestLogs.apiKeyId,
              apiKeyName: apiKeys.name,
              apiKeyPrefix: apiKeys.prefix,
            })
            .from(apiRequestLogs)
            .leftJoin(apiKeys, eq(apiRequestLogs.apiKeyId, apiKeys.id))
            .where(
              and(
                eq(apiRequestLogs.userId, session.user.id),
                apiKeyId ? eq(apiRequestLogs.apiKeyId, apiKeyId) : undefined
              )
            )
            .orderBy(desc(apiRequestLogs.createdAt))
            .limit(fetchLimit),
          tx
            .select({
              id: modelFeedback.id,
              modelId: modelFeedback.modelId,
              requestId: modelFeedback.requestId,
              isSuccess: modelFeedback.isSuccess,
              issue: modelFeedback.issue,
              details: modelFeedback.details,
              source: modelFeedback.source,
              createdAt: modelFeedback.createdAt,
              apiKeyId: modelFeedback.apiKeyId,
              apiKeyName: apiKeys.name,
              apiKeyPrefix: apiKeys.prefix,
            })
            .from(modelFeedback)
            .leftJoin(apiKeys, eq(modelFeedback.apiKeyId, apiKeys.id))
            .where(
              and(
                eq(modelFeedback.source, session.user.id),
                apiKeyId ? eq(modelFeedback.apiKeyId, apiKeyId) : undefined
              )
            )
            .orderBy(desc(modelFeedback.createdAt))
            .limit(fetchLimit),
        ])
      );

      // Group feedback by requestId for linking
      const feedbackByRequestId = new Map<string, typeof feedback>();
      const linkedFeedbackIds = new Set<string>();
      for (const f of feedback) {
        if (f.requestId) {
          const arr = feedbackByRequestId.get(f.requestId) || [];
          arr.push(f);
          feedbackByRequestId.set(f.requestId, arr);
          linkedFeedbackIds.add(f.id);
        }
      }

      // Filter out linked feedback from top-level list (they'll appear nested under requests)
      const unlinkedFeedback = feedback.filter((f) => !linkedFeedbackIds.has(f.id));

      // Transform feedback item to nested shape
      type LinkedFeedbackItem = {
        id: string;
        modelId: string;
        isSuccess: boolean;
        issue: string | null;
        details: string | null;
        createdAt: Date | null;
      };

      // Transform to unified shape
      type UnifiedItem = {
        id: string;
        type: 'request' | 'feedback';
        createdAt: Date | null;
        endpoint: string | null;
        method: string | null;
        statusCode: number | null;
        responseTimeMs: number | null;
        responseData: string | null;
        apiKeyId: string | null;
        apiKeyName: string | null;
        apiKeyPrefix: string | null;
        modelId: string | null;
        isSuccess: boolean | null;
        issue: string | null;
        details: string | null;
        linkedFeedback?: LinkedFeedbackItem[];
        timeToFirstFeedbackMs?: number | null;
      };

      const unifiedRequests: UnifiedItem[] = requests.map((r) => {
        const linked = feedbackByRequestId.get(r.id) || [];
        // Sort linked feedback by createdAt ascending to find first
        const sortedLinked = [...linked].sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });

        // Calculate time to first feedback
        let timeToFirstFeedbackMs: number | null = null;
        if (sortedLinked.length > 0 && r.createdAt && sortedLinked[0].createdAt) {
          timeToFirstFeedbackMs =
            new Date(sortedLinked[0].createdAt).getTime() - new Date(r.createdAt).getTime();
        }

        return {
          id: r.id,
          type: 'request' as const,
          createdAt: r.createdAt,
          endpoint: r.endpoint,
          method: r.method,
          statusCode: r.statusCode,
          responseTimeMs: r.responseTimeMs,
          responseData: r.responseData,
          apiKeyId: r.apiKeyId,
          apiKeyName: r.apiKeyName,
          apiKeyPrefix: r.apiKeyPrefix,
          modelId: null,
          isSuccess: null,
          issue: null,
          details: null,
          linkedFeedback: sortedLinked.map((f) => ({
            id: f.id,
            modelId: f.modelId,
            isSuccess: f.isSuccess,
            issue: f.issue,
            details: f.details,
            createdAt: f.createdAt,
          })),
          timeToFirstFeedbackMs,
        };
      });

      const unifiedFeedback: UnifiedItem[] = unlinkedFeedback.map((f) => ({
        id: f.id,
        type: 'feedback' as const,
        createdAt: f.createdAt,
        endpoint: null,
        method: null,
        statusCode: null,
        responseTimeMs: null,
        responseData: null,
        apiKeyId: f.apiKeyId,
        apiKeyName: f.apiKeyName,
        apiKeyPrefix: f.apiKeyPrefix,
        modelId: f.modelId,
        isSuccess: f.isSuccess,
        issue: f.issue,
        details: f.details,
      }));

      // Merge and sort by createdAt descending
      const merged = [...unifiedRequests, ...unifiedFeedback].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      // Apply pagination - take items from offset to offset+limit
      const paginatedItems = merged.slice(offset, offset + limit);
      // hasMore = there are more items beyond what we returned
      const hasMore = merged.length > offset + limit;

      return jsonResponse(
        { items: paginatedItems, hasMore },
        { headers: withRequestId(undefined, requestId) }
      );
    }

    return errorJsonResponse(
      { error: 'Invalid type parameter', code: 'VALIDATION_ERROR' },
      { requestId, status: 400 }
    );
  } catch (error) {
    logApiStage('/api/auth/history', requestId, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorJsonResponse(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { requestId, status: 500 }
    );
  }
};
