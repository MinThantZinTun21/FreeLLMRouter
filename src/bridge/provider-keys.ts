import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { createDb, providerKeys } from '@/db';
import { decryptProviderSecret, encryptProviderSecret } from './crypto';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('Missing DATABASE_URL');
  return createDb(dbUrl);
}

export interface ResolvedProviderKey {
  id: string;
  provider: string;
  apiKey: string;
}

export async function resolveProviderKey(
  provider: string,
  tenantId: string
): Promise<ResolvedProviderKey | null> {
  const tenantRows = await getDb()
    .select()
    .from(providerKeys)
    .where(
      and(
        eq(providerKeys.provider, provider),
        eq(providerKeys.isActive, true),
        eq(providerKeys.tenantId, tenantId)
      )
    )
    .orderBy(desc(providerKeys.lastUsedAt))
    .limit(1);

  const tenantRow = tenantRows[0];
  const row =
    tenantRow ||
    (
      await getDb()
        .select()
        .from(providerKeys)
        .where(
          and(
            eq(providerKeys.provider, provider),
            eq(providerKeys.isActive, true),
            eq(providerKeys.isSystem, true),
            isNull(providerKeys.tenantId)
          )
        )
        .orderBy(asc(providerKeys.lastUsedAt))
        .limit(1)
    )[0];

  if (!row) return null;

  const apiKey = decryptProviderSecret({
    encrypted: row.encryptedKey,
    iv: row.keyIv,
    tag: row.keyTag,
  });

  await getDb()
    .update(providerKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(providerKeys.id, row.id));

  return { id: row.id, provider: row.provider, apiKey };
}

export async function storeProviderKey(params: {
  id: string;
  tenantId?: string;
  provider: string;
  name: string;
  rawKey: string;
  isSystem?: boolean;
}) {
  const enc = encryptProviderSecret(params.rawKey);
  await getDb()
    .insert(providerKeys)
    .values({
      id: params.id,
      tenantId: params.tenantId,
      provider: params.provider,
      name: params.name,
      encryptedKey: enc.encrypted,
      keyIv: enc.iv,
      keyTag: enc.tag,
      keyLast4: params.rawKey.slice(-4),
      isSystem: Boolean(params.isSystem),
      isActive: true,
    });
}

export async function listConfiguredProviders(tenantId?: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({
      provider: providerKeys.provider,
      tenantId: providerKeys.tenantId,
      isSystem: providerKeys.isSystem,
    })
    .from(providerKeys)
    .where(eq(providerKeys.isActive, true));

  const configured = new Set<string>();
  for (const row of rows) {
    if (tenantId && row.tenantId === tenantId) {
      configured.add(row.provider);
      continue;
    }
    if (row.isSystem) {
      configured.add(row.provider);
    }
  }
  return configured;
}
