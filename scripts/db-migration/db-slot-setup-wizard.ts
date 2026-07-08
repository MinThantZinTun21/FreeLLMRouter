import dotenv from 'dotenv';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

dotenv.config({ quiet: true });

type YesNoDefault = 'yes' | 'no';
const SLOT_BASE_KEYS = [
  'DATABASE_URL',
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_STATS',
  'DATABASE_URL_OWNER',
] as const;
type SlotBaseKey = (typeof SLOT_BASE_KEYS)[number];

type SlotState = {
  slot: number;
  present: SlotBaseKey[];
  missing: SlotBaseKey[];
};

type DerivedConfig = {
  slot: number;
  ownerKey: string;
  appKey: string;
  adminKey: string;
  statsKey: string;
  ownerUrl: string;
  appUrl: string;
  adminUrl: string;
  statsUrl: string;
  appPassword: string;
  adminPassword: string;
  statsPassword: string;
};

function mustParseUrl(value: string, label: string): string {
  try {
    const parsed = new URL(value.trim());
    return parsed.toString();
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
}

function parseSlotIndex(value: string): number {
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('Slot must be an integer >= 1.');
  }
  return n;
}

function parseActiveSlot(value: string | undefined): number {
  if (!value) return 1;
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

function keyForSlot(baseKey: SlotBaseKey, slot: number): string {
  return slot === 1 ? baseKey : `${baseKey}_${slot}`;
}

function detectSlotStates(env: NodeJS.ProcessEnv): SlotState[] {
  const slots = new Set<number>();

  if (SLOT_BASE_KEYS.some((key) => Boolean(env[key]))) {
    slots.add(1);
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    const match = key.match(/^(DATABASE_URL(?:_ADMIN|_STATS|_OWNER)?)_(\d+)$/);
    if (!match) continue;
    const slot = Number(match[2]);
    if (Number.isInteger(slot) && slot >= 1) {
      slots.add(slot);
    }
  }

  return [...slots]
    .sort((a, b) => a - b)
    .map((slot) => {
      const present = SLOT_BASE_KEYS.filter((baseKey) => Boolean(env[keyForSlot(baseKey, slot)]));
      const missing = SLOT_BASE_KEYS.filter((baseKey) => !env[keyForSlot(baseKey, slot)]);
      return { slot, present, missing };
    });
}

function suggestNextSlot(states: SlotState[]): number {
  const used = new Set(states.map((s) => s.slot));
  let slot = 2;
  while (used.has(slot)) {
    slot += 1;
  }
  return slot;
}

function withSslRequire(urlValue: string): string {
  const parsed = new URL(urlValue);
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
  return parsed.toString();
}

function summarizeConnection(urlValue: string): string {
  try {
    const parsed = new URL(urlValue);
    const user = parsed.username ? `${parsed.username}@` : '';
    return `${parsed.protocol}//${user}${parsed.host}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
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

function getPasswordFromUrl(urlValue: string | undefined): string | undefined {
  if (!urlValue) return undefined;
  try {
    const parsed = new URL(urlValue);
    return parsed.password || undefined;
  } catch {
    return undefined;
  }
}

function buildRoleUrl(baseUrl: string, username: string, password: string): string {
  const parsed = new URL(baseUrl);
  parsed.username = username;
  parsed.password = password;
  if (!parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }
  return parsed.toString();
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function deriveConfig(ownerUrlRaw: string, slot: number): DerivedConfig {
  const ownerKey = keyForSlot('DATABASE_URL_OWNER', slot);
  const appKey = keyForSlot('DATABASE_URL', slot);
  const adminKey = keyForSlot('DATABASE_URL_ADMIN', slot);
  const statsKey = keyForSlot('DATABASE_URL_STATS', slot);

  const ownerUrl = withSslRequire(ownerUrlRaw);
  const appPassword = getPasswordFromUrl(process.env[appKey]) ?? generatePassword();
  const adminPassword = getPasswordFromUrl(process.env[adminKey]) ?? generatePassword();
  const statsPassword = getPasswordFromUrl(process.env[statsKey]) ?? generatePassword();

  return {
    slot,
    ownerKey,
    appKey,
    adminKey,
    statsKey,
    ownerUrl,
    appUrl: buildRoleUrl(ownerUrl, 'fma_app', appPassword),
    adminUrl: buildRoleUrl(ownerUrl, 'fma_admin', adminPassword),
    statsUrl: buildRoleUrl(ownerUrl, 'fma_stats', statsPassword),
    appPassword,
    adminPassword,
    statsPassword,
  };
}

function printEnvBlock(config: DerivedConfig): string {
  return [
    `${config.ownerKey}=${config.ownerUrl}`,
    `${config.appKey}=${config.appUrl}`,
    `${config.adminKey}=${config.adminUrl}`,
    `${config.statsKey}=${config.statsUrl}`,
  ].join('\n');
}

function pushSchema(config: DerivedConfig): void {
  execSync('drizzle-kit push', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: withLibpqCompat(config.ownerUrl) },
  });
}

function applyRls(config: DerivedConfig): void {
  const sql = readFileSync('scripts/db-migration/enable_rls.sql', 'utf8')
    .replaceAll('<app_password>', escapeSqlLiteral(config.appPassword))
    .replaceAll('<admin_password>', escapeSqlLiteral(config.adminPassword))
    .replaceAll('<stats_password>', escapeSqlLiteral(config.statsPassword));

  execSync(`psql -v ON_ERROR_STOP=1 -v ECHO=queries "${config.ownerUrl}"`, {
    stdio: 'inherit',
    input: sql,
    env: { ...process.env },
  });
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

async function main() {
  const rl = createInterface({ input, output });
  try {
    const slotStates = detectSlotStates(process.env);
    const activeSlot = parseActiveSlot(process.env.ACTIVE_DB_SLOT);
    const suggestedSlot = suggestNextSlot(slotStates);

    console.log('DB slot setup wizard');
    console.log('This wizard prepares one target slot (2, 3, 4, ...).');
    console.log('');
    console.log(`Detected ACTIVE_DB_SLOT=${activeSlot}`);
    if (slotStates.length === 0) {
      console.log('Detected slots: none');
    } else {
      console.log('Detected slots:');
      for (const state of slotStates) {
        const status =
          state.missing.length === 0 ? 'complete' : `partial, missing ${state.missing.join(', ')}`;
        console.log(`- slot ${state.slot}: ${status}`);
      }
    }
    console.log('');

    console.log('Step 1: Choose slot index to create/update.');
    const slotRaw = await askNonEmpty(
      rl,
      `Target slot index (recommended: 2+) [${suggestedSlot}]: `,
      String(suggestedSlot)
    );
    const slot = parseSlotIndex(slotRaw);
    const existingSlot = slotStates.find((s) => s.slot === slot);

    if (slot === 1) {
      const continueSlot1 = await askYesNo(
        rl,
        'Slot 1 is the default unsuffixed key set. Continue with slot 1?',
        'no'
      );
      if (!continueSlot1) {
        console.log('Aborted.');
        return;
      }
    }
    if (existingSlot) {
      console.log(
        `Slot ${slot} already has ${existingSlot.present.length}/${SLOT_BASE_KEYS.length} key(s) configured.`
      );
      const continueExisting = await askYesNo(
        rl,
        'Continue and regenerate/update this slot?',
        'no'
      );
      if (!continueExisting) {
        console.log('Aborted.');
        return;
      }
    }

    console.log('');
    console.log('Step 2: Provide NEW DB owner URL for that slot.');
    const ownerUrlRaw = await askNonEmpty(rl, 'New DB owner URL (neondb_owner): ');
    const ownerUrl = mustParseUrl(ownerUrlRaw, 'DATABASE_URL_OWNER');

    console.log('');
    console.log('Step 3: Choose output path for generated slot env keys.');
    const outDefault = `/tmp/new-db-slot-${slot}.env`;
    const outputPath = resolve(await askNonEmpty(rl, `Output path [${outDefault}]: `, outDefault));

    console.log('');
    console.log('Step 4: Optional bootstrap on new DB.');
    console.log('Bootstrap = schema push + RLS role/policy SQL.');
    const bootstrap = await askYesNo(rl, 'Run bootstrap now?', 'yes');

    console.log('');
    console.log('Plan');
    console.log(`1. Generate slot ${slot} keys and write ${outputPath}`);
    console.log(bootstrap ? '2. Run schema + RLS bootstrap now' : '2. Skip bootstrap');
    console.log('');

    const confirmed = await askYesNo(rl, 'Proceed?', 'yes');
    if (!confirmed) {
      console.log('Aborted.');
      return;
    }

    const config = deriveConfig(ownerUrl, slot);
    const envBlock = printEnvBlock(config);

    console.log('');
    console.log(`New DB setup summary (slot ${config.slot})`);
    console.log(`- owner: ${summarizeConnection(config.ownerUrl)}`);
    console.log(`- app:   ${summarizeConnection(config.appUrl)}`);
    console.log(`- admin: ${summarizeConnection(config.adminUrl)}`);
    console.log(`- stats: ${summarizeConnection(config.statsUrl)}`);
    console.log('');
    console.log('Generated connection URLs');
    console.log(envBlock);

    writeFileSync(outputPath, `${envBlock}\n`);
    console.log('');
    console.log(`Wrote env block to ${outputPath}`);

    if (bootstrap) {
      console.log('');
      console.log('Running schema push...');
      pushSchema(config);

      console.log('');
      console.log('Applying roles/RLS SQL...');
      applyRls(config);
    }

    console.log('');
    console.log('Next steps');
    console.log(`1. Copy keys from ${outputPath} into .env and deployment secrets.`);
    console.log(
      '2. Ensure ACTIVE_DB_SLOT exists in environments (usually ACTIVE_DB_SLOT=1 before cutover).'
    );
    console.log('3. Run migration wizard next: bun run db:migrate');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Setup wizard failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
