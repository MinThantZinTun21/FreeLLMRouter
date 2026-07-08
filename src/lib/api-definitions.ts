/**
 * Single source of truth for all API parameter definitions.
 * All UI components, documentation, and examples import from this file.
 *
 * Separates parameter DEFINITIONS (this file) from business logic (model-types.ts)
 */

// ==================== USE CASE PARAMETER ====================

export type UseCaseType = 'chat' | 'vision' | 'tools' | 'longContext' | 'reasoning';

export const VALID_USE_CASES: UseCaseType[] = [
  'chat',
  'vision',
  'tools',
  'longContext',
  'reasoning',
];

export interface UseCaseDefinition {
  key: UseCaseType | 'all';
  label: string;
  description: string;
  docDescription?: string; // For detailed documentation
}

export const USE_CASE_DEFINITIONS: UseCaseDefinition[] = [
  {
    key: 'all',
    label: 'All',
    description: 'Show all available free models',
    docDescription: 'All available free models without filtering',
  },
  {
    key: 'chat',
    label: 'Chat',
    description: 'Models optimized for conversation',
    docDescription: 'Text-to-text models optimized for conversation',
  },
  {
    key: 'vision',
    label: 'Vision',
    description: 'Models that can analyze images',
    docDescription: 'Models that accept image inputs',
  },
  {
    key: 'tools',
    label: 'Tools',
    description: 'Models that support function/tool calling',
    docDescription: 'Models that support function/tool calling',
  },
  {
    key: 'longContext',
    label: 'Long Context',
    description: 'Models with 100k+ token context windows',
    docDescription: 'Models with 100k+ token context windows',
  },
  {
    key: 'reasoning',
    label: 'Reasoning',
    description: 'Models with advanced reasoning capabilities',
    docDescription: 'Models with advanced reasoning capabilities (e.g., o1, QwQ, DeepSeek R1)',
  },
];

// ==================== SORT PARAMETER ====================

export type SortType = 'contextLength' | 'maxOutput' | 'capable' | 'leastIssues' | 'newest';

export const VALID_SORTS: SortType[] = [
  'contextLength',
  'maxOutput',
  'capable',
  'leastIssues',
  'newest',
];

export interface SortDefinition {
  key: SortType;
  label: string;
  description: string;
  docDescription?: string;
}

export const SORT_DEFINITIONS: SortDefinition[] = [
  {
    key: 'contextLength',
    label: 'Context Length',
    description: 'Sort by maximum input tokens',
    docDescription: 'Largest context window first - best for long documents',
  },
  {
    key: 'maxOutput',
    label: 'Max Output',
    description: 'Sort by maximum output tokens',
    docDescription: 'Highest output token limit first - best for long-form generation',
  },
  {
    key: 'capable',
    label: 'Most Capable',
    description: 'Sort by most supported features',
    docDescription: 'Most supported features first - good default',
  },
  {
    key: 'leastIssues',
    label: 'Least Reported Issues',
    description: 'Sort by fewest reported issues',
    docDescription: 'Fewest user-reported issues first - best for stability',
  },
  {
    key: 'newest',
    label: 'Newest First',
    description: 'Sort by when model was added',
    docDescription: 'Most recently added models first - best for trying new models',
  },
];

// ==================== TIME RANGE PARAMETER ====================

export type TimeRange = '15m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

export const VALID_TIME_RANGES: TimeRange[] = ['15m', '30m', '1h', '6h', '24h', '7d', '30d', 'all'];

// Time ranges with labels (for UI display - used in useHealth.ts)
export const VALID_TIME_RANGES_WITH_LABELS: TimeRange[] = [
  '15m',
  '30m',
  '1h',
  '6h',
  '24h',
  '7d',
  '30d',
];

export interface TimeRangeDefinition {
  value: TimeRange;
  label: string;
  description: string;
}

export const TIME_RANGE_DEFINITIONS: TimeRangeDefinition[] = [
  { value: '15m', label: '15m', description: '15 minutes' },
  { value: '30m', label: '30m', description: '30 minutes' },
  { value: '1h', label: '1h', description: '1 hour' },
  { value: '6h', label: '6h', description: '6 hours' },
  { value: '24h', label: '24h', description: '24 hours (recommended)' },
  { value: '7d', label: '7d', description: '7 days' },
  { value: '30d', label: '30d', description: '30 days' },
  { value: 'all', label: 'All', description: 'All-time' },
];

// Time range to milliseconds conversion
// 'all' maps to null to indicate no time limit (fetch all data)
export const TIME_RANGE_MS: Record<TimeRange, number | null> = {
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: null,
};

// ==================== TOP N PARAMETER ====================

export type TopNOption = 3 | 5 | 10 | undefined;

export interface TopNDefinition {
  value: string; // "3", "5", "10", "all"
  label: string;
  numeric: number | undefined; // 3, 5, 10, undefined
}

export const TOP_N_DEFINITIONS: TopNDefinition[] = [
  { value: '3', label: '3', numeric: 3 },
  { value: '5', label: '5', numeric: 5 },
  { value: '10', label: '10', numeric: 10 },
  { value: 'all', label: 'All', numeric: undefined },
];

