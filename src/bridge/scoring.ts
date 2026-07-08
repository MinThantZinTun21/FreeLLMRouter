import { and, eq, inArray } from 'drizzle-orm';
import { createDb, modelRuntimeState } from '@/db';
import { isModelWithinLimits, modelUsageStateId } from './limits';
import type { CatalogModel } from './types';

function db() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('Missing DATABASE_URL');
  return createDb(dbUrl);
}

function stateKey(provider: string, modelId: string): string {
  return `${provider}:${modelId}`;
}

export async function rankCandidatesByHealth(models: CatalogModel[]): Promise<CatalogModel[]> {
  if (models.length <= 1) return models;

  const modelIds = models.map((m) => m.modelId);
  const rows = await db()
    .select()
    .from(modelRuntimeState)
    .where(inArray(modelRuntimeState.modelId, modelIds));

  const now = Date.now();
  const byModel = new Map<
    string,
    { score: number; inCooldown: boolean; inQuotaReset: boolean; tokensToday: number }
  >();

  for (const row of rows) {
    if (row.id.startsWith('usage:')) {
      const key = stateKey(row.provider, row.modelId);
      const existing = byModel.get(key);
      byModel.set(key, {
        score: existing?.score ?? 100,
        inCooldown: existing?.inCooldown ?? false,
        inQuotaReset: existing?.inQuotaReset ?? false,
        tokensToday: row.tokensToday ?? 0,
      });
      continue;
    }

    const key = stateKey(row.provider, row.modelId);
    const inCooldown = Boolean(row.cooldownUntil && row.cooldownUntil.getTime() > now);
    const inQuotaReset = Boolean(row.quotaResetAt && row.quotaResetAt.getTime() > now);
    const existing = byModel.get(key);
    const score = row.score ?? 100;
    if (!existing || score < existing.score) {
      byModel.set(key, {
        score,
        inCooldown: existing?.inCooldown || inCooldown,
        inQuotaReset: existing?.inQuotaReset || inQuotaReset,
        tokensToday: existing?.tokensToday ?? 0,
      });
    } else {
      existing.inCooldown = existing.inCooldown || inCooldown;
      existing.inQuotaReset = existing.inQuotaReset || inQuotaReset;
    }
  }

  const limitChecks = await Promise.all(models.map((model) => isModelWithinLimits(model)));
  const limitByKey = new Map(
    models.map((model, index) => [stateKey(model.provider, model.modelId), !limitChecks[index]])
  );

  return [...models].sort((a, b) => {
    const aKey = stateKey(a.provider, a.modelId);
    const bKey = stateKey(b.provider, b.modelId);
    const aLimitExceeded = limitByKey.get(aKey) ?? false;
    const bLimitExceeded = limitByKey.get(bKey) ?? false;
    if (aLimitExceeded !== bLimitExceeded) return aLimitExceeded ? 1 : -1;

    const aState = byModel.get(aKey);
    const bState = byModel.get(bKey);
    const aCooldown = aState?.inCooldown ?? false;
    const bCooldown = bState?.inCooldown ?? false;
    if (aCooldown !== bCooldown) return aCooldown ? 1 : -1;

    const aQuota = aState?.inQuotaReset ?? false;
    const bQuota = bState?.inQuotaReset ?? false;
    if (aQuota !== bQuota) return aQuota ? 1 : -1;

    const aTokens = aState?.tokensToday ?? 0;
    const bTokens = bState?.tokensToday ?? 0;
    if (aTokens !== bTokens) return aTokens - bTokens;

    const aScore = aState?.score ?? 100;
    const bScore = bState?.score ?? 100;
    return bScore - aScore;
  });
}

export async function applyQuotaResetHint(
  provider: string,
  modelId: string,
  providerKeyId: string,
  retryAfterSeconds?: number
) {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) return;
  const id = `${provider}:${modelId}:${providerKeyId}`;
  const resetAt = new Date(Date.now() + retryAfterSeconds * 1000);
  await db()
    .update(modelRuntimeState)
    .set({ quotaResetAt: resetAt, updatedAt: new Date() })
    .where(and(eq(modelRuntimeState.id, id)));
}
