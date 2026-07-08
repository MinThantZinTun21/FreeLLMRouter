import type { APIRoute } from 'astro';
import { bridgeTenants } from '@/db';
import { desc, eq } from 'drizzle-orm';
import { createRequestId, jsonResponse } from '@/lib/api-response';
import { getAdminDb, requireAdminSession } from './_shared';

export const GET: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const rows = await getAdminDb()
    .select()
    .from(bridgeTenants)
    .orderBy(desc(bridgeTenants.createdAt));
  return jsonResponse({ tenants: rows });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const slug = String(body?.slug || '').trim();
  if (!name || !slug) {
    return jsonResponse({ error: 'name and slug are required' }, { status: 400 });
  }

  const id = createRequestId();
  await getAdminDb().insert(bridgeTenants).values({
    id,
    name,
    slug,
  });
  return jsonResponse({ id, name, slug }, { status: 201 });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const guard = await requireAdminSession(request, locals);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  if (!id) return jsonResponse({ error: 'id is required' }, { status: 400 });

  const limits = {
    rpmLimitChat: body?.rpmLimitChat,
    rpmLimitVision: body?.rpmLimitVision,
    rpmLimitEmbeddings: body?.rpmLimitEmbeddings,
    dailyLimitChat: body?.dailyLimitChat,
    dailyLimitVision: body?.dailyLimitVision,
    dailyLimitEmbeddings: body?.dailyLimitEmbeddings,
    isActive: body?.isActive,
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(limits)) {
    if (value === undefined) continue;
    if (key === 'isActive') {
      patch.isActive = Boolean(value);
      continue;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return jsonResponse({ error: `${key} must be a non-negative number` }, { status: 400 });
    }
    patch[key] = Math.floor(num);
  }

  await getAdminDb().update(bridgeTenants).set(patch).where(eq(bridgeTenants.id, id));
  const [row] = await getAdminDb()
    .select()
    .from(bridgeTenants)
    .where(eq(bridgeTenants.id, id))
    .limit(1);
  return jsonResponse({ tenant: row });
};
