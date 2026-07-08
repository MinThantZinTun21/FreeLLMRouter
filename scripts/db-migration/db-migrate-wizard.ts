import dotenv from 'dotenv';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  KEY_TABLES,
  type TableCountMismatch,
  type TableCountValue,
  findCountMismatches,
  getKeyTableCounts,
  printKeyTableComparison,
} from './key-table-check';

dotenv.config({ quiet: true });

type YesNoDefault = 'yes' | 'no';

const REQUIRED_BASE_KEYS = [
  'DATABASE_URL_OWNER',
  'DATABASE_URL',
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_STATS',
] as const;

type RequiredBaseKey = (typeof REQUIRED_BASE_KEYS)[number];
type SchemaMismatch = { table: string; missingOnTarget: string[] };

interface SlotConfig {
  slot: number;
  keys: Record<RequiredBaseKey, string>;
  values: Partial<Record<RequiredBaseKey, string>>;
  complete: boolean;
  missing: string[];
}

function parseArgValue(args: string[], key: string): string | undefined {
  const prefix = `${key}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function mustParseUrl(value: string, label: string): string {
  try {
    const parsed = new URL(value.trim());
    return parsed.toString();
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
}

function maybeParseConnectionUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function parseSlot(value: string | undefined): number {
  if (!value) return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

function keyFor(base: RequiredBaseKey, slot: number): string {
  return slot === 1 ? base : `${base}_${slot}`;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(filePath)) return out;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    out[key] = value;
  }
  return out;
}

function mergeEnvMap(fileEnv: Record<string, string>): Record<string, string> {
  const merged = { ...fileEnv };
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') merged[key] = value;
  }
  return merged;
}

function discoverSlotNumbers(env: Record<string, string>): number[] {
  const slots = new Set<number>();

  for (const base of REQUIRED_BASE_KEYS) {
    if (env[base]) slots.add(1);
  }

  for (const key of Object.keys(env)) {
    const match = key.match(/^DATABASE_URL(?:_ADMIN|_STATS|_OWNER)?_(\d+)$/);
    if (!match) continue;
    const slot = parseSlot(match[1]);
    if (slot >= 1) slots.add(slot);
  }

  return Array.from(slots).sort((a, b) => a - b);
}

function buildSlotConfig(slot: number, env: Record<string, string>): SlotConfig {
  const keys = {
    DATABASE_URL_OWNER: keyFor('DATABASE_URL_OWNER', slot),
    DATABASE_URL: keyFor('DATABASE_URL', slot),
    DATABASE_URL_ADMIN: keyFor('DATABASE_URL_ADMIN', slot),
    DATABASE_URL_STATS: keyFor('DATABASE_URL_STATS', slot),
  };

  const values: Partial<Record<RequiredBaseKey, string>> = {};
  const missing: string[] = [];
  for (const base of REQUIRED_BASE_KEYS) {
    const value = env[keys[base]];
    if (value) values[base] = value;
    else missing.push(keys[base]);
  }

  return { slot, keys, values, complete: missing.length === 0, missing };
}

function withSslRequire(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }
  return parsed.toString();
}

function withLibpqCompat(urlValue: string): string {
  const parsed = new URL(urlValue);
  if (!parsed.searchParams.has('uselibpqcompat')) {
    parsed.searchParams.set('uselibpqcompat', 'true');
  }
  if (!parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }
  return parsed.toString();
}

function summarizeConnection(url: string): string {
  try {
    const parsed = new URL(url);
    const user = parsed.username ? `${parsed.username}@` : '';
    return `${parsed.protocol}//${user}${parsed.host}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function runPsqlQuery(url: string, sql: string): string {
  const psqlBin = process.env.PSQL_BIN || 'psql';
  const result = spawnSync(psqlBin, ['-v', 'ON_ERROR_STOP=1', '-At', '-c', sql, url], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`psql failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr?.trim() || `psql exited with code ${result.status ?? 1}`);
  }
  return (result.stdout || '').trim();
}

function runPsqlExec(url: string, sql: string): void {
  const psqlBin = process.env.PSQL_BIN || 'psql';
  const result = spawnSync(psqlBin, ['-v', 'ON_ERROR_STOP=1', '-c', sql, url], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`psql failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`psql exited with code ${result.status ?? 1}`);
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function runSchemaPush(ownerUrl: string): void {
  const result = spawnSync('drizzle-kit', ['push'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: withLibpqCompat(ownerUrl) },
  });
  if (result.error) {
    throw new Error(`drizzle-kit push failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`drizzle-kit push exited with code ${result.status ?? 1}`);
  }
}

function parseMajorFromVersionText(text: string): number | undefined {
  const match = text.match(/(\d+)(?:\.\d+)?/);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

function getServerMajor(url: string): number {
  const raw = runPsqlQuery(url, 'show server_version_num;');
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 10000) {
    throw new Error(`Unable to parse server_version_num: ${raw}`);
  }
  return Math.floor(n / 10000);
}

function getPgDumpMajor(binary: string): number | undefined {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (result.error || (result.status ?? 1) !== 0) return undefined;
  return parseMajorFromVersionText(result.stdout || result.stderr || '');
}

function getPsqlMajor(binary: string): number | undefined {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (result.error || (result.status ?? 1) !== 0) return undefined;
  return parseMajorFromVersionText(result.stdout || result.stderr || '');
}

function resolvePgDumpBinary(requiredServerMajor: number): { bin: string; major: number } {
  const explicit = process.env.PG_DUMP_BIN?.trim();
  const candidates = [
    explicit,
    `/opt/homebrew/opt/postgresql@${requiredServerMajor}/bin/pg_dump`,
    `/usr/local/opt/postgresql@${requiredServerMajor}/bin/pg_dump`,
    'pg_dump',
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    const major = getPgDumpMajor(candidate);
    if (!major) continue;
    if (major >= requiredServerMajor) {
      return { bin: candidate, major };
    }
  }

  const fallback = candidates.find((c) => getPgDumpMajor(c) !== undefined);
  const fallbackMajor = fallback ? getPgDumpMajor(fallback) : undefined;
  const found = fallback ? `${fallback} (v${fallbackMajor ?? 'unknown'})` : 'none';
  throw new Error(
    [
      `No compatible pg_dump found for PostgreSQL ${requiredServerMajor}.`,
      `Found: ${found}.`,
      `Install a newer pg_dump (>=${requiredServerMajor}), e.g.:`,
      `  brew install postgresql@${requiredServerMajor}`,
      `Then set:`,
      `  export PG_DUMP_BIN="/opt/homebrew/opt/postgresql@${requiredServerMajor}/bin/pg_dump"`,
      `  # or on Intel macs: /usr/local/opt/postgresql@${requiredServerMajor}/bin/pg_dump`,
    ].join('\n')
  );
}

