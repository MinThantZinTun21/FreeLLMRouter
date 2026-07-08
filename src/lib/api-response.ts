import type { ApiKeyValidation } from '@/lib/api-auth';
import { corsHeaders, rateLimitHeaders } from '@/lib/api-auth';

export type HeaderMap = Record<string, string>;
export type ErrorResponseBody = { error: string; code?: string; requestId?: string };

export function mergeHeaders(...parts: Array<HeaderMap | undefined>): HeaderMap {
  return Object.assign({}, ...parts.filter(Boolean));
}

export function jsonResponse(
  body: unknown,
  options?: { status?: number; headers?: HeaderMap }
): Response {
  const headers = mergeHeaders({ 'Content-Type': 'application/json' }, options?.headers);
  return new Response(JSON.stringify(body), { status: options?.status ?? 200, headers });
}

export function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function withRequestId(headers: HeaderMap | undefined, requestId: string): HeaderMap {
  return mergeHeaders(headers, { 'X-Request-Id': requestId });
}

export function errorJsonResponse(
  body: ErrorResponseBody,
  options: { requestId: string; status: number; headers?: HeaderMap }
): Response {
  return jsonResponse(
    { ...body, requestId: body.requestId || options.requestId },
    { status: options.status, headers: withRequestId(options.headers, options.requestId) }
  );
}

export function logApiStage(
  route: string,
  requestId: string,
  stage: string,
  extra?: Record<string, unknown>
): void {
  const payload = {
    route,
    requestId,
    stage,
    ts: new Date().toISOString(),
    ...extra,
  };
  console.log(JSON.stringify(payload));
}

export function noContentResponse(options?: { status?: number; headers?: HeaderMap }): Response {
  return new Response(null, {
    status: options?.status ?? 204,
    headers: options?.headers,
  });
}

export function apiResponseHeaders(options?: {
  cacheControl?: string;
  validation?: ApiKeyValidation;
  cors?: boolean;
  extra?: HeaderMap;
}): HeaderMap {
  const headers: HeaderMap = {};

  if (options?.cacheControl) {
    headers['Cache-Control'] = options.cacheControl;
  }

  if (options?.cors !== false) {
    Object.assign(headers, corsHeaders);
  }

  if (options?.validation) {
    Object.assign(headers, rateLimitHeaders(options.validation));
  }

  if (options?.extra) {
    Object.assign(headers, options.extra);
  }

  return headers;
}
