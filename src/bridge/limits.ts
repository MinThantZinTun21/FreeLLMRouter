import { and, count, eq, gte } from 'drizzle-orm';
import { createDb, modelRuntimeState, requestGroups } from '@/db';
import { BridgeError } from './errors';
import type { BridgeRouteType, CatalogModel, TenantContext } from './types';

function db() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('Missing DATABASE_URL');
  return createDb(dbUrl);
}

function rpmLimit(tenant: TenantContext, routeType: BridgeRouteType): number {
  if (routeType === 'chat') return tenant.limits.rpmLimitChat;
  if (routeType === 'vision') return tenant.limits.rpmLimitVision;
  return tenant.limits.rpmLimitEmbeddings;
}

function dailyLimit(tenant: TenantContext, routeType: BridgeRouteType): number {
  if (routeType === 'chat') return tenant.limits.dailyLimitChat;
  if (routeType === 'vision') return tenant.limits.dailyLimitVision;
  return tenant.limits.dailyLimitEmbeddings;
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function usageDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function modelUsageStateId(provider: string, modelId: string): string {
  return `usage:${provider}:${modelId}`;
}

export async function assertTenantWithinLimits(
  tenant: TenantContext,
  routeType: BridgeRouteType
): Promise<void> {
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const dayStart = startOfUtcDay();

  const [rpmRow] = await db()
    .select({ total: count() })
    .from(requestGroups)
    .where(
      and(
        eq(requestGroups.tenantId, tenant.tenantId),
        eq(requestGroups.routeType, routeType),
        gte(requestGroups.startedAt, oneMinuteAgo)
      )
    );

  const rpm = Number(rpmRow?.total || 0);
  const rpmCap = rpmLimit(tenant, routeType);
  if (rpm >= rpmCap) {
    throw new BridgeError(`RPM limit exceeded for ${routeType} (${rpmCap}/min)`, 429, 'RPM_LIMIT');
  }

  const [dailyRow] = await db()
    .select({ total: count() })
    .from(requestGroups)
    .where(
      and(
        eq(requestGroups.tenantId, tenant.tenantId),
        eq(requestGroups.routeType, routeType),
        gte(requestGroups.startedAt, dayStart)
      )
    );

  const daily = Number(dailyRow?.total || 0);
  const dailyCap = dailyLimit(tenant, routeType);
  if (daily >= dailyCap) {
    throw new BridgeError(
      `Daily limit exceeded for ${routeType} (${dailyCap}/day)`,
      429,
      'DAILY_LIMIT'
    );
  }
}

async function getUsageState(provider: string, modelId: string) {
  const id = modelUsageStateId(provider, modelId);
  const rows = await db()
    .select()
    .from(modelRuntimeState)
    .where(eq(modelRuntimeState.id, id))
    .limit(1);
  return rows[0] || null;
}

async function ensureUsageState(provider: string, modelId: string) {
  const id = modelUsageStateId(provider, modelId);
  const existing = await getUsageState(provider, modelId);
  if (existing) return existing;

  const now = new Date();
  await db()
    .insert(modelRuntimeState)
    .values({
      id,
      provider,
      modelId,
      status: 'healthy',
      score: 100,
      minuteWindowStart: now,
      usageDayKey: usageDayKey(now),
      updatedAt: now,
    });

  return (await getUsageState(provider, modelId))!;
}

function normalizeUsageWindow(state: {
  requestsThisMinute: number;
  requestsToday: number;
  tokensToday: number;
  minuteWindowStart: Date | null;
  usageDayKey: string | null;
}) {
  const now = new Date();
  const dayKey = usageDayKey(now);
  let requestsThisMinute = state.requestsThisMinute;
  let requestsToday = state.requestsToday;
  let tokensToday = state.tokensToday;
  let minuteWindowStart = state.minuteWindowStart;
  let currentDayKey = state.usageDayKey;

  if (currentDayKey !== dayKey) {
    requestsToday = 0;
    tokensToday = 0;
    currentDayKey = dayKey;
  }

  if (!minuteWindowStart || now.getTime() - minuteWindowStart.getTime() >= 60_000) {
    requestsThisMinute = 0;
    minuteWindowStart = now;
  }

  return {
    requestsThisMinute,
    requestsToday,
    tokensToday,
    minuteWindowStart,
    usageDayKey: currentDayKey,
  };
}

export function evaluateModelLimits(
  model: Pick<CatalogModel, 'rpmLimit' | 'dailyRequestLimit' | 'dailyTokenLimit'>,
  state: {
    requestsThisMinute: number;
    requestsToday: number;
    tokensToday: number;
    minuteWindowStart: Date | null;
    usageDayKey: string | null;
  }
): boolean {
  const usage = normalizeUsageWindow(state);
  if (usage.requestsThisMinute >= model.rpmLimit) return false;
  if (model.dailyRequestLimit !== null && usage.requestsToday >= model.dailyRequestLimit)
    return false;
  if (usage.tokensToday >= model.dailyTokenLimit) return false;
  return true;
}

export async function isModelWithinLimits(model: CatalogModel): Promise<boolean> {
  const state = await getUsageState(model.provider, model.modelId);
  if (!state) return true;
  return evaluateModelLimits(model, state);
}

export async function incrementModelUsage(
  provider: string,
  modelId: string,
  tokens = 0
): Promise<void> {
  const state = await ensureUsageState(provider, modelId);
  const usage = normalizeUsageWindow(state);
  const id = modelUsageStateId(provider, modelId);

  await db()
    .update(modelRuntimeState)
    .set({
      requestsThisMinute: usage.requestsThisMinute + 1,
      requestsToday: usage.requestsToday + 1,
      tokensToday: usage.tokensToday + Math.max(0, tokens),
      minuteWindowStart: usage.minuteWindowStart,
      usageDayKey: usage.usageDayKey,
      updatedAt: new Date(),
    })
    .where(eq(modelRuntimeState.id, id));
}

export async function filterModelsWithinLimits(models: CatalogModel[]): Promise<CatalogModel[]> {
  const eligible: CatalogModel[] = [];
  for (const model of models) {
    if (await isModelWithinLimits(model)) {
      eligible.push(model);
    }
  }
  return eligible;
}

export async function getModelUsageSummary(provider: string, modelId: string) {
  const state = await getUsageState(provider, modelId);
  if (!state) {
    return {
      requestsThisMinute: 0,
      requestsToday: 0,
      tokensToday: 0,
      limitReached: false,
    };
  }
  const usage = normalizeUsageWindow(state);
  return {
    requestsThisMinute: usage.requestsThisMinute,
    requestsToday: usage.requestsToday,
    tokensToday: usage.tokensToday,
    limitReached: false,
  };
}
