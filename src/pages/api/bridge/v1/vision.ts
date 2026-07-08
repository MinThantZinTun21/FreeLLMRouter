import type { APIRoute } from 'astro';
import { resolveTenantContext } from '@/bridge/auth';
import { routeRequest } from '@/bridge/router';
import { handleBridgeRouteError } from './_shared';

type VisionMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function validateVisionPayload(payload: unknown): payload is {
  messages: Array<{ role: string; content: VisionMessagePart[] }>;
  max_tokens?: number;
} {
  if (!payload || typeof payload !== 'object') return false;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every((m) => {
    if (!m || typeof m !== 'object') return false;
    const content = (m as { content?: unknown }).content;
    if (!Array.isArray(content) || content.length === 0) return false;
    return content.some(
      (part) => part && typeof part === 'object' && (part as { type?: string }).type === 'image_url'
    );
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    if (!validateVisionPayload(body)) {
      return new Response(JSON.stringify({ error: 'Invalid vision payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const tenant = await resolveTenantContext(request);
    const result = await routeRequest({
      routeType: 'vision',
      tenant,
      payload: body as Record<string, unknown>,
    });
    return new Response(JSON.stringify(result.response), {
      status: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleBridgeRouteError(error, 'bridge vision failed');
  }
};
