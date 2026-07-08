import type { APIRoute } from 'astro';
import { getFilteredModels, checkModelsFreshness, ensureFreshModels } from '@/services/openrouter';
import { initializeDb, getUserIdIfMyReports, parseModelParams } from '@/lib/api-params';
import { corsHeaders, logApiRequest, validateApiKeyOnly } from '@/lib/api-auth';
import {
  apiResponseHeaders,
  jsonResponse,
  noContentResponse,
  type HeaderMap,
} from '@/lib/api-response';
import { access } from '@/lib/runtime-access';

/**
 * Lightweight endpoint that returns only model IDs
 * Returns only model IDs - no feedback counts, no full model objects
 * Public endpoint. API key is optional and only used for user-specific features.
 */
export const GET: APIRoute = async (context) => {
  const startTime = performance.now();
  const db = await initializeDb(context);
  if (db instanceof Response) return db;

  try {
    const params = parseModelParams(context.url.searchParams);
    const { useCases, sort, topN, maxErrorRate, timeRange, myReports, excludeModelIds } = params;
    const rt = access(context);
    const statsDbUrl = rt.dbUrl('stats');
    const databaseUrl = rt.dbUrl('app');
    const authHeader = context.request.headers.get('Authorization');
    const validation = authHeader ? await validateApiKeyOnly(context) : undefined;

    // Get userId if myReports is enabled (optional authentication)
    let userId: string | undefined;

    try {
      userId = await getUserIdIfMyReports(context, myReports);
    } catch (error) {
      // If myReports=true but no valid API key, gracefully fall back to community data
      // This allows unauthenticated users to see community data without error
    }

    // Check data freshness (non-blocking)
    const freshness = await checkModelsFreshness(db);

    // If critically stale (>2h), attempt fallback sync with lock (prevents thundering herd)
    if (freshness.isCriticallyStale) {
      await ensureFreshModels(db);
    }

    // Fetch filtered and sorted models
    const allModels = await getFilteredModels(
      db,
      useCases,
      sort,
      maxErrorRate,
      timeRange,
      userId,
      statsDbUrl
    );

    // Apply exclusions first, then topN for deterministic behavior.
    const excludedSet = new Set(excludeModelIds);
    const withoutExcluded = allModels.filter((model) => !excludedSet.has(model.id));
    const models = topN ? withoutExcluded.slice(0, topN) : withoutExcluded;
    const ids = models.map((m) => m.id);

    // Log request and get requestId
    const requestId =
      databaseUrl && validation?.valid && validation.userId && validation.keyId
        ? await logApiRequest(databaseUrl, {
            userId: validation.userId,
            apiKeyId: validation.keyId,
            endpoint: '/api/v1/models/ids',
            method: 'GET',
            statusCode: 200,
            responseTimeMs: Math.round(performance.now() - startTime),
            responseData: {
              ids,
              count: ids.length,
              params: { useCases, sort, topN, maxErrorRate, timeRange, myReports, excludeModelIds },
            },
          })
        : undefined;

    // Build response headers
    const headers: HeaderMap = apiResponseHeaders({
      cacheControl: 'public, max-age=60',
      validation: validation?.valid ? validation : undefined,
    });

    // Add staleness warning headers if data is stale
    if (!freshness.isFresh) {
      headers['X-Data-Stale'] = 'true';
      headers['X-Data-Age-Seconds'] = String(Math.round(freshness.ageMs / 1000));
    }

    return jsonResponse(
      {
        ids,
        count: ids.length,
        requestId: requestId ?? undefined,
        _meta: !freshness.isFresh
          ? { stale: true, ageSeconds: Math.round(freshness.ageMs / 1000) }
          : undefined,
      },
      { headers }
    );
  } catch (error) {
    console.error('[API/models/ids] Error:', error);

    return jsonResponse(
      { error: 'Failed to fetch model IDs' },
      { status: 500, headers: apiResponseHeaders() }
    );
  }
};

export const OPTIONS: APIRoute = async () => {
  return noContentResponse({ headers: corsHeaders });
};
