import { sql } from 'drizzle-orm';
import { createDb, dailyUsageAggregates } from '@/db';
import type { BridgeRouteType, TokenUsage } from './types';

function db() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('Missing DATABASE_URL');
  return createDb(dbUrl);
}

function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function aggregateId(params: {
  tenantId: string;
  routeType: BridgeRouteType;
  provider: string;
  modelId: string;
  dateKey: string;
}): string {
  const safeModel = params.modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${params.tenantId}_${params.routeType}_${params.dateKey}_${params.provider}_${safeModel}`;
}

export async function recordDailyUsage(params: {
  tenantId: string;
  routeType: BridgeRouteType;
  provider: string;
  modelId: string;
  success: boolean;
  usage: TokenUsage;
}) {
  const dateKey = utcDateKey();
  const id = aggregateId({ ...params, dateKey });
  const tokens = params.usage.totalTokens || 0;

  await db()
    .insert(dailyUsageAggregates)
    .values({
      id,
      dateKey,
      tenantId: params.tenantId,
      routeType: params.routeType,
      provider: params.provider,
      modelId: params.modelId,
      requestCount: 1,
      successCount: params.success ? 1 : 0,
      failureCount: params.success ? 0 : 1,
      totalTokens: tokens,
    })
    .onConflictDoUpdate({
      target: dailyUsageAggregates.id,
      set: {
        requestCount: sql`${dailyUsageAggregates.requestCount} + 1`,
        successCount: sql`${dailyUsageAggregates.successCount} + ${params.success ? 1 : 0}`,
        failureCount: sql`${dailyUsageAggregates.failureCount} + ${params.success ? 0 : 1}`,
        totalTokens: sql`${dailyUsageAggregates.totalTokens} + ${tokens}`,
        updatedAt: new Date(),
      },
    });
}

export async function pruneOldRequestLogs(
  olderThanDays: number
): Promise<{ groups: number; hops: number }> {
  const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DATABASE_URL_ADMIN or DATABASE_URL');
  const adminDb = createDb(dbUrl);
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const hopsResult = await adminDb.execute(
    sql`DELETE FROM request_hops WHERE created_at < ${cutoff}`
  );
  const groupsResult = await adminDb.execute(
    sql`DELETE FROM request_groups WHERE started_at < ${cutoff}`
  );

  return {
    hops: Number((hopsResult as { rowCount?: number }).rowCount || 0),
    groups: Number((groupsResult as { rowCount?: number }).rowCount || 0),
  };
}

export async function pruneOldUsageAggregates(olderThanDays: number): Promise<number> {
  const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DATABASE_URL_ADMIN or DATABASE_URL');
  const adminDb = createDb(dbUrl);
  const cutoffKey = utcDateKey(new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000));

  const result = await adminDb.execute(
    sql`DELETE FROM daily_usage_aggregates WHERE date_key < ${cutoffKey}`
  );
  return Number((result as { rowCount?: number }).rowCount || 0);
}
