import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type TimeRange,
  type UseCaseType,
  type SortType,
  VALID_TIME_RANGES_WITH_LABELS,
  TIME_RANGE_DEFINITIONS,
  DEFAULT_MY_REPORTS,
  DEFAULT_SORT,
  DEFAULT_USE_CASE,
  DEFAULT_MAX_ERROR_RATE,
} from '@/lib/api-definitions';
import { useCachedSession } from '@/lib/auth-client';
import { useLocalStorage } from './useLocalStorage';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

// Re-export TimeRange for backwards compatibility
export type { TimeRange };

export interface IssueData {
  modelId: string;
  modelName: string;
  rateLimited?: number;
  unavailable?: number;
  error?: number;
  total?: number;
  successCount?: number;
  errorRate: number;
  // Model metadata for filtering
  modality: string | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  supportedParameters: string[] | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
}

export interface TimelineModelData {
  errorRate: number;
  errorCount?: number;
  totalCount?: number;
}

export interface TimelinePoint {
  date: string;
  [modelId: string]: number | string | TimelineModelData;
}

interface HealthResponse {
  issues: IssueData[];
  timeline: TimelinePoint[];
  range: TimeRange;
  lastUpdated: string;
  count: number;
}

// Export TIME_RANGE_OPTIONS for backward compatibility
export const TIME_RANGE_OPTIONS = TIME_RANGE_DEFINITIONS.filter((tr) =>
  VALID_TIME_RANGES_WITH_LABELS.includes(tr.value)
).map((tr) => ({ value: tr.value as TimeRange, label: `Last ${tr.label}` }));

interface FetchHealthOptions {
  range: TimeRange;
  myReports?: boolean;
  useCases?: UseCaseType[];
  sort?: SortType;
  topN?: number;
  maxErrorRate?: number;
}

