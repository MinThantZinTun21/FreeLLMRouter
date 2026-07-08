import type { APIRoute } from 'astro';
import { resolveTenantContext } from '@/bridge/auth';
import { listCatalogWithStatus } from '@/bridge/catalog';
import { getModelUsageSummary } from '@/bridge/limits';
import { handleBridgeRouteError } from './_shared';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    await resolveTenantContext(request);
    const routeType = url.searchParams.get('routeType') || undefined;
    const provider = url.searchParams.get('provider') || undefined;
    const models = await listCatalogWithStatus({ routeType, provider });

    const enriched = await Promise.all(
      models.map(async (model) => {
        const usage = await getModelUsageSummary(model.provider, model.modelId);
        const status =
          usage.requestsThisMinute >= model.rpmLimit ||
          (model.dailyRequestLimit !== null && usage.requestsToday >= model.dailyRequestLimit) ||
          usage.tokensToday >= model.dailyTokenLimit
            ? 'limit_reached'
            : 'available';

        return {
          ...model,
          usage,
          status,
        };
      })
    );

    return new Response(JSON.stringify({ models: enriched }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleBridgeRouteError(error, 'bridge models list failed');
  }
};
