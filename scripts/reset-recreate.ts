import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createDb } from '../src/db';
import { syncModels } from '../src/services/openrouter';
import { randomBytes } from 'node:crypto';

dotenv.config({ override: true });

function describeConnection(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const user = url.username ? `${url.username}@` : '';
    return `${url.protocol}//${user}${url.host}${url.pathname}`;
  } catch {
    return 'unknown';
  }
}

function withLibpqCompat(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('uselibpqcompat')) {
      url.searchParams.set('uselibpqcompat', 'true');
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function getPasswordFromUrl(urlValue: string | undefined): string | undefined {
  if (!urlValue) return undefined;
  try {
    const parsed = new URL(urlValue);
    return parsed.password || undefined;
  } catch {
    return undefined;
  }
}

function generatePassword(length = 32): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function buildRoleUrl(baseUrl: string, username: string, password: string): string {
  const url = new URL(baseUrl);
  url.username = username;
  url.password = password;
  return url.toString();
}

function ensureRoleUrls(ownerUrl: string): {
  appUrl: string;
  adminUrl: string;
  statsUrl: string;
  generated: boolean;
} {
  const appUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  const statsUrl = process.env.DATABASE_URL_STATS;

  const appPassword = getPasswordFromUrl(appUrl);
  const adminPassword = getPasswordFromUrl(adminUrl);
  const statsPassword = getPasswordFromUrl(statsUrl);

  const resolvedAppPassword = appPassword ?? generatePassword();
  const resolvedAdminPassword = adminPassword ?? generatePassword();
  const resolvedStatsPassword = statsPassword ?? generatePassword();

  const missingApp = !appUrl || !appPassword;
  const missingAdmin = !adminUrl || !adminPassword;
  const missingStats = !statsUrl || !statsPassword;

  return {
    appUrl: appUrl && appPassword ? appUrl : buildRoleUrl(ownerUrl, 'fma_app', resolvedAppPassword),
    adminUrl:
      adminUrl && adminPassword
        ? adminUrl
        : buildRoleUrl(ownerUrl, 'fma_admin', resolvedAdminPassword),
    statsUrl:
      statsUrl && statsPassword
        ? statsUrl
        : buildRoleUrl(ownerUrl, 'fma_stats', resolvedStatsPassword),
    generated: missingApp || missingAdmin || missingStats,
  };
}

function applyRls(databaseUrl: string): void {
  const ownerUrl = process.env.DATABASE_URL_OWNER;
  if (!ownerUrl) {
    throw new Error('DATABASE_URL_OWNER is required for RLS.');
  }
  const { appUrl, adminUrl, statsUrl } = ensureRoleUrls(ownerUrl);
  const appPassword = getPasswordFromUrl(appUrl) ?? generatePassword();
  const adminPassword = getPasswordFromUrl(adminUrl) ?? generatePassword();
  const statsPassword = getPasswordFromUrl(statsUrl) ?? generatePassword();
  const sql = readFileSync('scripts/db-migration/enable_rls.sql', 'utf8')
    .replaceAll('<app_password>', escapeSqlLiteral(appPassword))
    .replaceAll('<admin_password>', escapeSqlLiteral(adminPassword))
    .replaceAll('<stats_password>', escapeSqlLiteral(statsPassword));

  execSync(`psql -v ON_ERROR_STOP=1 -v ECHO=queries "${databaseUrl}"`, {
    stdio: 'inherit',
    input: sql,
    env: { ...process.env },
  });
}

function runDrizzlePush(databaseUrl: string): void {
  execSync('drizzle-kit push', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: withLibpqCompat(databaseUrl) },
  });
}

async function recreateSchema(databaseUrl: string): Promise<void> {
  const sql = neon(databaseUrl);
  console.log('Dropping public schema...');
  console.log('SQL> DROP SCHEMA IF EXISTS public CASCADE');
  await sql.query('DROP SCHEMA IF EXISTS public CASCADE');
  console.log('Recreating public schema...');
  console.log('SQL> CREATE SCHEMA public');
  await sql.query('CREATE SCHEMA public');
  console.log('Public schema recreated.');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL_OWNER;
  if (!databaseUrl) {
    console.error('DATABASE_URL_OWNER is required for db:reset:recreate.');
    process.exit(1);
  }
  const { appUrl, adminUrl, statsUrl, generated } = ensureRoleUrls(databaseUrl);

  console.log('===== Step 1/6: Drop & Recreate Schema =====');
  console.log(`Using DB: ${describeConnection(databaseUrl)}`);
  await recreateSchema(databaseUrl);

  console.log('');
  console.log('===== Step 2/6: Rebuild Schema (drizzle-kit push) =====');
  runDrizzlePush(databaseUrl);
  console.log('Schema rebuilt.');

  console.log('');
  console.log('===== Step 3/6: Sync Free Models =====');
  const db = createDb(databaseUrl);
  const syncResult = await syncModels(db);
  console.log(
    `Synced models: total=${syncResult.totalApiModels}, free=${syncResult.freeModelsFound}, ` +
      `inserted=${syncResult.inserted}, updated=${syncResult.updated}, inactive=${syncResult.markedInactive}`
  );

  console.log('');
  console.log('===== Step 4/6: Apply RLS =====');
  applyRls(databaseUrl);
  console.log('RLS applied.');

  console.log('');
  console.log('===== Step 5/6: Seed Feedback =====');
  execSync('bun scripts/seed-feedback.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  const seedResult = await neon(databaseUrl).query(
    'SELECT COUNT(*)::int AS count FROM "model_feedback" WHERE source = \'seed-script\''
  );
  const row = seedResult[0];
  const seededCount = Number(row?.count ?? 0);
  console.log(`Seeded feedback rows: ${seededCount}`);
  if (seededCount === 0) {
    console.log('Note: No seed data inserted. Ensure free_models has active rows.');
  }

  console.log('');
  console.log('===== Step 6/6: Done =====');
  if (generated) {
    console.log('');
    console.log(
      'Add the generated DATABASE_URL, DATABASE_URL_ADMIN, and DATABASE_URL_STATS to .env.'
    );
  }
}

main().catch((error) => {
  console.error('Reset failed:', error);
  process.exit(1);
});
