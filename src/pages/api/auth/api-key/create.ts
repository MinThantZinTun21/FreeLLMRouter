import type { APIRoute } from 'astro';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, count } from 'drizzle-orm';
import { apiKeys } from '@/db/schema';
import { getAuthSessionWithAuth, isSessionWithAuthError } from '@/lib/auth-session';
import { jsonResponse } from '@/lib/api-response';

const MAX_KEYS_PER_USER = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cookie',
  'Access-Control-Allow-Credentials': 'true',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const result = await getAuthSessionWithAuth(request, locals);
  if (isSessionWithAuthError(result)) {
    return jsonResponse({ error: result.error }, { status: result.status, headers: corsHeaders });
  }

  const { session, databaseUrl, auth } = result;

  // Count existing keys for this user
  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  const [countResult] = await db
    .select({ count: count() })
    .from(apiKeys)
    .where(eq(apiKeys.userId, session.user.id));

  if (countResult.count >= MAX_KEYS_PER_USER) {
    return jsonResponse(
      {
        error: `Maximum ${MAX_KEYS_PER_USER} API keys allowed. Delete an existing key to create a new one.`,
      },
      { status: 403, headers: corsHeaders }
    );
  }

  // Create the key via Better Auth
  const body = await request.json();
  const response = await auth.api.createApiKey({
    body: { name: body.name, expiresIn: body.expiresIn },
    headers: request.headers,
  });

  return jsonResponse(response, { headers: corsHeaders });
};
