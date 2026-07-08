import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { modelCatalogFree, modelRuntimeState } from '@/db';
import { listCatalogWithStatus, updateCatalogLimits } from '@/bridge/catalog';
import { getModelUsageSummary, modelUsageStateId } from '@/bridge/limits';
import { jsonResponse } from '@/lib/api-response';
import { getAdminDb, requireAdminSession } from './_shared';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;

  const routeType = url.searchParams.get('routeType') || undefined;
  const provider = url.searchParams.get('provider') || undefined;
  const models = await listCatalogWithStatus({ routeType, provider });

  const enriched = await Promise.all(
    models.map(async (model) => {
      const usage = await getModelUsageSummary(model.provider, model.modelId);
      const runtimeRows = await getAdminDb()
        .select()
        .from(modelRuntimeState)
        .where(eq(modelRuntimeState.modelId, model.modelId));

      const health = runtimeRows.find((row) => !row.id.startsWith('usage:'));
      const usageRow = runtimeRows.find(
        (row) => row.id === modelUsageStateId(model.provider, model.modelId)
      );

      const status =
        usage.requestsThisMinute >= model.rpmLimit ||
        (model.dailyRequestLimit !== null && usage.requestsToday >= model.dailyRequestLimit) ||
        usage.tokensToday >= model.dailyTokenLimit
          ? 'limit_reached'
          : health?.status || 'healthy';

      return {
        ...model,
        usage: {
          requestsThisMinute: usageRow?.requestsThisMinute ?? usage.requestsThisMinute,
          requestsToday: usageRow?.requestsToday ?? usage.requestsToday,
          tokensToday: usageRow?.tokensToday ?? usage.tokensToday,
        },
        runtime: health
          ? {
              score: health.score,
              status: health.status,
              inCooldown: Boolean(
                health.cooldownUntil && health.cooldownUntil.getTime() > Date.now()
              ),
              inQuotaReset: Boolean(
                health.quotaResetAt && health.quotaResetAt.getTime() > Date.now()
              ),
            }
          : null,
        status,
      };
    })
  );

  return jsonResponse({ models: enriched });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  if (!id) return jsonResponse({ error: 'id is required' }, { status: 400 });

  await updateCatalogLimits(id, {
    rpmLimit: body?.rpmLimit !== undefined ? Number(body.rpmLimit) : undefined,
    dailyRequestLimit:
      body?.dailyRequestLimit !== undefined
        ? body.dailyRequestLimit === null
          ? null
          : Number(body.dailyRequestLimit)
        : undefined,
    dailyTokenLimit: body?.dailyTokenLimit !== undefined ? Number(body.dailyTokenLimit) : undefined,
  });

  const rows = await getAdminDb()
    .select()
    .from(modelCatalogFree)
    .where(eq(modelCatalogFree.id, id))
    .limit(1);
  return jsonResponse({ ok: true, model: rows[0] || null });
};
