import type { APIContext } from 'astro';
import { base64Url } from '@better-auth/utils/base64';
import { type AuthEnv } from './auth';
import { eq, and, sql } from 'drizzle-orm';
import {
  createDb,
  apiKeys,
  users,
  apiRequestLogs,
  withKeyHashContext,
  withUserContext,
} from '@/db';
import { access } from '@/lib/runtime-access';

export interface ApiKeyValidation {
  valid: boolean;
  error?: string;
  errorCode?: string;
  userId?: string;
  keyId?: string;
  remaining?: number;
  limit?: number;
  lastRequest?: Date;
  timeWindow?: number;
  requestCount?: number;
}

// CORS headers - include on ALL responses from protected endpoints
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Extracts env vars from Cloudflare runtime or import.meta.env
 * Required for API key verification and auth context setup.
 */
function getEnvConfig(context: APIContext): Partial<AuthEnv> & { missing: string[] } {
  const rt = access(context);
  const databaseUrl = rt.dbUrl('app');
  const baseUrl = rt.env('BETTER_AUTH_URL');
  const secret = rt.env('BETTER_AUTH_SECRET');

  const missing: string[] = [];
  if (!databaseUrl) missing.push('DATABASE_URL');
  if (!baseUrl) missing.push('BETTER_AUTH_URL');
  if (!secret) missing.push('BETTER_AUTH_SECRET');

  return { databaseUrl, baseUrl, secret, missing };
}

/**
 * Tracks per-key usage statistics (no rate limiting, just tracking).
 * Increments requestCount and updates lastRequest timestamp.
 */
