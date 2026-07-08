import { sql as drizzleSql } from 'drizzle-orm';
import { createDb, type Database } from './pool';

type RlsTransaction = Parameters<Database['transaction']>[0] extends (tx: infer T) => any
  ? T
  : never;

/**
 * Execute Drizzle ORM queries within an RLS-protected transaction.
 * Uses sql.begin() to maintain session state across queries.
 *
 * IMPORTANT: Do not nest begin() calls - this will error with neon-http.
 *
 * @example
 * const items = await withUserContext(databaseUrl, userId, async (db) => {
 *   return db.select().from(apiRequestLogs).orderBy(desc(apiRequestLogs.createdAt));
 * });
 */
export async function withUserContext<T>(
  databaseUrl: string,
  userId: string,
  queryFn: (db: RlsTransaction) => Promise<T>
): Promise<T> {
  if (!userId) {
    throw new Error('withUserContext requires a non-empty userId');
  }

  const db = createDb(databaseUrl);
  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`SELECT set_config('app.user_id', ${userId}, true)`);
    return queryFn(tx);
  });
}

/**
 * Execute API key lookup within an RLS-protected transaction.
 * Sets app.api_key_hash to allow SELECT on api_keys by hash.
 *
 * SECURITY: Use ONLY for the single api_keys lookup. Do NOT reuse the db
 * instance for any other queries - discard after the lookup completes.
 * The key hash context should not persist beyond auth bootstrap.
 *
 * @example
 * // CORRECT: Single lookup, discard result
 * const [keyRecord] = await withKeyHashContext(databaseUrl, hash, async (db) => {
 *   return db.select().from(apiKeys).where(eq(apiKeys.key, hash)).limit(1);
 * });
 * // keyRecord.userId is now available for subsequent withUserContext calls
 *
 * // WRONG: Don't do multiple queries in same context
 * // await withKeyHashContext(databaseUrl, hash, async (db) => {
 * //   const key = await db.select().from(apiKeys)...;
 * //   const user = await db.select().from(users)...;  // NO! Use withUserContext instead
 * // });
 */
export async function withKeyHashContext<T>(
  databaseUrl: string,
  keyHash: string,
  queryFn: (db: RlsTransaction) => Promise<T>
): Promise<T> {
  if (!keyHash) {
    throw new Error('withKeyHashContext requires a non-empty keyHash');
  }

  const db = createDb(databaseUrl);
  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`SELECT set_config('app.api_key_hash', ${keyHash}, true)`);
    return queryFn(tx);
  });
}

/**
 * Execute raw SQL queries within an RLS-protected transaction.
 */
export async function withUserContextRaw<T>(
  databaseUrl: string,
  userId: string,
  queryFn: (tx: RlsTransaction) => Promise<T>
): Promise<T> {
  if (!userId) {
    throw new Error('withUserContextRaw requires a non-empty userId');
  }

  const db = createDb(databaseUrl);
  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`SELECT set_config('app.user_id', ${userId}, true)`);
    return queryFn(tx);
  });
}
