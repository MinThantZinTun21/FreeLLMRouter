import { and, eq } from 'drizzle-orm';
import { createDb, modelRuntimeState, requestGroups, requestHops } from '@/db';
import type { BridgeRouteType, TokenUsage } from './types';
import { recordDailyUsage } from './usage';

export const FAILURE_THRESHOLD = 3;
export const COOLDOWN_MINUTES = 30;

function db() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('Missing DATABASE_URL');
  return createDb(dbUrl);
}

function runtimeStateId(provider: string, modelId: string, providerKeyId: string): string {
  return `${provider}:${modelId}:${providerKeyId}`;
}

export async function startRequestGroup(params: {
  id: string;
  tenantId: string;
  routeType: string;
  debugTrace: boolean;
}) {
  await db().insert(requestGroups).values({
    id: params.id,
    tenantId: params.tenantId,
    routeType: params.routeType,
    debugTrace: params.debugTrace,
    status: 'started',
  });
}

export async function finishRequestGroup(id: string, status: 'success' | 'failed') {
  await db()
    .update(requestGroups)
    .set({
      status,
      finishedAt: new Date(),
    })
    .where(eq(requestGroups.id, id));
}

export async function isInCooldown(
  provider: string,
  modelId: string,
  providerKeyId: string
): Promise<boolean> {
  const id = runtimeStateId(provider, modelId, providerKeyId);
  const rows = await db()
    .select()
    .from(modelRuntimeState)
    .where(eq(modelRuntimeState.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (row.cooldownUntil && row.cooldownUntil.getTime() > Date.now()) return true;
  if (row.quotaResetAt && row.quotaResetAt.getTime() > Date.now()) return true;
  return false;
}

export async function recordHop(params: {
  id: string;
  requestGroupId: string;
  tenantId: string;
  hopIndex: number;
  provider: string;
  modelId: string;
  providerKeyId?: string;
  statusCode?: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  usage: TokenUsage;
  routeType: BridgeRouteType;
  metadata?: Record<string, unknown>;
}) {
  await db().insert(requestHops).values({
    id: params.id,
    requestGroupId: params.requestGroupId,
    tenantId: params.tenantId,
    hopIndex: params.hopIndex,
    provider: params.provider,
    modelId: params.modelId,
    providerKeyId: params.providerKeyId,
    statusCode: params.statusCode,
    success: params.success,
    errorCode: params.errorCode,
    errorMessage: params.errorMessage,
    latencyMs: params.latencyMs,
    requestTokens: params.usage.requestTokens,
    responseTokens: params.usage.responseTokens,
    totalTokens: params.usage.totalTokens,
    tokenSource: params.usage.source,
    metadata: params.metadata,
  });

  await recordDailyUsage({
    tenantId: params.tenantId,
    routeType: params.routeType,
    provider: params.provider,
    modelId: params.modelId,
    success: params.success,
    usage: params.usage,
  });

  if (!params.providerKeyId) return;
  const stateId = runtimeStateId(params.provider, params.modelId, params.providerKeyId);
  const now = new Date();

  const rows = await db()
    .select()
    .from(modelRuntimeState)
    .where(eq(modelRuntimeState.id, stateId))
    .limit(1);
  const existing = rows[0];

  const nextFailures = params.success ? 0 : (existing?.consecutiveFailures || 0) + 1;
  const cooldownUntil =
    nextFailures >= FAILURE_THRESHOLD
      ? new Date(now.getTime() + COOLDOWN_MINUTES * 60 * 1000)
      : existing?.cooldownUntil || null;
  const nextScore = params.success
    ? Math.min(100, (existing?.score ?? 100) + 2)
    : Math.max(0, (existing?.score ?? 100) - 15);

  if (!existing) {
    await db()
      .insert(modelRuntimeState)
      .values({
        id: stateId,
        provider: params.provider,
        modelId: params.modelId,
        providerKeyId: params.providerKeyId,
        consecutiveFailures: nextFailures,
        cooldownUntil,
        status: params.success ? 'healthy' : 'degraded',
        lastErrorCode: params.errorCode,
        score: nextScore,
        updatedAt: now,
      });
    return;
  }

  await db()
    .update(modelRuntimeState)
    .set({
      consecutiveFailures: nextFailures,
      cooldownUntil,
      status: params.success ? 'healthy' : 'degraded',
      lastErrorCode: params.errorCode,
      score: nextScore,
      updatedAt: now,
    })
    .where(and(eq(modelRuntimeState.id, stateId)));
}
