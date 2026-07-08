import { createDb, type Database } from '@/db';

type EnvRecord = Record<string, string | undefined> | undefined;
type DbRole = 'app' | 'admin' | 'stats' | 'owner';
type LocalsLike = { runtime?: { env?: EnvRecord } };

const importMetaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;

function parseSlot(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function dbKeyForRole(role: DbRole, slot: number): string {
  const suffix = slot === 1 ? '' : `_${slot}`;
  if (role === 'admin') return `DATABASE_URL_ADMIN${suffix}`;
  if (role === 'stats') return `DATABASE_URL_STATS${suffix}`;
  if (role === 'owner') return `DATABASE_URL_OWNER${suffix}`;
  return `DATABASE_URL${suffix}`;
}

function resolveLocals(input: unknown): LocalsLike | undefined {
  if (!input || typeof input !== 'object') return undefined;
  if ('locals' in input && typeof (input as { locals?: unknown }).locals === 'object') {
    return (input as { locals?: LocalsLike }).locals;
  }
  return input as LocalsLike;
}

function isDbOrSlotKey(key: string): boolean {
  return key === 'ACTIVE_DB_SLOT' || key.startsWith('DATABASE_URL');
}

function hasRuntimeEnv(locals: LocalsLike | undefined): boolean {
  return Boolean(locals?.runtime?.env);
}

function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env[key];
}

function readEnv(locals: LocalsLike | undefined, key: string): string | undefined {
  const runtimeValue = locals?.runtime?.env?.[key];
  const processValue = readProcessEnv(key);

  // DB and slot config must come from a single env source.
  // In Cloudflare/runtime contexts, do not silently fall back to build-time import.meta.env,
  // or we can mix ACTIVE_DB_SLOT from runtime with DATABASE_URL values baked at build time.
  if (isDbOrSlotKey(key) && hasRuntimeEnv(locals)) {
    return runtimeValue ?? processValue;
  }

  return runtimeValue || importMetaEnv?.[key] || processValue;
}

export interface RuntimeAccess {
  env: (key: string) => string | undefined;
  requireEnv: (key: string) => string;
  dbUrl: (role?: DbRole) => string | undefined;
  db: (role?: DbRole) => Database | undefined;
}

export function access(contextOrLocals: unknown): RuntimeAccess {
  const locals = resolveLocals(contextOrLocals);

  const env = (key: string): string | undefined => readEnv(locals, key);

  const requireEnv = (key: string): string => {
    const value = env(key);
    if (!value) throw new Error(`Missing env: ${key}`);
    return value;
  };

  const dbUrl = (role: DbRole = 'app'): string | undefined => {
    const activeSlot = parseSlot(env('ACTIVE_DB_SLOT'));
    const roleKey = dbKeyForRole(role, activeSlot);
    const roleUrl = env(roleKey);
    if (role === 'admin') {
      return roleUrl || env(dbKeyForRole('app', activeSlot));
    }
    return roleUrl;
  };

  const db = (role: DbRole = 'app'): Database | undefined => {
    const url = dbUrl(role);
    if (!url) return undefined;
    return createDb(url);
  };

  return { env, requireEnv, dbUrl, db };
}
