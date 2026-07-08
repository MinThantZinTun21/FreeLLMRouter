import type { ProviderAdapter, ProviderInvokeParams, ProviderInvokeResult } from './types';
import type { BridgeRouteType, CatalogModel } from '../types';

import { getDirectBaseUrlSync } from './registry';

export function getDirectBaseUrl(provider: string): string | null {
  return getDirectBaseUrlSync(provider);
}

function parseUsage(data: Record<string, unknown>) {
  const usage = (data.usage || {}) as Record<string, number>;
  return {
    requestTokens: usage.prompt_tokens,
    responseTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    source: 'provider' as const,
  };
}

function classifyError(status: number, body: unknown): { code: string; message: string } {
  const payload = (body || {}) as Record<string, unknown>;
  const nested = (payload.error || {}) as Record<string, unknown>;
  const message = String(nested.message || payload.message || `Provider error (${status})`);
  if (status === 429) return { code: 'RATE_LIMIT', message };
  if (status === 401 || status === 403) return { code: 'AUTH', message };
  if (status >= 500) return { code: 'UPSTREAM', message };
  return { code: 'PROVIDER_ERROR', message };
}

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function invokeOpenAiCompatible(
  baseUrl: string,
  params: ProviderInvokeParams
): Promise<ProviderInvokeResult> {
  const path = params.routeType === 'embeddings' ? '/embeddings' : '/chat/completions';
  const stream = params.routeType !== 'embeddings' && Boolean(params.payload.stream);

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params.payload,
      model: params.model.modelId.includes('/')
        ? params.model.modelId.split('/').slice(1).join('/')
        : params.model.modelId,
      stream,
    }),
  });

  if (stream && response.ok) {
    return {
      ok: true,
      statusCode: response.status,
      stream: response.body,
      streamContentType: response.headers.get('content-type') || 'text/event-stream',
      usage: { source: 'unknown' },
    };
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = classifyError(response.status, body);
    return {
      ok: false,
      statusCode: response.status,
      body,
      usage: { source: 'unknown' },
      errorCode: err.code,
      errorMessage: err.message,
      retryAfterSeconds: parseRetryAfter(response),
    };
  }

  return {
    ok: true,
    statusCode: response.status,
    body,
    usage: parseUsage(body as Record<string, unknown>),
  };
}

export const directAdapter: ProviderAdapter = {
  name: 'direct',
  supports(routeType: BridgeRouteType, model: CatalogModel) {
    if (routeType !== 'chat' && routeType !== 'vision' && routeType !== 'embeddings') return false;
    return Boolean(getDirectBaseUrlSync(model.provider));
  },
  invoke(params) {
    const baseUrl = getDirectBaseUrlSync(params.model.provider);
    if (!baseUrl) {
      return Promise.resolve({
        ok: false,
        statusCode: 400,
        usage: { source: 'unknown' },
        errorCode: 'UNSUPPORTED_PROVIDER',
        errorMessage: `No direct base URL for provider ${params.model.provider}`,
      });
    }
    return invokeOpenAiCompatible(baseUrl, params);
  },
};