export const TOP_N_MIN = 1;
export const TOP_N_MAX = 100;

// ==================== MAX ERROR RATE PARAMETER ====================

// Percentage (0-100) - models with error rate above this are excluded
export const MAX_ERROR_RATE_MIN = 0;
export const MAX_ERROR_RATE_MAX = 100;

// ==================== DEFAULT VALUES ====================

export const DEFAULT_USE_CASE: UseCaseType[] = [];
export const DEFAULT_SORT: SortType = 'contextLength';
export const DEFAULT_TOP_N: number | undefined = 5;
export const DEFAULT_MAX_ERROR_RATE: number | undefined = 10;
export const DEFAULT_TIME_RANGE: TimeRange = '7d';
export const DEFAULT_MY_REPORTS: boolean = false;
export const DEFAULT_RELIABILITY_FILTER_ENABLED: boolean = false;
export const MAX_EXCLUDED_MODELS = 50;

// ==================== UI TOOLTIP CONTENT ====================

export const TOOLTIP_USE_CASE =
  'Select models by use case (chat, vision, tools, long context, reasoning)';
export const TOOLTIP_SORT = 'Sort models by context length, max output, capabilities, or health';
export const TOOLTIP_TOP_N = 'Return only the top N models based on sort order';
export const TOOLTIP_RELIABILITY_FILTER =
  'Filter out unhealthy models by tweaking error rate threshold and time range';

// ==================== VALIDATION UTILITIES ====================

export function validateUseCases(value: string | null): UseCaseType[] {
  if (!value) return [];
  const useCases = value.split(',').map((f) => f.trim());
  return useCases.filter((f) => VALID_USE_CASES.includes(f as UseCaseType)) as UseCaseType[];
}

export function validateSort(value: string | null): SortType {
  if (value && VALID_SORTS.includes(value as SortType)) {
    return value as SortType;
  }
  return DEFAULT_SORT;
}

export function validateTimeRange(value: string | null): TimeRange {
  if (value && VALID_TIME_RANGES.includes(value as TimeRange)) {
    return value as TimeRange;
  }
  return DEFAULT_TIME_RANGE;
}

export function validateTopN(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return undefined;
  return Math.min(Math.max(TOP_N_MIN, parsed), TOP_N_MAX);
}

export function validateMaxErrorRate(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return undefined;
  return Math.min(Math.max(MAX_ERROR_RATE_MIN, parsed), MAX_ERROR_RATE_MAX);
}

// ==================== HELPER UTILITIES ====================

/** Convert TimeRange to cutoff Date */
export function getCutoffDate(range: TimeRange): Date {
  if (range === 'all') return new Date(0);
  const ms = TIME_RANGE_MS[range];
  return new Date(Date.now() - (ms as number));
}

// ==================== API KEY PREFERENCES ====================

/** Preferences that can be stored per API key and applied as defaults */
export interface ApiKeyPreferences {
  useCases?: UseCaseType[];
  sort?: SortType;
  topN?: number;
  maxErrorRate?: number;
  timeRange?: TimeRange;
  myReports?: boolean;
  excludeModelIds?: string[];
}

/** Validate and sanitize preferences object from untrusted input */
export function validatePreferences(input: unknown): ApiKeyPreferences {
  if (!input || typeof input !== 'object') return {};

  const pref = input as Record<string, unknown>;
  const result: ApiKeyPreferences = {};

  // Validate useCases
  if (Array.isArray(pref.useCases)) {
    result.useCases = pref.useCases.filter((uc) =>
      VALID_USE_CASES.includes(uc as UseCaseType)
    ) as UseCaseType[];
  }

  // Validate sort
  if (typeof pref.sort === 'string' && VALID_SORTS.includes(pref.sort as SortType)) {
    result.sort = pref.sort as SortType;
  }

  // Validate topN
  if (typeof pref.topN === 'number') {
    result.topN = Math.min(Math.max(TOP_N_MIN, pref.topN), TOP_N_MAX);
  }

  // Validate maxErrorRate
  if (typeof pref.maxErrorRate === 'number') {
    result.maxErrorRate = Math.min(
      Math.max(MAX_ERROR_RATE_MIN, pref.maxErrorRate),
      MAX_ERROR_RATE_MAX
    );
  }

  // Validate timeRange
  if (
    typeof pref.timeRange === 'string' &&
    VALID_TIME_RANGES.includes(pref.timeRange as TimeRange)
  ) {
    result.timeRange = pref.timeRange as TimeRange;
  }

  // Validate myReports
  if (typeof pref.myReports === 'boolean') {
    result.myReports = pref.myReports;
  }

  // Validate excludeModelIds
  if (Array.isArray(pref.excludeModelIds)) {
    const excluded = Array.from(
      new Set(
        pref.excludeModelIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    ).slice(0, MAX_EXCLUDED_MODELS);

    result.excludeModelIds = excluded;
  }

  return result;
}