function resolvePsqlBinary(requiredMajor: number): { bin: string; major: number } {
  const explicit = process.env.PSQL_BIN?.trim();
  const candidates = [
    explicit,
    `/opt/homebrew/opt/postgresql@${requiredMajor}/bin/psql`,
    `/usr/local/opt/postgresql@${requiredMajor}/bin/psql`,
    'psql',
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    const major = getPsqlMajor(candidate);
    if (!major) continue;
    if (major >= requiredMajor) {
      return { bin: candidate, major };
    }
  }

  const fallback = candidates.find((c) => getPsqlMajor(c) !== undefined);
  const fallbackMajor = fallback ? getPsqlMajor(fallback) : undefined;
  const found = fallback ? `${fallback} (v${fallbackMajor ?? 'unknown'})` : 'none';
  throw new Error(
    [
      `No compatible psql found for dump stream requiring PostgreSQL ${requiredMajor}.`,
      `Found: ${found}.`,
      `Install a newer psql (>=${requiredMajor}), e.g.:`,
      `  brew install postgresql@${requiredMajor}`,
      `Then set:`,
      `  export PSQL_BIN="/opt/homebrew/opt/postgresql@${requiredMajor}/bin/psql"`,
      `  # or on Intel macs: /usr/local/opt/postgresql@${requiredMajor}/bin/psql`,
    ].join('\n')
  );
}

