import type { APIRoute } from 'astro';
import { resolveTenantContext } from '@/bridge/auth';
import { listBridgeProviders } from '@/bridge/catalog';
import { listConfiguredProviders } from '@/bridge/provider-keys';
import { handleBridgeRouteError } from './_shared';

export const GET: APIRoute = async ({ request }) => {
  try {
    const tenant = await resolveTenantContext(request);
    const providers = await listBridgeProviders();
    const configured = await listConfiguredProviders(tenant.tenantId);

    return new Response(
      JSON.stringify({
        providers: providers.map((provider) => ({
          ...provider,
          keyConfigured: configured.has(provider.name),
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return handleBridgeRouteError(error, 'bridge providers list failed');
  }
};
