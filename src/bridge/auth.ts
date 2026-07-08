import { and, eq } from 'drizzle-orm';
import { bridgeApiKeys, bridgeTenants, createDb } from '@/db';
import { hashApiKey } from './crypto';
import { BridgeError } from './errors';
import type { TenantContext, TenantLimits } from './types';

export async function resolveTenantContext(request: Request): Promise<TenantContext> {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new BridgeError('Missing Bearer API key', 401, 'UNAUTHORIZED');
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    throw new BridgeError('Empty API key', 401, 'UNAUTHORIZED');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL');
  }
  const db = createDb(dbUrl);
  const keyHash = hashApiKey(rawKey);

  const rows = await db
    .select({
      keyId: bridgeApiKeys.id,
      tenantId: bridgeApiKeys.tenantId,
      tenantActive: bridgeTenants.isActive,
      keyActive: bridgeApiKeys.isActive,
      rpmLimitChat: bridgeTenants.rpmLimitChat,
      rpmLimitVision: bridgeTenants.rpmLimitVision,
      rpmLimitEmbeddings: bridgeTenants.rpmLimitEmbeddings,
      dailyLimitChat: bridgeTenants.dailyLimitChat,
      dailyLimitVision: bridgeTenants.dailyLimitVision,
      dailyLimitEmbeddings: bridgeTenants.dailyLimitEmbeddings,
    })
    .from(bridgeApiKeys)
    .innerJoin(bridgeTenants, eq(bridgeTenants.id, bridgeApiKeys.tenantId))
    .where(and(eq(bridgeApiKeys.keyHash, keyHash), eq(bridgeApiKeys.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row || !row.tenantActive || !row.keyActive) {
    throw new BridgeError('Invalid API key', 401, 'UNAUTHORIZED');
  }

  const limits: TenantLimits = {
    rpmLimitChat: row.rpmLimitChat,
    rpmLimitVision: row.rpmLimitVision,
    rpmLimitEmbeddings: row.rpmLimitEmbeddings,
    dailyLimitChat: row.dailyLimitChat,
    dailyLimitVision: row.dailyLimitVision,
    dailyLimitEmbeddings: row.dailyLimitEmbeddings,
  };

  const debug = request.headers.get('x-bridge-debug') === '1';
  return {
    tenantId: row.tenantId,
    apiKeyId: row.keyId,
    debug,
    limits,
  };
}
