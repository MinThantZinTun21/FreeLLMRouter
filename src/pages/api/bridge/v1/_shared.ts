import type { APIRoute } from 'astro';
import { jsonResponse } from '@/lib/api-response';
import { isBridgeError } from '@/bridge/errors';

export function handleBridgeRouteError(error: unknown, fallbackMessage: string) {
  if (isBridgeError(error)) {
    return jsonResponse({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  return jsonResponse(
    { error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 }
  );
}

export function streamBridgeResponse(
  stream: ReadableStream<Uint8Array> | null,
  contentType: string,
  headers?: Record<string, string>
) {
  if (!stream) {
    return jsonResponse({ error: 'Empty stream from provider' }, { status: 502 });
  }
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...headers,
    },
  });
}
