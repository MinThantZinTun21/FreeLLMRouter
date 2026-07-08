import type { APIRoute } from 'astro';
import { getClientIp, createRateLimiter, isAllowedOrigin } from '@/lib/api-utils';
import { siteConfig } from '@/lib/seo';
import { createRequestId, withRequestId, errorJsonResponse, logApiStage } from '@/lib/api-response';
import { access } from '@/lib/runtime-access';

// Lightweight in-memory cache (best effort per instance).
// This keeps the endpoint anonymous while reducing demo key burn.
const cache = new Map<string, { body: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // reuse upstream response for 60s

// Rate limiter: 20 requests per IP per minute
const rateLimiter = createRateLimiter(20, 60_000);

// Allowed origins for demo endpoint (blocks off-site scraping)
const ALLOWED_ORIGINS = [
  siteConfig.url,
  'https://staging.free-llm-router.pages.dev',
  'http://localhost:4321',
  'http://localhost:3000',
];

/**
 * Demo proxy endpoint for the website.
 * Uses a server-side DEMO_API_KEY to fetch models without exposing credentials to the browser.
 */
export const GET: APIRoute = async ({ locals, url, request }) => {
  const requestId = createRequestId();
  logApiStage('/api/demo/models', requestId, 'start', { method: 'GET' });

  // Check origin first (blocks off-site scraping)
  if (!isAllowedOrigin(request, ALLOWED_ORIGINS)) {
    return errorJsonResponse({ error: 'Forbidden', code: 'FORBIDDEN' }, { requestId, status: 403 });
  }

  const rt = access(locals);
  const demoKey = rt.env('DEMO_API_KEY');
  const baseUrl = rt.env('BETTER_AUTH_URL') || url.origin;

  if (!demoKey) {
    return errorJsonResponse(
      { error: 'Demo API key not configured', code: 'CONFIG_ERROR' },
      { requestId, status: 500 }
    );
  }

  const ip = getClientIp(request);
  const { limited } = rateLimiter.check(ip);
  if (limited) {
    return errorJsonResponse(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      { requestId, status: 429 }
    );
  }

  const cacheKey = url.search;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return new Response(cached.body, {
      status: 200,
      headers: withRequestId(
        {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
        requestId
      ),
    });
  }

  try {
    const params = new URLSearchParams(url.searchParams);
    // Neutralize demo-key saved preferences, but keep caller-provided query params.
    params.set('_ignoreSavedPreferences', 'true');
    // Force myReports=false for demo - shows community data, not demo user's reports
    params.set('myReports', 'false');
    // Internal flag consumed by /api/v1/model routes to ignore saved key exclusions.
    params.set('_clearExcludedModels', 'true');
    const fullUrl = `${baseUrl}/api/v1/models/full${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${demoKey}` },
    });

    const text = await response.text();

    if (!response.ok) {
      const upstreamBody = text.replace(/\s+/g, ' ').trim().slice(0, 300);
      logApiStage('/api/demo/models', requestId, 'upstream_error', {
        upstreamStatus: response.status,
        upstreamBody,
      });
      if (response.status === 401) {
        return errorJsonResponse(
          {
            error: 'Demo API key is invalid for the active database',
            code: 'DEMO_KEY_INVALID',
          },
          { requestId, status: 500 }
        );
      }
      return errorJsonResponse(
        {
          error: text ? 'Failed to fetch models' : 'Failed to fetch models',
          code: response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
        },
        { requestId, status: response.status === 429 ? 429 : 502 }
      );
    }

    cache.set(cacheKey, { body: text, expiresAt: now + CACHE_TTL_MS });

    return new Response(text, {
      status: 200,
      headers: withRequestId(
        {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
        requestId
      ),
    });
  } catch (error) {
    logApiStage('/api/demo/models', requestId, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorJsonResponse(
      { error: 'Failed to fetch models', code: 'UPSTREAM_ERROR' },
      { requestId, status: 502 }
    );
  }
};
