import { createDb } from '@/db';
import { getAuthSession, isSessionError } from '@/lib/auth-session';

export async function requireAdminSession(
  request: Request,
  locals: unknown
): Promise<Response | null> {
  const session = await getAuthSession(request, locals);
  if (isSessionError(session)) {
    return new Response(JSON.stringify({ error: session.error }), {
      status: session.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export function getAdminDb() {
  const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DATABASE_URL_ADMIN or DATABASE_URL');
  return createDb(dbUrl);
}
