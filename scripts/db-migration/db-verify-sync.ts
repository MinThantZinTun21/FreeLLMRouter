import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  type TableCountValue,
  findCountMismatches,
  getKeyTableCounts,
  printKeyTableComparison,
} from './key-table-check';

dotenv.config({ quiet: true });

const REQUIRED_BASE_KEYS = [
  'DATABASE_URL_OWNER',
  'DATABASE_URL',
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_STATS',
] as const;

type RequiredBaseKey = (typeof REQUIRED_BASE_KEYS)[number];

type SlotConfig = {
  slot: number;
  keys: Record<RequiredBaseKey, string>;
  values: Partial<Record<RequiredBaseKey, string>>;
  complete: boolean;
  missing: string[];
};

function parseSlot(value: string | undefined): number {
  if (!value) return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid slot: ${value}`);
  }
  return n;
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

async function main() {
  const rl = createInterface({ input, output });
  try {
    const args = process.argv.slice(2);
    const envPath = resolve('.env');
    const fileEnv = parseEnvFile(envPath);
    const env = mergeEnvMap(fileEnv);

    const sourceUrlArg = parseArgValue(args, '--source-url') || env.SOURCE_DB_URL;
    const targetUrlArg = parseArgValue(args, '--target-url') || env.TARGET_DB_URL;
    const sourceSlotArg = parseArgValue(args, '--source-slot');
    const targetSlotArg = parseArgValue(args, '--target-slot');
    if ((sourceUrlArg && !targetUrlArg) || (!sourceUrlArg && targetUrlArg)) {
      throw new Error('If using explicit URLs, pass both --source-url and --target-url.');
    }

    const slotNumbers = Object.keys(env)
      .map((key) => {
        if (key === 'DATABASE_URL_OWNER' || key === 'DATABASE_URL_ADMIN') return 1;
        const match = key.match(/^DATABASE_URL(?:_ADMIN|_STATS|_OWNER)?_(\d+)$/);
        return match ? Number(match[1]) : null;
      })
      .filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1);
    const completeSlots = [...new Set(slotNumbers)]
      .sort((a, b) => a - b)
      .filter((slot) => buildSlotConfig(slot, env).complete);
    const activeSlot = parseSlot(env.ACTIVE_DB_SLOT);

    let sourceSlot: number | undefined;
    let targetSlot: number | undefined;
    let sourceUrl: string;
    let targetUrl: string;

    if (sourceUrlArg) {
      sourceUrl = mustParseUrl(sourceUrlArg, 'source URL');
    } else if (sourceSlotArg) {
      sourceSlot = parseSlot(sourceSlotArg);
      const sourceCfg = buildSlotConfig(sourceSlot, env);
      sourceUrl = sourceCfg.values.DATABASE_URL_OWNER || sourceCfg.values.DATABASE_URL_ADMIN || '';
      if (!sourceUrl) throw new Error(`Missing source DB URL for slot ${sourceSlot}.`);
    } else {
      const sourcePrompt =
        completeSlots.length > 0
          ? `Source slot ${completeSlots.join('/')} [${completeSlots.includes(activeSlot) ? activeSlot : completeSlots[0]}] or paste source DB URL: `
          : 'Source slot or paste source DB URL: ';
      const sourceDefault =
        completeSlots.length > 0
          ? String(completeSlots.includes(activeSlot) ? activeSlot : completeSlots[0])
          : undefined;
      const sourceInput = await askNonEmpty(rl, sourcePrompt, sourceDefault);
      const sourceUrlInput = maybeParseConnectionUrl(sourceInput);
      if (sourceUrlInput) {
        sourceUrl = sourceUrlInput;
      } else {
        sourceSlot = parseSlot(sourceInput);
        if (completeSlots.length > 0 && !completeSlots.includes(sourceSlot)) {
          throw new Error(`Invalid source slot. Choose one of: ${completeSlots.join(', ')}`);
        }
        const sourceCfg = buildSlotConfig(sourceSlot, env);
        sourceUrl =
          sourceCfg.values.DATABASE_URL_OWNER || sourceCfg.values.DATABASE_URL_ADMIN || '';
        if (!sourceUrl) throw new Error(`Missing source DB URL for slot ${sourceSlot}.`);
      }
    }

    if (targetUrlArg) {
      targetUrl = mustParseUrl(targetUrlArg, 'target URL');
    } else if (targetSlotArg) {
      targetSlot = parseSlot(targetSlotArg);
      const targetCfg = buildSlotConfig(targetSlot, env);
      targetUrl = targetCfg.values.DATABASE_URL_OWNER || targetCfg.values.DATABASE_URL_ADMIN || '';
      if (!targetUrl) throw new Error(`Missing target DB URL for slot ${targetSlot}.`);
    } else {
      const targetCandidates =
        sourceSlot && completeSlots.length > 0
          ? completeSlots.filter((slot) => slot !== sourceSlot)
          : completeSlots;
      const targetDefault = targetCandidates.length > 0 ? String(targetCandidates[0]) : undefined;
      const targetPrompt =
        targetCandidates.length > 0
          ? `Target slot ${targetCandidates.join('/')} [${targetDefault}] or paste target DB URL: `
          : 'Target slot or paste target DB URL: ';
      const targetInput = await askNonEmpty(rl, targetPrompt, targetDefault);
      const targetUrlInput = maybeParseConnectionUrl(targetInput);
      if (targetUrlInput) {
        targetUrl = targetUrlInput;
      } else {
        targetSlot = parseSlot(targetInput);
        if (completeSlots.length > 0 && !completeSlots.includes(targetSlot)) {
          throw new Error(`Invalid target slot. Choose one of: ${completeSlots.join(', ')}`);
        }
        const targetCfg = buildSlotConfig(targetSlot, env);
        targetUrl =
          targetCfg.values.DATABASE_URL_OWNER || targetCfg.values.DATABASE_URL_ADMIN || '';
        if (!targetUrl) throw new Error(`Missing target DB URL for slot ${targetSlot}.`);
      }
    }

    console.log('DB sync verification (same check as migrate post-copy)');
    if (sourceSlot && targetSlot) {
      console.log(`- source slot: ${sourceSlot} (${summarizeConnection(sourceUrl)})`);
      console.log(`- target slot: ${targetSlot} (${summarizeConnection(targetUrl)})`);
    } else {
      console.log(`- source: ${summarizeConnection(sourceUrl)}`);
      console.log(`- target: ${summarizeConnection(targetUrl)}`);
    }
    console.log('');

    const sourceCounts: Record<string, TableCountValue> = getKeyTableCounts((sql) =>
      runPsqlQuery(sourceUrl, sql)
    );
    const targetCounts: Record<string, TableCountValue> = getKeyTableCounts((sql) =>
      runPsqlQuery(targetUrl, sql)
    );

    printKeyTableComparison('source', 'target', sourceCounts, targetCounts);

    const mismatches = findCountMismatches(sourceCounts, targetCounts);
    console.log('');
    if (mismatches.length === 0) {
      console.log('Verification passed: key-table counts match.');
      return;
    }

    console.log('Verification failed:');
    for (const mismatch of mismatches) {
      console.log(`- ${mismatch.table}: source=${mismatch.source}, target=${mismatch.target}`);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Verify failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
