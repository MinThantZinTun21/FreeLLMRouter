import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

dotenv.config({ override: true });

type ResetMode = 'dev' | 'staging';

const DATA_ONLY_TABLES = ['api_request_logs', 'model_feedback', 'site_feedback'];

const FULL_RESET_TABLES = [
  ...DATA_ONLY_TABLES,
  'sessions',
  'accounts',
  'api_keys',
  'verifications',
  'users',
];

function parseMode(args: string[]): ResetMode {
  const modeArg = args.find((arg) => arg.startsWith('--mode='));
  if (!modeArg) return 'dev';
  const value = modeArg.split('=')[1];
  return value === 'staging' ? 'staging' : 'dev';
}

function parseDataOnly(args: string[]): boolean {
  return args.includes('--data-only');
}

function parseApplyRls(args: string[]): boolean {
  if (args.includes('--no-rls')) return false;
  return args.includes('--apply-rls');
}

function parseVerbose(args: string[]): boolean {
  return !args.includes('--quiet');
}

function parseSeed(args: string[], mode: ResetMode): boolean {
  if (args.includes('--no-seed')) return false;
  return mode === 'dev';
}

function describeConnection(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const user = url.username ? `${url.username}@` : '';
    return `${url.protocol}//${user}${url.host}${url.pathname}`;
  } catch {
    return 'unknown';
  }
}

async function resetTables(
  mode: ResetMode,
  databaseUrl: string,
  dataOnly: boolean,
  verbose: boolean
): Promise<void> {
  const sql = neon(databaseUrl);
  const tables = dataOnly ? DATA_ONLY_TABLES : FULL_RESET_TABLES;
  console.log(`Using DB: ${describeConnection(databaseUrl)}`);
  console.log(`Truncating tables (data only, no schema changes): ${tables.join(', ')}`);
  const countsBefore: Record<string, number> = {};
  for (const table of tables) {
    const result = await sql.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    const row = result[0];
    countsBefore[table] = Number(row?.count ?? 0);
  }
  const statement = `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`;
  await sql.query(statement);
  const countsAfter: Record<string, number> = {};
  for (const table of tables) {
    const result = await sql.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    const row = result[0];
    countsAfter[table] = Number(row?.count ?? 0);
  }
  if (verbose) {
    const changed = tables.filter((table) => countsBefore[table] !== 0 || countsAfter[table] !== 0);
    if (changed.length === 0) {
      console.log('Row counts: no rows removed (all tables already empty).');
    } else {
      console.log('Row counts (before -> after):');
      for (const table of changed) {
        console.log(`- ${table}: ${countsBefore[table]} -> ${countsAfter[table]}`);
      }
    }
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

async function main() {
  const args = process.argv.slice(2);
  const mode = parseMode(args);
  const dataOnly = parseDataOnly(args);
  const verbose = parseVerbose(args);
  const seed = parseSeed(args, mode);
  const applyRlsFlag = parseApplyRls(args);
  if (mode === 'staging') {
    const confirm = process.env.RESET_CONFIRM;
    if (confirm !== 'staging') {
      console.error('Set RESET_CONFIRM=staging to confirm data reset.');
      process.exit(1);
    }
  }

  const databaseUrl = process.env.DATABASE_URL_OWNER;
  if (!databaseUrl) {
    console.error('DATABASE_URL_OWNER is required for reset.');
    process.exit(1);
  }
  const { appUrl, adminUrl, statsUrl, generated } = ensureRoleUrls(databaseUrl);

  const resetType = dataOnly ? 'data-only' : 'full';
  console.log(`===== Step 1/4: Reset (${mode}, ${resetType}) =====`);
  await resetTables(mode, databaseUrl, dataOnly, verbose);
  if (applyRlsFlag) {
    console.log('');
    console.log('===== Step 2/4: Apply RLS =====');
    applyRls(databaseUrl);
    console.log('RLS applied.');
  } else {
    console.log('');
    console.log('===== Step 2/4: Apply RLS =====');
    console.log('Skipped (--no-rls)');
  }
  if (seed) {
    console.log('');
    console.log('===== Step 3/4: Seed Feedback =====');
    execSync('bun scripts/seed-feedback.ts', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    const result = await neon(databaseUrl).query(
      'SELECT COUNT(*)::int AS count FROM "model_feedback" WHERE source = \'seed-script\''
    );
    const row = result[0];
    const seededCount = Number(row?.count ?? 0);
    console.log(`Seeded feedback rows: ${seededCount}`);
  } else {
    console.log('');
    console.log('===== Step 3/4: Seed Feedback =====');
    console.log('Skipped (--no-seed)');
  }
  console.log('');
  console.log('===== Step 4/4: Done =====');
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