async function trackKeyUsage(db: ReturnType<typeof createDb>, keyId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({
      requestCount: sql`COALESCE(${apiKeys.requestCount}, 0) + 1`,
      lastRequest: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(apiKeys.id, keyId));
}

/**
 * Checks and updates user-level rate limits.
 * Enforces 200 requests/24 hours per user across all API keys.
 * Uses PostgreSQL row locking for atomic enforcement (zero overage).
 */
async function checkUserRateLimit(
  userId: string,
  db: ReturnType<typeof createDb>
): Promise<Omit<ApiKeyValidation, 'valid' | 'keyId'>> {
  // Atomic rate limit check with strict enforcement via PostgreSQL row locking
  // Reset logic and limit check both in SQL for zero-race atomic operation
  const now = new Date();

  // Single atomic UPDATE with SQL-side reset check and limit enforcement
  const result = await db
    .update(users)
    .set({
      // CASE expression: reset to 1 if window expired, else increment
      requestCount: sql`
        CASE
          WHEN ${users.lastRequest} IS NULL
            OR EXTRACT(EPOCH FROM (NOW() - ${users.lastRequest})) * 1000 >= COALESCE(${users.rateLimitTimeWindow}, 86400000)
          THEN 1
          ELSE COALESCE(${users.requestCount}, 0) + 1
        END
      `,
      // Compute remaining based on new requestCount
      remaining: sql`
        GREATEST(
          COALESCE(${users.rateLimitMax}, 200) -
          CASE
            WHEN ${users.lastRequest} IS NULL
              OR EXTRACT(EPOCH FROM (NOW() - ${users.lastRequest})) * 1000 >= COALESCE(${users.rateLimitTimeWindow}, 86400000)
            THEN 1
            ELSE COALESCE(${users.requestCount}, 0) + 1
          END,
          0
        )
      `,
      lastRequest: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(
      // Strict enforcement: Allow if window reset OR under limit
      // PostgreSQL row lock serializes all updates - zero overage in practice
      and(
        eq(users.id, userId),
        sql`
          (${users.lastRequest} IS NULL
           OR EXTRACT(EPOCH FROM (NOW() - ${users.lastRequest})) * 1000 >= COALESCE(${users.rateLimitTimeWindow}, 86400000))
          OR COALESCE(${users.requestCount}, 0) < COALESCE(${users.rateLimitMax}, 200)
        `
      )
    )
    .returning({
      requestCount: users.requestCount,
      remaining: users.remaining,
      rateLimitMax: users.rateLimitMax,
      rateLimitTimeWindow: users.rateLimitTimeWindow,
      lastRequest: users.lastRequest,
    });

  // If no rows updated, either limit exceeded OR user doesn't exist
  if (!result || result.length === 0) {
    // Fetch current state to distinguish between rate-limited vs missing user
    const [current] = await db
      .select({
        requestCount: users.requestCount,
        rateLimitMax: users.rateLimitMax,
        rateLimitTimeWindow: users.rateLimitTimeWindow,
        lastRequest: users.lastRequest,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // User doesn't exist - this shouldn't happen if API key was valid, but handle it
    if (!current) {
      return { error: 'User not found', errorCode: 'USER_NOT_FOUND' };
    }

    // User exists but update failed - rate limit exceeded
    return {
      error: 'Rate limit exceeded',
      errorCode: 'RATE_LIMITED',
      remaining: 0,
      limit: current.rateLimitMax ?? 200,
      lastRequest: current.lastRequest ?? new Date(), // Fallback to now for consistent Retry-After headers
      timeWindow: current.rateLimitTimeWindow ?? 86400000,
      requestCount: current.requestCount ?? current.rateLimitMax ?? 200,
    };
  }

  const updated = result[0];
  return {
    remaining: updated.remaining ?? 0,
    limit: updated.rateLimitMax ?? 200,
    lastRequest: updated.lastRequest ?? now,
    timeWindow: updated.rateLimitTimeWindow ?? 86400000,
    requestCount: updated.requestCount ?? 0,
  };
}

/**
 * Validates API key from Authorization header.
 * Expected format: "Bearer fma_xxxxx"
 */
export async function validateApiKey(context: APIContext): Promise<ApiKeyValidation> {
  const envResult = getEnvConfig(context);
  if (envResult.missing.length > 0) {
    return {
      valid: false,
      error: `Server configuration error: missing ${envResult.missing.join(', ')}`,
      errorCode: 'CONFIG_ERROR',
    };
  }

  const authEnv: AuthEnv = {
    databaseUrl: envResult.databaseUrl!,
    baseUrl: envResult.baseUrl!,
    secret: envResult.secret!,
  };

  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header', errorCode: 'MISSING_AUTH' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'Invalid Authorization format. Use: Bearer <api-key>',
      errorCode: 'INVALID_FORMAT',
    };
  }

  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return { valid: false, error: 'API key is empty', errorCode: 'EMPTY_KEY' };
  }

  try {
    // Hash key with SHA-256 (Better Auth format: base64url, no padding)
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
    const hash = base64Url.encode(new Uint8Array(hashBuffer), { padding: false });

    // Validate key using RLS-protected transaction (sets app.api_key_hash for auth bootstrap)
    const result = await withKeyHashContext(authEnv.databaseUrl, hash, async (db) => {
      return db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.key, hash), eq(apiKeys.enabled, true)))
        .limit(1);
    });

    if (!result.length) {
      return { valid: false, error: 'Invalid API key', errorCode: 'INVALID_KEY' };
    }

    const key = result[0];

    if (key.expiresAt && key.expiresAt < new Date()) {
      return { valid: false, error: 'API key expired', errorCode: 'EXPIRED_KEY' };
    }

    // Check user-level rate limits and track usage under RLS user context
    const rateLimitCheck = await withUserContext(authEnv.databaseUrl, key.userId, async (db) => {
      const result = await checkUserRateLimit(key.userId, db);
      if (result.errorCode) return result;
      await trackKeyUsage(db, key.id);
      return result;
    });

    if (rateLimitCheck.errorCode === 'RATE_LIMITED') {
      return {
        valid: false,
        userId: key.userId,
        keyId: key.id,
        ...rateLimitCheck,
      };
    }

    if (rateLimitCheck.errorCode) {
      return {
        valid: false,
        error: rateLimitCheck.error || 'Rate limit check failed',
        errorCode: rateLimitCheck.errorCode,
      };
    }

    return {
      valid: true,
      userId: key.userId,
      keyId: key.id,
      remaining: rateLimitCheck.remaining,
      limit: rateLimitCheck.limit,
      lastRequest: rateLimitCheck.lastRequest,
      timeWindow: rateLimitCheck.timeWindow,
      requestCount: rateLimitCheck.requestCount,
    };
  } catch (error) {
    console.error('[API Auth] Verification error:', error);
    return { valid: false, error: 'Internal server error', errorCode: 'SERVER_ERROR' };
  }
}

