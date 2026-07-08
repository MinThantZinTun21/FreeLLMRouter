import '@/db/node-compat';
import { betterAuth } from 'better-auth';
import type { Auth as BetterAuthInstance } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { apiKey } from 'better-auth/plugins';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

// Auth options type that includes the apiKey plugin for proper type inference
type AuthOptions = {
  plugins: [ReturnType<typeof apiKey>];
};

// Environment config passed from runtime
export interface AuthEnv {
  databaseUrl: string;
  databaseUrlAdmin?: string; // For Better Auth operations (bypasses RLS)
  baseUrl: string;
  secret: string;
}

// Cache auth instance to avoid recreation on every request
// Typed with AuthOptions to preserve apiKey plugin endpoints (verifyApiKey, createApiKey, etc.)
const authCache = new Map<string, BetterAuthInstance<AuthOptions>>();

export function createAuth(env: AuthEnv): BetterAuthInstance<AuthOptions> {
  // Use admin connection for Better Auth (needs to INSERT users, sessions, accounts)
  const adminUrl = env.databaseUrlAdmin || env.databaseUrl;

  // Include all config values in cache key to handle preview/prod differences
  const cacheKey = `${adminUrl}:${env.baseUrl}`;

  if (authCache.has(cacheKey)) {
    return authCache.get(cacheKey)!;
  }

  const sql = neon(adminUrl);
  const db = drizzle(sql, { schema });

  const auth = betterAuth({
    baseURL: env.baseUrl,
    secret: env.secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: {
        ...schema,
        apikeys: schema.apiKeys, // Map lowercase to camelCase export
      },
    }),
    plugins: [
      apiKey({
        defaultPrefix: 'fma_',
        rateLimit: {
          enabled: false, // DISABLED - using custom user-level rate limiting
        },
      }),
    ],
  });

  authCache.set(cacheKey, auth);
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
