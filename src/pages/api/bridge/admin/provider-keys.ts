import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { providerKeys } from '@/db';
import { createRequestId, jsonResponse } from '@/lib/api-response';
import { storeProviderKey } from '@/bridge/provider-keys';
import { getAdminDb, requireAdminSession } from './_shared';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const tenantId = url.searchParams.get('tenantId');
  const provider = url.searchParams.get('provider');
  const rows = await getAdminDb()
    .select()
    .from(providerKeys)
    .where(
      and(
        tenantId ? eq(providerKeys.tenantId, tenantId) : undefined,
        provider ? eq(providerKeys.provider, provider) : undefined
      )
    )
    .orderBy(desc(providerKeys.createdAt));

  return jsonResponse({
    keys: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      provider: row.provider,
      name: row.name,
      keyLast4: row.keyLast4,
      isSystem: row.isSystem,
      isActive: row.isActive,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    })),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const provider = String(body?.provider || '').trim();
  const name = String(body?.name || '').trim();
  const rawKey = String(body?.rawKey || '').trim();
  const tenantId = body?.tenantId ? String(body.tenantId).trim() : undefined;
  const isSystem = Boolean(body?.isSystem);
  if (!provider || !name || !rawKey) {
    return jsonResponse({ error: 'provider, name and rawKey are required' }, { status: 400 });
  }
  const id = createRequestId();
  await storeProviderKey({
    id,
    tenantId,
    provider,
    name,
    rawKey,
    isSystem,
  });
  return jsonResponse(
    { id, provider, name, isSystem, keyLast4: rawKey.slice(-4) },
    { status: 201 }
  );
};

export const PUT: APIRoute = async ({ request, locals, url }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const action = url.searchParams.get('action');
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  if (!id) return jsonResponse({ error: 'id is required' }, { status: 400 });

  if (action === 'revoke') {
    await getAdminDb()
      .update(providerKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(providerKeys.id, id));
    return jsonResponse({ ok: true, revoked: id });
  }
  return jsonResponse({ error: 'unsupported action' }, { status: 400 });
};
