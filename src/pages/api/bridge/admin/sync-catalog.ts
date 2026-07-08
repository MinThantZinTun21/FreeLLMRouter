import type { APIRoute } from 'astro';
import { jsonResponse } from '@/lib/api-response';
import { refreshBridgeCatalog } from '@/bridge/catalog';
import { seedBridgeProviders } from '@/bridge/provider-seed';
import { requireAdminSession } from './_shared';

export const POST: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  try {
    await seedBridgeProviders();
    const result = await refreshBridgeCatalog();
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'catalog sync failed' },
      { status: 500 }
    );
  }
};