function getTableColumns(url: string, table: string): string[] {
  const safeTable = escapeSqlLiteral(table);
  const csv = runPsqlQuery(
    url,
    `select coalesce(string_agg(column_name, ',' order by ordinal_position), '') from information_schema.columns where table_schema = 'public' and table_name = '${safeTable}';`
  );
  if (!csv) return [];
  return csv
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function findSchemaMismatches(sourceUrl: string, targetUrl: string): SchemaMismatch[] {
  const mismatches: SchemaMismatch[] = [];
  for (const table of KEY_TABLES) {
    const sourceCols = getTableColumns(sourceUrl, table);
    const targetCols = getTableColumns(targetUrl, table);
    if (sourceCols.length === 0) continue;
    const targetSet = new Set(targetCols);
    const missingOnTarget = sourceCols.filter((col) => !targetSet.has(col));
    if (missingOnTarget.length > 0) {
      mismatches.push({ table, missingOnTarget });
    }
  }
  return mismatches;
}

function estimatePublicRows(url: string): number {
  const value = runPsqlQuery(
    url,
    "select coalesce(sum(n_live_tup)::bigint, 0) from pg_stat_user_tables where schemaname = 'public';"
  );
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

function truncatePublicTables(url: string): void {
  const tables = runPsqlQuery(
    url,
    "select coalesce(string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename), '') from pg_tables where schemaname = 'public';"
  );
  if (!tables) {
    console.log('No public tables found on target to truncate.');
    return;
  }
  runPsqlExec(url, `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`);
}

async function cloneDataOnly(oldDbUrl: string, newDbUrl: string): Promise<void> {
  const oldUrl = withSslRequire(oldDbUrl);
  const newUrl = withSslRequire(newDbUrl);
  const sourceServerMajor = getServerMajor(oldUrl);
  const pgDump = resolvePgDumpBinary(sourceServerMajor);
  const psql = resolvePsqlBinary(pgDump.major);

  const pgDumpArgs = ['--no-owner', '--no-privileges', '--data-only', oldUrl];
  const psqlArgs = ['-v', 'ON_ERROR_STOP=1', newUrl];

  console.log('DB clone configuration:');
  console.log(`- from: ${summarizeConnection(oldUrl)}`);
  console.log(`- to:   ${summarizeConnection(newUrl)}`);
  console.log('- mode: data-only');
  console.log(`- source server major: ${sourceServerMajor}`);
  console.log(`- using pg_dump: ${pgDump.bin} (v${pgDump.major})`);
  console.log(`- using psql: ${psql.bin} (v${psql.major})`);
  console.log('');

  const dump = spawn(pgDump.bin, pgDumpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  const restore = spawn(psql.bin, psqlArgs, { stdio: ['pipe', 'inherit', 'pipe'] });

  dump.stdout.pipe(restore.stdin);
  dump.stderr.pipe(process.stderr);
  restore.stderr.pipe(process.stderr);

  const [dumpCode, restoreCode] = await Promise.all([
    new Promise<number>((resolve) => dump.on('close', (code) => resolve(code ?? 1))),
    new Promise<number>((resolve) => restore.on('close', (code) => resolve(code ?? 1))),
  ]);

  if (dumpCode !== 0 || restoreCode !== 0) {
    throw new Error(`Clone failed (pg_dump=${dumpCode}, psql=${restoreCode}).`);
  }
}

async function askNonEmpty(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  fallback?: string
): Promise<string> {
  while (true) {
    const raw = (await rl.question(prompt)).trim();
    const value = raw || (fallback ?? '');
    if (value) return value;
    console.log('Value is required.');
  }
}

async function askYesNo(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue: YesNoDefault
): Promise<boolean> {
  const suffix = defaultValue === 'yes' ? ' [Y/n] ' : ' [y/N] ';
  while (true) {
    const raw = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase();
    if (!raw) return defaultValue === 'yes';
    if (raw === 'y' || raw === 'yes') return true;
    if (raw === 'n' || raw === 'no') return false;
    console.log('Please answer y or n.');
  }
}

function upsertEnvVar(filePath: string, key: string, value: string): void {
  const line = `${key}=${value}`;
  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${line}\n`);
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let updated = false;
  const out = lines.map((l) => {
    if (l.startsWith(`${key}=`)) {
      updated = true;
      return line;
    }
    return l;
  });
  if (!updated) out.push(line);
  writeFileSync(filePath, `${out.join('\n').replace(/\n*$/, '\n')}`);
}

async function main() {
  const rl = createInterface({ input, output });
  try {
    const args = process.argv.slice(2);
    const envPath = resolve('.env');
    const fileEnv = parseEnvFile(envPath);
    const env = mergeEnvMap(fileEnv);

    const sourceUrlOverrideRaw: string | undefined =
      parseArgValue(args, '--source-url') || env.SOURCE_DB_URL;
    const targetUrlOverrideRaw: string | undefined =
      parseArgValue(args, '--target-url') || env.TARGET_DB_URL;
    const targetOwnerUrlOverrideRaw: string | undefined =
      parseArgValue(args, '--target-owner-url') || env.TARGET_DB_OWNER_URL;
    const sourceSlotOverrideRaw = parseArgValue(args, '--source-slot');
    const targetSlotOverrideRaw = parseArgValue(args, '--target-slot');
    if (
      (sourceUrlOverrideRaw && !targetUrlOverrideRaw) ||
      (!sourceUrlOverrideRaw && targetUrlOverrideRaw)
    ) {
      throw new Error('If using explicit URLs, pass both --source-url and --target-url.');
    }

    console.log('DB slot migration wizard');
    console.log('This wizard copies data from one configured slot to another.');
    console.log('');
    console.log(
      `Env source: ${existsSync(envPath) ? envPath : '.env not found (using process env only)'}`
    );
    const slotNumbers = discoverSlotNumbers(env);
    const slotConfigs = slotNumbers.map((slot) => buildSlotConfig(slot, env));
    const completeSlots = slotConfigs.filter((s) => s.complete).map((s) => s.slot);

    console.log('');
    if (slotConfigs.length > 0) {
      console.log('Detected slots');
      for (const s of slotConfigs) {
        if (s.complete) console.log(`- slot ${s.slot}: ready`);
        else console.log(`- slot ${s.slot}: incomplete (missing: ${s.missing.join(', ')})`);
      }
    } else {
      console.log('Detected slots: none');
      console.log('You can still paste source/target URLs manually.');
    }

    const activeSlot = parseSlot(env.ACTIVE_DB_SLOT);

    let sourceSlot: number | undefined;
    let targetSlot: number | undefined;
    let targetSelectedViaUrl = false;
    let sourceCopyUrl: string;
    let targetCopyUrl: string;
    let targetOwnerUrl: string | undefined;

    if (sourceUrlOverrideRaw) {
      sourceCopyUrl = mustParseUrl(sourceUrlOverrideRaw, 'source URL');
    } else if (sourceSlotOverrideRaw) {
      const n = Number(sourceSlotOverrideRaw);
      if (!Number.isInteger(n) || n < 1) throw new Error('Invalid --source-slot');
      const sourceCfg = buildSlotConfig(n, env);
      sourceCopyUrl =
        sourceCfg.values.DATABASE_URL_OWNER || sourceCfg.values.DATABASE_URL_ADMIN || '';
      if (!sourceCopyUrl) throw new Error(`Missing source DB URL for slot ${n}.`);
      sourceSlot = n;
    } else {
      console.log('');
      console.log('Step 1: Select source (copy FROM).');
      const sourcePrompt =
        completeSlots.length > 0
          ? `Source slot ${completeSlots.join('/')} [${completeSlots.includes(activeSlot) ? activeSlot : completeSlots[0]}] or paste source DB URL: `
          : 'Source slot or paste source DB URL: ';
      const sourceDefault =
        completeSlots.length > 0
          ? String(completeSlots.includes(activeSlot) ? activeSlot : completeSlots[0])
          : undefined;
      const sourceInput = await askNonEmpty(rl, sourcePrompt, sourceDefault);
      const sourceUrl = maybeParseConnectionUrl(sourceInput);
      if (sourceUrl) {
        sourceCopyUrl = sourceUrl;
      } else {
        const n = Number(sourceInput);
        if (!Number.isInteger(n) || n < 1 || !completeSlots.includes(n)) {
          throw new Error(
            `Invalid source selection. Choose one of [${completeSlots.join(', ')}] or paste a postgres URL.`
          );
        }
        const sourceCfg = buildSlotConfig(n, env);
        sourceCopyUrl =
          sourceCfg.values.DATABASE_URL_OWNER || sourceCfg.values.DATABASE_URL_ADMIN || '';
        if (!sourceCopyUrl) throw new Error(`Missing source DB URL for slot ${n}.`);
        sourceSlot = n;
      }
    }

    if (targetUrlOverrideRaw) {
      targetCopyUrl = mustParseUrl(targetUrlOverrideRaw, 'target URL');
      targetSelectedViaUrl = true;
      targetOwnerUrl = targetOwnerUrlOverrideRaw
        ? mustParseUrl(targetOwnerUrlOverrideRaw, 'target owner URL')
        : undefined;
    } else if (targetSlotOverrideRaw) {
      const n = Number(targetSlotOverrideRaw);
      if (!Number.isInteger(n) || n < 1) throw new Error('Invalid --target-slot');
      const targetCfg = buildSlotConfig(n, env);
      targetCopyUrl =
        targetCfg.values.DATABASE_URL_OWNER || targetCfg.values.DATABASE_URL_ADMIN || '';
      targetOwnerUrl = targetCfg.values.DATABASE_URL_OWNER;
      if (!targetCopyUrl) throw new Error(`Missing target DB URL for slot ${n}.`);
      targetSlot = n;
    } else {
      console.log('');
      console.log('Step 2: Select target (copy TO).');
      const targetCandidates =
        sourceSlot && completeSlots.length > 0
          ? completeSlots.filter((slot) => slot !== sourceSlot)
          : completeSlots;
      const targetDefault =
        targetCandidates.length > 0
          ? String(targetCandidates[0])
          : completeSlots.length > 0
            ? String(completeSlots[0])
            : undefined;
      const targetPrompt =
        targetCandidates.length > 0
          ? `Target slot ${targetCandidates.join('/')} [${targetDefault}] or paste target DB URL: `
          : 'Target slot or paste target DB URL: ';
      const targetInput = await askNonEmpty(rl, targetPrompt, targetDefault);
      const targetUrl = maybeParseConnectionUrl(targetInput);
      if (targetUrl) {
        targetCopyUrl = targetUrl;
        targetSelectedViaUrl = true;
      } else {
        const n = Number(targetInput);
        if (!Number.isInteger(n) || n < 1 || !completeSlots.includes(n)) {
          throw new Error(
            `Invalid target selection. Choose one of [${completeSlots.join(', ')}] or paste a postgres URL.`
          );
        }
        const targetCfg = buildSlotConfig(n, env);
        targetCopyUrl =
          targetCfg.values.DATABASE_URL_OWNER || targetCfg.values.DATABASE_URL_ADMIN || '';
        targetOwnerUrl = targetCfg.values.DATABASE_URL_OWNER;
        if (!targetCopyUrl) throw new Error(`Missing target DB URL for slot ${n}.`);
        targetSlot = n;
      }
    }

    if (!targetOwnerUrl && targetOwnerUrlOverrideRaw) {
      targetOwnerUrl = mustParseUrl(targetOwnerUrlOverrideRaw, 'target owner URL');
    }
    if (!targetOwnerUrl && targetSelectedViaUrl) {
      targetOwnerUrl = targetCopyUrl;
    }

    console.log('');
    console.log('Step 3: Confirm clone plan.');
    if (sourceSlot && targetSlot) {
      console.log(`- source slot: ${sourceSlot}`);
      console.log(`- target slot: ${targetSlot}`);
    } else {
      console.log(`- source: ${summarizeConnection(sourceCopyUrl)}`);
      console.log(`- target: ${summarizeConnection(targetCopyUrl)}`);
    }
    console.log('- operation: data-only copy');
    console.log('');
    const confirmed = await askYesNo(rl, 'Proceed with migration copy?', 'yes');
    if (!confirmed) {
      console.log('Aborted.');
      return;
    }

    console.log('');
    console.log('Step 4: Optional write freeze for stronger consistency.');
    const writeFreezeConfirmed = await askYesNo(
      rl,
      'Have you paused writes (worker + write APIs) before copy? (advisory, not enforced by script)',
      'no'
    );
    if (!writeFreezeConfirmed) {
      const continueWithoutFreeze = await askYesNo(
        rl,
        'Continue without write freeze? (risk: source can drift during migration)',
        'no'
      );
      if (!continueWithoutFreeze) {
        console.log('Aborted before copy.');
        return;
      }
      console.log('Proceeding without freeze (allowed, but exact parity is not guaranteed).');
    }

    console.log('');
    console.log('Step 5: Preflight source/target row estimates.');
    let sourceRowsBefore = 0;
    let targetRowsBefore = 0;
    let sourceKeyTableCounts: Record<string, TableCountValue> = {};
    let targetKeyTableCounts: Record<string, TableCountValue> = {};
    try {
      sourceRowsBefore = estimatePublicRows(sourceCopyUrl);
      targetRowsBefore = estimatePublicRows(targetCopyUrl);
      console.log(`- source estimated rows: ${sourceRowsBefore}`);
      console.log(`- target estimated rows: ${targetRowsBefore}`);
    } catch (error) {
      console.log(
        `- preflight estimate skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    try {
      sourceKeyTableCounts = getKeyTableCounts((sql) => runPsqlQuery(sourceCopyUrl, sql));
      targetKeyTableCounts = getKeyTableCounts((sql) => runPsqlQuery(targetCopyUrl, sql));
      console.log('');
      console.log('Key table counts (before copy)');
      printKeyTableComparison('source', 'target', sourceKeyTableCounts, targetKeyTableCounts);
    } catch (error) {
      console.log(
        `- key-table preflight skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const sourceKeyHasData = Object.values(sourceKeyTableCounts).some(
      (value) => typeof value === 'number' && value > 0
    );
    const sourceKeyHasSchemaErrors = Object.values(sourceKeyTableCounts).some(
      (value) => value === 'ERR'
    );
    const targetKeyHasSchemaErrors = Object.values(targetKeyTableCounts).some(
      (value) => value === 'ERR'
    );
    if (sourceKeyHasSchemaErrors || targetKeyHasSchemaErrors) {
      console.log('');
      console.log(
        'Schema preflight warning: one or more key tables returned ERR (missing table or permissions).'
      );
      if (targetKeyHasSchemaErrors) {
        console.log(
          'Target appears not fully bootstrapped. Run `bun run db:new` and choose bootstrap=Yes.'
        );
      }
      const continueWithSchemaErrors = await askYesNo(rl, 'Continue migration anyway?', 'no');
      if (!continueWithSchemaErrors) {
        console.log('Aborted before copy.');
        return;
      }
    }

    if (targetOwnerUrl) {
      try {
        let schemaMismatches = findSchemaMismatches(sourceCopyUrl, targetCopyUrl);
        if (schemaMismatches.length > 0) {
          console.log('');
          console.log('Schema compatibility check: target is missing source columns.');
          for (const mismatch of schemaMismatches) {
            console.log(`- ${mismatch.table}: missing ${mismatch.missingOnTarget.join(', ')}`);
          }
          const runPushNow = await askYesNo(
            rl,
            'Run drizzle-kit push on target (owner URL) now?',
            'yes'
          );
          if (!runPushNow) {
            console.log('Aborted before copy (target schema is behind source).');
            return;
          }

          console.log('Running drizzle-kit push on target...');
          runSchemaPush(targetOwnerUrl);

          schemaMismatches = findSchemaMismatches(sourceCopyUrl, targetCopyUrl);
          if (schemaMismatches.length > 0) {
            console.log('');
            console.log('Schema still mismatched after push:');
            for (const mismatch of schemaMismatches) {
              console.log(`- ${mismatch.table}: missing ${mismatch.missingOnTarget.join(', ')}`);
            }
            console.log('Aborted before copy.');
            return;
          }

          console.log('Schema compatibility check passed after push.');
        }
      } catch (error) {
        console.log(
          `- schema compatibility check failed: ${error instanceof Error ? error.message : String(error)}`
        );
        const continueAfterSchemaCheckError = await askYesNo(
          rl,
          'Continue migration anyway?',
          'no'
        );
        if (!continueAfterSchemaCheckError) {
          console.log('Aborted before copy.');
          return;
        }
      }
    }

    if (sourceRowsBefore === 0 || !sourceKeyHasData) {
      const continueZeroSource = await askYesNo(
        rl,
        'Source appears empty (0 estimated rows). Continue anyway?',
        'no'
      );
      if (!continueZeroSource) {
        console.log('Aborted before copy.');
        return;
      }
    }

    if (targetRowsBefore > 0) {
      const shouldTruncateTarget = await askYesNo(
        rl,
        'Target has existing rows. Truncate target public tables before copy?',
        'yes'
      );
      if (shouldTruncateTarget) {
        console.log('Truncating target public tables...');
        truncatePublicTables(targetCopyUrl);
      } else {
        console.log('Skipping target truncate (duplicate key conflicts may stop copy).');
      }
    }

    console.log('');
    console.log('Step 6: Executing copy step...');
    await cloneDataOnly(sourceCopyUrl, targetCopyUrl);
    console.log('Clone completed successfully.');

    console.log('');
    console.log('Step 7: Post-copy verification.');
    let postCheckMismatches: TableCountMismatch[] = [];
    try {
      const targetRowsAfter = estimatePublicRows(targetCopyUrl);
      console.log(`- target estimated rows after copy: ${targetRowsAfter}`);
      console.log(
        '- note: row estimate uses pg_stat_user_tables and can lag; key-table counts are authoritative.'
      );
    } catch (error) {
      console.log(
        `- post-copy estimate skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    try {
      const sourceKeyTableCountsAfter = getKeyTableCounts((sql) =>
        runPsqlQuery(sourceCopyUrl, sql)
      );
      const targetKeyTableCountsAfter = getKeyTableCounts((sql) =>
        runPsqlQuery(targetCopyUrl, sql)
      );
      console.log('');
      console.log('Key table counts (after copy)');
      printKeyTableComparison(
        'source',
        'target',
        sourceKeyTableCountsAfter,
        targetKeyTableCountsAfter
      );

      const sourceDrift = findCountMismatches(sourceKeyTableCounts, sourceKeyTableCountsAfter);
      if (sourceDrift.length > 0) {
        console.log('');
        console.log('Source changed during migration window:');
        for (const drift of sourceDrift) {
          console.log(`- ${drift.table}: before=${drift.source}, after=${drift.target}`);
        }
      }

      postCheckMismatches = findCountMismatches(
        sourceKeyTableCountsAfter,
        targetKeyTableCountsAfter
      );
      if (postCheckMismatches.length > 0) {
        console.log('');
        console.log('Post-copy mismatch detected (do not switch slot yet):');
        for (const mismatch of postCheckMismatches) {
          console.log(`- ${mismatch.table}: source=${mismatch.source}, target=${mismatch.target}`);
        }
        console.log('Recommendation: pause writes/cleanup worker, then rerun migration.');
      } else {
        console.log('');
        console.log('Post-copy key-table check passed: source and target counts match.');
      }
    } catch (error) {
      console.log(
        `- key-table post-check skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (postCheckMismatches.length > 0) {
      console.log('');
      console.log('Aborting before slot switch due to post-copy mismatches.');
      process.exit(1);
    }

    if (targetSlot) {
      console.log('');
      console.log('Step 8: Optional local slot switch.');
      const updateLocalActiveSlot = await askYesNo(
        rl,
        `Update local .env ACTIVE_DB_SLOT=${targetSlot} now?`,
        'no'
      );
      if (updateLocalActiveSlot && targetSlot) {
        upsertEnvVar(envPath, 'ACTIVE_DB_SLOT', String(targetSlot));
        console.log(`Updated ${envPath} with ACTIVE_DB_SLOT=${targetSlot}`);
      }
    }

    console.log('');
    console.log('Done');
    if (sourceSlot && targetSlot) {
      console.log(`- Migration copy complete: slot ${sourceSlot} -> slot ${targetSlot}`);
      console.log(
        `- Next: set ACTIVE_DB_SLOT=${targetSlot} in deployment secrets (Pages + Worker + CI env), then deploy.`
      );
    } else {
      console.log('- Migration copy complete: manual source -> manual target');
      console.log('- Next: update deployment secrets to point app/worker at the new target URLs.');
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Migration wizard failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
