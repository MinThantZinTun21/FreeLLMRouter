import type { APIRoute } from 'astro';
import { resolveTenantContext } from '@/bridge/auth';
import { routeRequest } from '@/bridge/router';
import { handleBridgeRouteError } from './_shared';

function validateEmbeddingsPayload(payload: unknown): payload is {
  input: string | string[];
  dimensions?: number;
} {
  if (!payload || typeof payload !== 'object') return false;
  const input = (payload as { input?: unknown }).input;
  if (typeof input === 'string') return input.length > 0;
  if (Array.isArray(input))
    return input.length > 0 && input.every((item) => typeof item === 'string');
  return false;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    if (!validateEmbeddingsPayload(body)) {
      return new Response(JSON.stringify({ error: 'Invalid embeddings payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const tenant = await resolveTenantContext(request);
    const result = await routeRequest({
      routeType: 'embeddings',
      tenant,
      payload: body as Record<string, unknown>,
    });
    return new Response(JSON.stringify(result.response), {
      status: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleBridgeRouteError(error, 'bridge embeddings failed');
  }
};
