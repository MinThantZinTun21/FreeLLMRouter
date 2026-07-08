import { eq } from 'drizzle-orm';
import { bridgeProviders, createDb } from '@/db';
import { DEFAULT_BRIDGE_PROVIDERS } from '../provider-seed';

const staticBaseUrls = new Map<string, string>(
  DEFAULT_BRIDGE_PROVIDERS.filter((p) => p.directBaseUrl).map((p) => [p.name, p.directBaseUrl!])
);

export async function getDirectBaseUrl(provider: string): Promise<string | null> {
  const staticUrl = staticBaseUrls.get(provider);
  if (staticUrl) return staticUrl;

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) return null;
  const db = createDb(dbUrl);
  const rows = await db
    .select({ directBaseUrl: bridgeProviders.directBaseUrl })
    .from(bridgeProviders)
    .where(eq(bridgeProviders.name, provider))
    .limit(1);
  return rows[0]?.directBaseUrl || null;
}

export function getDirectBaseUrlSync(provider: string): string | null {
  return staticBaseUrls.get(provider) || null;
}
