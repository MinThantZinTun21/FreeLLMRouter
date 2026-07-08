import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { bridgeApiKeys } from '@/db';
import { createRequestId, jsonResponse } from '@/lib/api-response';
import { createBridgeApiKey, hashApiKey } from '@/bridge/crypto';
import { getAdminDb, requireAdminSession } from './_shared';

export const GET: APIRoute = async ({ request, locals, url }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) return jsonResponse({ error: 'tenantId is required' }, { status: 400 });
  const rows = await getAdminDb()
    .select()
    .from(bridgeApiKeys)
    .where(eq(bridgeApiKeys.tenantId, tenantId))
    .orderBy(desc(bridgeApiKeys.createdAt));
  return jsonResponse({
    keys: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      prefix: row.prefix,
      isActive: row.isActive,
      createdAt: row.createdAt,
    })),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const tenantId = String(body?.tenantId || '').trim();
  const name = String(body?.name || '').trim();
  if (!tenantId || !name) {
    return jsonResponse({ error: 'tenantId and name are required' }, { status: 400 });
  }

  const apiKey = createBridgeApiKey();
  const id = createRequestId();
  await getAdminDb()
    .insert(bridgeApiKeys)
    .values({
      id,
      tenantId,
      name,
      prefix: apiKey.prefix,
      keyHash: hashApiKey(apiKey.value),
      isActive: true,
    });

  return jsonResponse(
    {
      id,
      tenantId,
      name,
      prefix: apiKey.prefix,
      key: apiKey.value,
    },
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
      .update(bridgeApiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(bridgeApiKeys.id, id));
    return jsonResponse({ ok: true, revoked: id });
  }

  if (action === 'rotate') {
    const current = await getAdminDb()
      .select()
      .from(bridgeApiKeys)
      .where(and(eq(bridgeApiKeys.id, id), eq(bridgeApiKeys.isActive, true)))
      .limit(1);
    const row = current[0];
    if (!row) return jsonResponse({ error: 'key not found' }, { status: 404 });

    await getAdminDb()
      .update(bridgeApiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(bridgeApiKeys.id, id));

    const created = createBridgeApiKey();
    const newId = createRequestId();
    await getAdminDb()
      .insert(bridgeApiKeys)
      .values({
        id: newId,
        tenantId: row.tenantId,
        name: row.name,
        prefix: created.prefix,
        keyHash: hashApiKey(created.value),
        isActive: true,
      });

    return jsonResponse({
      ok: true,
      oldId: id,
      id: newId,
      key: created.value,
      prefix: created.prefix,
    });
  }

  return jsonResponse({ error: 'unsupported action' }, { status: 400 });
};
