import './node-compat';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// Ensure WebSocket is available for the Neon serverless driver (local Node needs ws).
if (typeof WebSocket === 'undefined') {
  const ws = await import('ws');
  neonConfig.webSocketConstructor = ws.WebSocket;
}

export function createDb(databaseUrl: string): NeonDatabase<typeof schema> {
  // Cloudflare runtimes require request-scoped I/O objects.
  // Avoid sharing pools across requests to prevent cross-request socket reuse.
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

export type Database = NeonDatabase<typeof schema>;
