import type { APIRoute } from 'astro';
import { pruneOldRequestLogs, pruneOldUsageAggregates } from '@/bridge/usage';
import { jsonResponse } from '@/lib/api-response';
import { requireAdminSession } from './_shared';

export const POST: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const requestLogDays = Math.max(Number(body?.requestLogDays || 30), 7);
  const aggregateDays = Math.max(Number(body?.aggregateDays || 180), 30);

  const logs = await pruneOldRequestLogs(requestLogDays);
  const aggregates = await pruneOldUsageAggregates(aggregateDays);

  return jsonResponse({
    ok: true,
    pruned: {
      requestGroups: logs.groups,
      requestHops: logs.hops,
      usageAggregates: aggregates,
    },
    retention: {
      requestLogDays,
      aggregateDays,
    },
  });
};
