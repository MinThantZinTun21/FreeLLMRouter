import type { APIRoute } from 'astro';
import { modelRuntimeState } from '@/db';
import { desc } from 'drizzle-orm';
import { jsonResponse } from '@/lib/api-response';
import { getAdminDb, requireAdminSession } from './_shared';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;

  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const rows = await getAdminDb()
    .select()
    .from(modelRuntimeState)
    .orderBy(desc(modelRuntimeState.updatedAt))
    .limit(limit);

  const now = Date.now();
  return jsonResponse({
    states: rows.map((row) => ({
      ...row,
      inCooldown: Boolean(row.cooldownUntil && row.cooldownUntil.getTime() > now),
      inQuotaReset: Boolean(row.quotaResetAt && row.quotaResetAt.getTime() > now),
    })),
  });
};