/**
 * Generate rate limit headers from validation result.
 * X-RateLimit-Reset = lastRequest + timeWindow (sliding window)
 */
export function rateLimitHeaders(validation: ApiKeyValidation): Record<string, string> {
  const headers: Record<string, string> = {};

  if (validation.limit !== undefined) {
    headers['X-RateLimit-Limit'] = String(validation.limit);
  }
  if (validation.remaining !== undefined) {
    headers['X-RateLimit-Remaining'] = String(validation.remaining);
  }
  if (validation.lastRequest && validation.timeWindow) {
    const resetTime = new Date(validation.lastRequest.getTime() + validation.timeWindow);
    headers['X-RateLimit-Reset'] = String(Math.floor(resetTime.getTime() / 1000));
  }

  return headers;
}

/**
 * 401 Unauthorized response - ALWAYS includes CORS headers
 */
export function unauthorizedResponse(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * 429 Rate Limited response - ALWAYS includes CORS headers
 */
export function rateLimitedResponse(validation: ApiKeyValidation): Response {
  const headers: Record<string, string> = { ...corsHeaders, ...rateLimitHeaders(validation) };

  // Retry-After in seconds until reset
  if (validation.lastRequest && validation.timeWindow) {
    const resetTime = validation.lastRequest.getTime() + validation.timeWindow;
    const retryAfter = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000));
    headers['Retry-After'] = String(retryAfter);
  }

  return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * 500 Server Error response - ALWAYS includes CORS headers
 */
export function serverErrorResponse(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 500,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Logs an API request to the apiRequestLogs table.
 * Call this after processing the request to capture status code.
 */
export async function logApiRequest(
  databaseUrl: string,
  params: {
    userId: string;
    apiKeyId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    responseTimeMs?: number;
    responseData?: {
      ids?: string[];
      count: number;
      params?: {
        useCases?: string[];
        sort?: string;
        topN?: number;
        maxErrorRate?: number;
        timeRange?: string;
        myReports?: boolean;
        excludeModelIds?: string[];
      };
    };
  }
): Promise<string> {
  const id = crypto.randomUUID();
  try {
    await withUserContext(databaseUrl, params.userId, async (db) => {
      await db.insert(apiRequestLogs).values({
        id,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        responseTimeMs: params.responseTimeMs ?? null,
        responseData: params.responseData ? JSON.stringify(params.responseData) : null,
        createdAt: new Date(),
      });
    });
  } catch (error) {
    // Log but don't fail the request if logging fails
    console.error('[API Auth] Failed to log request:', error);
  }
  return id;
}

/**
 * Validates API key without counting towards rate limit.
 * Use this for endpoints where the user is contributing (e.g., feedback).
 * Queries the database directly instead of using Better Auth's verifyApiKey.
 */
export async function validateApiKeyOnly(context: APIContext): Promise<ApiKeyValidation> {
  const envResult = getEnvConfig(context);
  if (envResult.missing.length > 0) {
    return {
      valid: false,
      error: `Server configuration error: missing ${envResult.missing.join(', ')}`,
      errorCode: 'CONFIG_ERROR',
    };
  }

  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header', errorCode: 'MISSING_AUTH' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'Invalid Authorization format. Use: Bearer <api-key>',
      errorCode: 'INVALID_FORMAT',
    };
  }

  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return { valid: false, error: 'API key is empty', errorCode: 'EMPTY_KEY' };
  }

  try {
    // Hash key with SHA-256 (Better Auth format: base64url, no padding)
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
    const hash = base64Url.encode(new Uint8Array(hashBuffer), { padding: false });

    // RLS-protected query - no rate limit tracking
    const result = await withKeyHashContext(envResult.databaseUrl!, hash, async (db) => {
      return db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.key, hash), eq(apiKeys.enabled, true)))
        .limit(1);
    });

    if (!result.length) {
      return { valid: false, error: 'Invalid API key', errorCode: 'INVALID_KEY' };
    }

    const key = result[0];
    if (key.expiresAt && key.expiresAt < new Date()) {
      return { valid: false, error: 'API key expired', errorCode: 'EXPIRED_KEY' };
    }

    return { valid: true, userId: key.userId, keyId: key.id };
  } catch (error) {
    console.error('[API Auth] Validation error:', error);
    return { valid: false, error: 'Internal server error', errorCode: 'SERVER_ERROR' };
  }
}
