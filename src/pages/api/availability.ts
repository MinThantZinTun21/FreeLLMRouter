import type { APIRoute } from 'astro';
import { getModelAvailability } from '@/services/openrouter';
import { initializeDb } from '@/lib/api-params';
import { validateUseCases, validateSort } from '@/lib/api-definitions';
import {
  apiResponseHeaders,
  jsonResponse,
  createRequestId,
  withRequestId,
  errorJsonResponse,
  logApiStage,
} from '@/lib/api-response';

/**
 * Availability endpoint for model availability history.
 * Returns daily availability snapshots for all models.
 *
 * Query params:
 * - days: number of days to fetch (default 90, max 90)
 * - useCases: comma-separated use case filters (chat, vision, tools, longContext, reasoning)
 * - sort: sort order (contextLength, maxOutput, capable, name)
 */
export const GET: APIRoute = async (context) => {
  const requestId = createRequestId();
  logApiStage('/api/availability', requestId, 'start', { method: 'GET' });

  try {
    const db = await initializeDb(context, 'admin');
    if (db instanceof Response) {
      return errorJsonResponse(
        { error: 'Database not configured', code: 'CONFIG_ERROR' },
        { requestId, status: 500, headers: apiResponseHeaders({ cors: false }) }
      );
    }

    const params = context.url.searchParams;

    const daysParam = params.get('days');
    const days = daysParam ? Math.min(90, Math.max(1, parseInt(daysParam, 10))) : 90;

    const useCasesParam = params.get('useCases');
    const useCases = useCasesParam ? validateUseCases(useCasesParam) : undefined;

    const sortParam = params.get('sort');
    const sort = sortParam ? validateSort(sortParam) : undefined;
    logApiStage('/api/availability', requestId, 'query_start', { days, useCases, sort });

    const { models, dates } = await getModelAvailability(db, {
      days,
      useCases: useCases && useCases.length > 0 ? useCases : undefined,
      sort,
    });

    return jsonResponse(
      {
        models,
        dates,
        lastUpdated: new Date().toISOString(),
        count: models.length,
      },
      {
        headers: withRequestId(
          apiResponseHeaders({ cacheControl: 'public, max-age=300', cors: false }),
          requestId
        ),
      }
    );
  } catch (error) {
    logApiStage('/api/availability', requestId, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorJsonResponse(
      { error: 'Failed to fetch availability data', code: 'INTERNAL_ERROR' },
      { requestId, status: 500, headers: apiResponseHeaders({ cors: false }) }
    );
  }
};
