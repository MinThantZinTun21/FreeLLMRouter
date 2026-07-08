import type { APIContext } from 'astro';
import { type Database, apiKeys, withUserContext } from '@/db';
import { and, eq } from 'drizzle-orm';
import {
  type UseCaseType,
  type SortType,
  type TimeRange,
  type ApiKeyPreferences,
  validateUseCases,
  validateSort,
  validateTopN,
  validateMaxErrorRate,
  validateTimeRange,
  DEFAULT_SORT,
  DEFAULT_TIME_RANGE,
} from '@/lib/api-definitions';
import {
  validateApiKey,
  validateApiKeyOnly,
  type ApiKeyValidation,
  corsHeaders,
  rateLimitedResponse,
} from '@/lib/api-auth';
import { extractApiKeyPreferences } from '@/lib/api-key-metadata';
import { access } from '@/lib/runtime-access';

type DbRole = 'app' | 'admin' | 'stats' | 'owner';

export interface ParsedModelParams {
  useCases: UseCaseType[];
  sort: SortType;
  topN?: number;
  maxErrorRate?: number;
  timeRange: TimeRange;
  myReports: boolean;
  excludeModelIds: string[];
}

export interface RequestContext {
  db: Database;
  databaseUrl: string;
  params: ParsedModelParams;
  validation: ApiKeyValidation;
  userId?: string;
}

/**
 * Parse and validate query parameters common to /models/ids and /models/full endpoints
 * Uses unified validators from api-definitions.ts (single source of truth)
 *
 * If savedPreferences is provided, those values are used as defaults when query params are not specified.
 * Query params always override saved preferences.
 */
export function parseModelParams(
  searchParams: URLSearchParams,
  savedPreferences?: ApiKeyPreferences
): ParsedModelParams {
  const ignoreSavedPreferences = searchParams.get('_ignoreSavedPreferences') === 'true';
  const prefs = ignoreSavedPreferences ? {} : savedPreferences || {};
  const hasValue = (value: string | null): value is string => value !== null && value.trim() !== '';

  // Query param provided? Use it. Otherwise use saved preference or default.
  const useCaseParam = searchParams.get('useCase');
  const useCases = hasValue(useCaseParam) ? validateUseCases(useCaseParam) : prefs.useCases || [];

  const sortParam = searchParams.get('sort');
  const sort = hasValue(sortParam) ? validateSort(sortParam) : prefs.sort || DEFAULT_SORT;

  const topNParam = searchParams.get('topN');
  const topN = hasValue(topNParam) ? validateTopN(topNParam) : prefs.topN;

  const maxErrorRateParam = searchParams.get('maxErrorRate');
  const maxErrorRate = hasValue(maxErrorRateParam)
    ? validateMaxErrorRate(maxErrorRateParam)
    : prefs.maxErrorRate;

  const timeRangeParam = searchParams.get('timeRange');
  const timeRange = hasValue(timeRangeParam)
    ? validateTimeRange(timeRangeParam)
    : prefs.timeRange || DEFAULT_TIME_RANGE;

  const myReportsParam = searchParams.get('myReports');
  const myReports = hasValue(myReportsParam) ? myReportsParam === 'true' : prefs.myReports || false;

  // Internal-only escape hatch used by /api/demo/models to neutralize demo-key exclusions.
  const clearExcludedModels = searchParams.get('_clearExcludedModels') === 'true';
  const excludeModelIds = clearExcludedModels ? [] : prefs.excludeModelIds || [];

  return { useCases, sort, topN, maxErrorRate, timeRange, myReports, excludeModelIds };
}

/**
 * Load saved preferences from an API key's metadata field
 */
async function loadApiKeyPreferences(
  databaseUrl: string,
  userId: string,
  keyId: string
): Promise<ApiKeyPreferences> {
  try {
    const [key] = await withUserContext(databaseUrl, userId, async (tx) => {
      return tx
        .select({ metadata: apiKeys.metadata })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
        .limit(1);
    });

    if (!key?.metadata) return {};

    return extractApiKeyPreferences(key.metadata);
  } catch (error) {
    console.warn('[API Params] Failed to load API key preferences:', error);
    return {};
  }
}

/**
 * Initialize common request context: validate auth, connect to DB, and parse params
 * Returns RequestContext if successful, or Response if error
 *
 * If the API key has saved preferences, they are used as defaults for any query params not specified.
 */
export async function initializeRequest(context: APIContext): Promise<RequestContext | Response> {
  // Validate API key
  const validation = await validateApiKey(context);

  if (!validation.valid) {
    if (validation.errorCode === 'CONFIG_ERROR' || validation.errorCode === 'SERVER_ERROR') {
      return new Response(JSON.stringify({ error: validation.error || 'Server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (validation.errorCode === 'RATE_LIMITED') {
      return rateLimitedResponse(validation);
    }
    return new Response(JSON.stringify({ error: validation.error || 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Get database connection
  const rt = access(context);
  const databaseUrl = rt.dbUrl('app');

  if (!databaseUrl) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const db = rt.db('app');
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Load saved preferences from API key metadata
  const savedPreferences =
    validation.keyId && validation.userId
      ? await loadApiKeyPreferences(databaseUrl, validation.userId, validation.keyId)
      : undefined;

  // Parse parameters with saved preferences as fallback defaults
  const params = parseModelParams(context.url.searchParams, savedPreferences);

  return { db, databaseUrl, params, validation };
}

/**
 * Handle myReports parameter: validates optional user context
 * Returns userId if myReports=true, else undefined
 */
export async function getUserIdIfMyReports(
  context: APIContext,
  myReports: boolean
): Promise<string | undefined> {
  if (!myReports) return undefined;

  const validation = await validateApiKeyOnly(context);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid API key');
  }

  return validation.userId;
}

/**
 * Initialize database connection only (for public endpoints)
 * Returns Database if successful, or Response if error
 */
export async function initializeDb(
  context: APIContext,
  role: DbRole = 'app'
): Promise<Database | Response> {
  const db = access(context).db(role);
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return db;
}

export interface AuthOnlyContext {
  db: Database;
  databaseUrl: string;
  userId: string | undefined;
  keyId: string | undefined;
}

/**
 * Initialize for auth-only endpoints (uses validateApiKeyOnly, doesn't count towards rate limit)
 * Returns AuthOnlyContext if successful, or Response if error
 */
export async function initializeAuthOnly(context: APIContext): Promise<AuthOnlyContext | Response> {
  const validation = await validateApiKeyOnly(context);

  if (!validation.valid) {
    const status =
      validation.errorCode === 'CONFIG_ERROR' || validation.errorCode === 'SERVER_ERROR'
        ? 500
        : 401;
    return new Response(
      JSON.stringify({
        error: validation.error || (status === 500 ? 'Server error' : 'Unauthorized'),
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  const rt = access(context);
  const databaseUrl = rt.dbUrl('app');

  if (!databaseUrl) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const db = rt.db('app');
  if (!db) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  return { db, databaseUrl, userId: validation.userId, keyId: validation.keyId };
}
