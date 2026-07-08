import type { APIRoute } from 'astro';
import { dailyUsageAggregates } from '@/db';
import { and, desc, eq, gte } from 'drizzle-orm';
import { jsonResponse } from '@/lib/api-response';
import { getAdminDb, requireAdminSession } from './_shared';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;

  const tenantId = url.searchParams.get('tenantId') || undefined;
  const days = Math.min(Number(url.searchParams.get('days') || 7), 90);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const filters = [gte(dailyUsageAggregates.dateKey, cutoff)];
  if (tenantId) filters.push(eq(dailyUsageAggregates.tenantId, tenantId));

  const rows = await getAdminDb()
    .select()
    .from(dailyUsageAggregates)
    .where(and(...filters))
    .orderBy(desc(dailyUsageAggregates.dateKey))
    .limit(500);

  const totals = rows.reduce(
    (acc, row) => {
      acc.requests += row.requestCount;
      acc.successes += row.successCount;
      acc.failures += row.failureCount;
      acc.tokens += row.totalTokens;
      return acc;
    },
    { requests: 0, successes: 0, failures: 0, tokens: 0 }
  );

  return jsonResponse({ usage: rows, totals, days });
};