async function fetchHealth(options: FetchHealthOptions): Promise<HealthResponse> {
  const params = new URLSearchParams();
  params.append('range', options.range);

  if (options.myReports) {
    params.append('myReports', 'true');
  }
  if (options.useCases && options.useCases.length > 0) {
    params.append('useCases', options.useCases.join(','));
  }
  if (options.sort) {
    params.append('sort', options.sort);
  }
  if (options.topN !== undefined) {
    params.append('topN', options.topN.toString());
  }
  if (options.maxErrorRate !== undefined) {
    params.append('maxErrorRate', options.maxErrorRate.toString());
  }

  const response = await fetch(`/api/health?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch health data');
  }
  return response.json();
}

export interface UseHealthOptions {
  overrideTopN?: number;
  overrideReliabilityFilterEnabled?: boolean;
  overrideMaxErrorRate?: number;
}

const HEALTH_DEFAULT_TIME_RANGE: TimeRange = '7d';
const HEALTH_DEFAULT_TOP_N: number | undefined = undefined;
const HEALTH_DEFAULT_RELIABILITY_FILTER_ENABLED = false;
const HEALTH_DEFAULTS_VERSION = 1;

export function useHealth(options?: UseHealthOptions) {
  // Time range and myReports state
  const [range, setRange] = useLocalStorage<TimeRange>(
    'freeModels:health:range',
    HEALTH_DEFAULT_TIME_RANGE as TimeRange
  );
  const [myReports, setMyReportsState] = useLocalStorage<boolean>(
    'freeModels:health:myReports',
    DEFAULT_MY_REPORTS
  );
  const { data: session } = useCachedSession();

  // ModelControls state - persisted in localStorage
  const [activeUseCases, setActiveUseCases] = useLocalStorage<UseCaseType[]>(
    'freeModels:health:useCases',
    DEFAULT_USE_CASE
  );
  const [activeSort, setActiveSort] = useLocalStorage<SortType>(
    'freeModels:health:sort',
    DEFAULT_SORT
  );
  const [activeTopN, setActiveTopN] = useLocalStorage<number | undefined>(
    'freeModels:health:topN',
    HEALTH_DEFAULT_TOP_N
  );
  const [reliabilityFilterEnabled, setReliabilityFilterEnabled] = useLocalStorage<boolean>(
    'freeModels:health:reliabilityFilterEnabled',
    HEALTH_DEFAULT_RELIABILITY_FILTER_ENABLED
  );
  const [activeMaxErrorRate, setActiveMaxErrorRate] = useLocalStorage<number | undefined>(
    'freeModels:health:maxErrorRate',
    DEFAULT_MAX_ERROR_RATE
  );
  const [defaultsVersion, setDefaultsVersion] = useLocalStorage<number>(
    'freeModels:health:defaultsVersion',
    0
  );

  // Force myReports to false if user is not authenticated
  const effectiveMyReports = session ? myReports : false;

  // Apply overrides
  const effectiveTopN = options?.overrideTopN ?? activeTopN;
  const effectiveReliabilityEnabled =
    options?.overrideReliabilityFilterEnabled ?? reliabilityFilterEnabled;
  const effectiveMaxErrorRate = effectiveReliabilityEnabled
    ? (options?.overrideMaxErrorRate ?? activeMaxErrorRate)
    : undefined;

  useEffect(() => {
    // Reset to false if user logs out
    if (!session && myReports) {
      setMyReportsState(false);
    }
  }, [session, myReports, setMyReportsState]);

  useEffect(() => {
    if (defaultsVersion < HEALTH_DEFAULTS_VERSION) {
      // Initialize broader defaults once (without locking the controls).
      setRange(HEALTH_DEFAULT_TIME_RANGE as TimeRange);
      setActiveTopN(HEALTH_DEFAULT_TOP_N);
      setReliabilityFilterEnabled(HEALTH_DEFAULT_RELIABILITY_FILTER_ENABLED);
      setDefaultsVersion(HEALTH_DEFAULTS_VERSION);
    }
  }, [defaultsVersion, setRange, setActiveTopN, setReliabilityFilterEnabled, setDefaultsVersion]);

  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: [
      'health',
      range,
      effectiveMyReports,
      activeUseCases,
      activeSort,
      effectiveTopN,
      effectiveMaxErrorRate,
    ],
    queryFn: () =>
      fetchHealth({
        range,
        myReports: effectiveMyReports,
        useCases: activeUseCases,
        sort: activeSort,
        topN: effectiveTopN,
        maxErrorRate: effectiveMaxErrorRate,
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...STRICT_QUERY_OPTIONS,
  });

  const setMyReports = useCallback(
    (value: boolean) => {
      // Only allow setting myReports to true if authenticated
      setMyReportsState(session ? value : false);
    },
    [session, setMyReportsState]
  );

  const toggleUseCase = (useCase: UseCaseType | 'all') => {
    if (useCase === 'all') {
      setActiveUseCases([]);
    } else {
      const newUseCases = activeUseCases.includes(useCase)
        ? activeUseCases.filter((uc) => uc !== useCase)
        : [...activeUseCases, useCase];
      setActiveUseCases(newUseCases);
    }
  };

  const resetToDefaults = () => {
    // Always reset useCase and sort to defaults
    setActiveUseCases(DEFAULT_USE_CASE);
    setActiveSort(DEFAULT_SORT);
    setRange(HEALTH_DEFAULT_TIME_RANGE as TimeRange);
    setMyReportsState(DEFAULT_MY_REPORTS);

    // Only reset topN/health if not using overrides
    if (options?.overrideTopN === undefined) {
      setActiveTopN(HEALTH_DEFAULT_TOP_N);
    }
    if (options?.overrideReliabilityFilterEnabled === undefined) {
      setReliabilityFilterEnabled(HEALTH_DEFAULT_RELIABILITY_FILTER_ENABLED);
    }
    if (options?.overrideMaxErrorRate === undefined) {
      setActiveMaxErrorRate(DEFAULT_MAX_ERROR_RATE);
    }
  };

  return {
    issues: data?.issues ?? [],
    timeline: data?.timeline ?? [],
    count: data?.count ?? 0,
    lastUpdated: data?.lastUpdated ?? null,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    range,
    setRange,
    myReports: effectiveMyReports,
    setMyReports,
    // ModelControls state
    activeUseCases,
    activeSort,
    activeTopN,
    reliabilityFilterEnabled,
    activeMaxErrorRate,
    toggleUseCase,
    setActiveUseCases,
    setActiveSort,
    setActiveTopN,
    setReliabilityFilterEnabled,
    setActiveMaxErrorRate,
    resetToDefaults,
  };
}
