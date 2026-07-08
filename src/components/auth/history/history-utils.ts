import {
  DEFAULT_SORT,
  DEFAULT_TIME_RANGE,
  VALID_SORTS,
  VALID_TIME_RANGES,
  VALID_USE_CASES,
  type SortType,
  type TimeRange,
  type UseCaseType,
} from '@/lib/api-definitions';

export interface ParsedResponseData {
  ids: string[];
  count: number;
  params?: {
    useCases?: string[];
    sort?: string;
    topN?: number;
    maxErrorRate?: number;
    timeRange?: string;
    myReports?: boolean;
  };
}

export function parseResponseData(responseData: string | null): ParsedResponseData | null {
  if (!responseData) return null;

  try {
    const parsed: unknown = JSON.parse(responseData);
    if (!parsed || typeof parsed !== 'object') return null;

    const data = parsed as Record<string, unknown>;
    const idsFromIds = Array.isArray(data.ids)
      ? data.ids.filter((id): id is string => typeof id === 'string')
      : [];

    const idsFromModels = Array.isArray(data.models)
      ? data.models
          .map((model) => {
            if (typeof model === 'string') return model;
            if (model && typeof model === 'object' && 'id' in model) {
              const id = (model as { id?: unknown }).id;
              return typeof id === 'string' ? id : null;
            }
            return null;
          })
          .filter((id): id is string => typeof id === 'string')
      : [];

    const ids = idsFromIds.length > 0 ? idsFromIds : idsFromModels;
    const count = typeof data.count === 'number' ? data.count : ids.length;

    let params: ParsedResponseData['params'];
    if (data.params && typeof data.params === 'object') {
      const rawParams = data.params as Record<string, unknown>;
      params = {
        useCases: Array.isArray(rawParams.useCases)
          ? rawParams.useCases.filter((value): value is string => typeof value === 'string')
          : undefined,
        sort: typeof rawParams.sort === 'string' ? rawParams.sort : undefined,
        topN: typeof rawParams.topN === 'number' ? rawParams.topN : undefined,
        maxErrorRate:
          typeof rawParams.maxErrorRate === 'number' ? rawParams.maxErrorRate : undefined,
        timeRange: typeof rawParams.timeRange === 'string' ? rawParams.timeRange : undefined,
        myReports: typeof rawParams.myReports === 'boolean' ? rawParams.myReports : undefined,
      };
    }

    return { ids, count, params };
  } catch {
    return null;
  }
}

export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getStatusBadgeVariant(
  statusCode: number
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (statusCode >= 200 && statusCode < 300) return 'default';
  if (statusCode >= 400 && statusCode < 500) return 'secondary';
  if (statusCode >= 500) return 'destructive';
  return 'outline';
}

export function toUseCases(params: ParsedResponseData['params']): UseCaseType[] {
  if (!params?.useCases) return [];
  return params.useCases.filter((value): value is UseCaseType =>
    VALID_USE_CASES.includes(value as UseCaseType)
  );
}

export function toSort(params: ParsedResponseData['params']): SortType {
  const sort = params?.sort;
  if (sort && VALID_SORTS.includes(sort as SortType)) return sort as SortType;
  return DEFAULT_SORT;
}

export function toTimeRange(params: ParsedResponseData['params']): TimeRange {
  const range = params?.timeRange;
  if (range && VALID_TIME_RANGES.includes(range as TimeRange)) return range as TimeRange;
  return DEFAULT_TIME_RANGE;
}
