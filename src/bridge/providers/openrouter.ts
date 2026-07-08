import type { ProviderAdapter, ProviderInvokeParams, ProviderInvokeResult } from './types';
import type { BridgeRouteType, CatalogModel } from '../types';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function parseUsage(data: Record<string, unknown>) {
  const usage = (data.usage || {}) as Record<string, number>;
  return {
    requestTokens: usage.prompt_tokens,
    responseTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    source: 'provider' as const,
  };
}

function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function classifyError(status: number, body: unknown): { code: string; message: string } {
  const payload = (body || {}) as Record<string, unknown>;
  const nested = (payload.error || {}) as Record<string, unknown>;
  const message = String(nested.message || payload.message || `OpenRouter error (${status})`);
  if (status === 429) return { code: 'RATE_LIMIT', message };
  if (status === 401 || status === 403) return { code: 'AUTH', message };
  if (status >= 500) return { code: 'UPSTREAM', message };
  return { code: 'PROVIDER_ERROR', message };
}

async function invokeChat(params: ProviderInvokeParams): Promise<ProviderInvokeResult> {
  const stream = Boolean(params.payload.stream);
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://free-llm-router.vercel.app',
      'X-Title': 'Free LLM Router Bridge',
    },
    body: JSON.stringify({
      ...params.payload,
      model: params.model.modelId,
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

async function invokeEmbeddings(params: ProviderInvokeParams): Promise<ProviderInvokeResult> {
  const response = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params.payload,
      model: params.model.modelId,
    }),
  });

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

export const openRouterAdapter: ProviderAdapter = {
  name: 'openrouter',
  supports(routeType: BridgeRouteType, _model: CatalogModel) {
    return routeType === 'chat' || routeType === 'vision' || routeType === 'embeddings';
  },
  invoke(params) {
    if (params.routeType === 'embeddings') return invokeEmbeddings(params);
    return invokeChat(params);
  },
};
