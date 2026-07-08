import type { APIRoute } from 'astro';
import {
  getFeedbackCountsByRange,
  getFeedbackTimeline,
  type TimeRange,
} from '@/services/openrouter';
import { initializeDb, getUserIdIfMyReports } from '@/lib/api-params';
import {
  VALID_TIME_RANGES_WITH_LABELS,
  validateTimeRange,
  validateUseCases,
  validateSort,
  DEFAULT_TIME_RANGE,
} from '@/lib/api-definitions';
import { apiResponseHeaders, jsonResponse } from '@/lib/api-response';
import { exposeErrorRateDetails } from '@/lib/feature-flags';
import { access } from '@/lib/runtime-access';

function validateRange(value: string | null): TimeRange {
  const validated = validateTimeRange(value);
  // Only allow UI-relevant time ranges (not 'all')
  if (VALID_TIME_RANGES_WITH_LABELS.includes(validated as TimeRange)) {
    return validated as TimeRange;
  }
  return DEFAULT_TIME_RANGE as TimeRange;
}

/**
 * Health endpoint for the health page and dashboard.
 * No authentication required - returns public community reports by default.
 *
 * Query params:
 * - range: time range (15m, 30m, 1h, 6h, 24h, 7d, 30d)
 * - myReports: filter to user's own reports (requires auth)
 * - useCases: comma-separated use case filters (chat, vision, tools, longContext, reasoning)
 * - sort: sort order (contextLength, maxOutput, capable, leastIssues, newest)
 * - topN: limit to top N results
 * - maxErrorRate: filter to models with error rate <= this value (0-100)
 */
export const GET: APIRoute = async (context) => {
  try {
    const db = await initializeDb(context);
    if (db instanceof Response) return db;
    const rt = access(context);
    const statsDbUrl = rt.dbUrl('stats');

    const params = context.url.searchParams;
    const range = validateRange(params.get('range'));

    // Optional myReports filter (requires authentication)
    const myReports = params.get('myReports') === 'true';
    let userId: string | undefined;

    try {
      userId = await getUserIdIfMyReports(context, myReports);
    } catch {
      // If myReports=true but no valid API key, gracefully fall back to community data
    }

    // Parse filter params
    const useCasesParam = params.get('useCases');
    const useCases = useCasesParam ? validateUseCases(useCasesParam) : undefined;

    const sortParam = params.get('sort');
    const sort = sortParam ? validateSort(sortParam) : undefined;

    const topNParam = params.get('topN');
    const topN = topNParam ? parseInt(topNParam, 10) : undefined;

    const maxErrorRateParam = params.get('maxErrorRate');
    const maxErrorRate = maxErrorRateParam ? parseFloat(maxErrorRateParam) : undefined;

    // Get filtered issues first
    const issues = await getFeedbackCountsByRange(db, {
      range,
      userId,
      statsDbUrl,
      useCases: useCases && useCases.length > 0 ? useCases : undefined,
      sort,
      topN: topN && topN > 0 ? topN : undefined,
      maxErrorRate: maxErrorRate !== undefined && !isNaN(maxErrorRate) ? maxErrorRate : undefined,
    });

    // Extract model IDs from filtered issues to filter timeline
    const filteredModelIds = issues.map((i) => i.modelId);

    // Single source: stats DB functions (fma_stats role / RLS-compliant)
    const timeline = await getFeedbackTimeline(db, range, userId, statsDbUrl, filteredModelIds);
    const includeErrorRateDetails = exposeErrorRateDetails({
      EXPOSE_ERROR_RATE_DETAILS: rt.env('EXPOSE_ERROR_RATE_DETAILS'),
    });
    const responseIssues = includeErrorRateDetails
      ? issues
      : issues.map(
          ({
            modelId,
            modelName,
            errorRate,
            modality,
            inputModalities,
            outputModalities,
            supportedParameters,
            contextLength,
            maxCompletionTokens,
          }) => ({
            modelId,
            modelName,
            errorRate,
            modality,
            inputModalities,
            outputModalities,
            supportedParameters,
            contextLength,
            maxCompletionTokens,
          })
        );
    const responseTimeline = includeErrorRateDetails
      ? timeline
      : timeline.map((point) => {
          const sanitized: Record<string, string | number> = { date: point.date };
          for (const [key, value] of Object.entries(point)) {
            if (key === 'date' || key.endsWith('_meta')) continue;
            if (typeof value === 'number') {
              sanitized[key] = value;
              continue;
            }
            if (value && typeof value === 'object' && 'errorRate' in value) {
              const withErrorRate = value as { errorRate: number };
              sanitized[key] = withErrorRate.errorRate;
            }
          }
          return sanitized;
        });

    return jsonResponse(
      {
        issues: responseIssues,
        timeline: responseTimeline,
        range,
        lastUpdated: new Date().toISOString(),
        count: responseIssues.length,
      },
      { headers: apiResponseHeaders({ cacheControl: 'public, max-age=60', cors: false }) }
    );
  } catch (error) {
    console.error('[API/health] Error:', error);
    return jsonResponse(
      { error: 'Failed to fetch health data' },
      { status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }
};
