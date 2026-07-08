export const KEY_TABLES = [
  'users',
  'api_keys',
  'free_models',
  'model_feedback',
  'api_request_logs',
  'sessions',
  'accounts',
  'site_feedback',
] as const;

export type TableCountValue = number | 'ERR';
export type TableCountMismatch = { table: string; source: number; target: number };

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function getTableCount(runQuery: (sql: string) => string, table: string): TableCountValue {
  try {
    const value = runQuery(
      `select count(*)::bigint from ${quoteIdent('public')}.${quoteIdent(table)};`
    );
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 'ERR';
    return Math.trunc(n);
  } catch {
    return 'ERR';
  }
}

export function getKeyTableCounts(
  runQuery: (sql: string) => string
): Record<string, TableCountValue> {
  const out: Record<string, TableCountValue> = {};
  for (const table of KEY_TABLES) {
    out[table] = getTableCount(runQuery, table);
  }
  return out;
}

export function printKeyTableComparison(
  leftLabel: string,
  rightLabel: string,
  left: Record<string, TableCountValue>,
  right: Record<string, TableCountValue>
): void {
  console.log(`${'table'.padEnd(18)} ${leftLabel.padStart(12)} ${rightLabel.padStart(12)}`);
  for (const table of KEY_TABLES) {
    const l = String(left[table] ?? 'ERR');
    const r = String(right[table] ?? 'ERR');
    console.log(`${table.padEnd(18)} ${l.padStart(12)} ${r.padStart(12)}`);
  }
}

export function findCountMismatches(
  source: Record<string, TableCountValue>,
  target: Record<string, TableCountValue>
): TableCountMismatch[] {
  const mismatches: TableCountMismatch[] = [];
  for (const table of KEY_TABLES) {
    const s = source[table];
    const t = target[table];
    if (typeof s === 'number' && typeof t === 'number' && s !== t) {
      mismatches.push({ table, source: s, target: t });
    }
  }
  return mismatches;
}
