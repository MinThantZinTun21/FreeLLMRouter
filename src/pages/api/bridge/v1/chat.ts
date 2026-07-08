import type { APIRoute } from 'astro';
import { resolveTenantContext } from '@/bridge/auth';
import { routeRequest } from '@/bridge/router';
import { handleBridgeRouteError, streamBridgeResponse } from './_shared';

interface ChatMessagePart {
  type?: string;
  text?: string;
  image_url?: { url?: string };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatMessagePart[];
}

function validateChatPayload(payload: unknown): payload is {
  messages: ChatMessage[];
  stream?: boolean;
  tools?: unknown[];
  response_format?: { type?: string };
} {
  if (!payload || typeof payload !== 'object') return false;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      ['system', 'user', 'assistant', 'tool'].includes((m as { role?: string }).role || '')
  );
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    if (!validateChatPayload(body)) {
      return new Response(JSON.stringify({ error: 'Invalid chat payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tenant = await resolveTenantContext(request);
    const result = await routeRequest({
      routeType: 'chat',
      tenant,
      payload: body as Record<string, unknown>,
      requirements: {
        tools: Array.isArray(body.tools) && body.tools.length > 0,
        jsonMode: body.response_format?.type === 'json_object',
      },
    });

    if (result.stream) {
      return streamBridgeResponse(result.stream, result.streamContentType || 'text/event-stream');
    }

    return new Response(JSON.stringify(result.response), {
      status: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleBridgeRouteError(error, 'bridge chat failed');
  }
};
