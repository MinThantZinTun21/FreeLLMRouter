import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
// Re-export from code-examples (single source of truth for all code snippets)
import { FREE_MODELS_SDK as FREE_MODELS_FILE } from '@/lib/code-examples/index';
import { useLocalStorage } from './useLocalStorage';
import {
  type UseCaseType as ApiUseCaseType,
  type SortType as ApiSortType,
  USE_CASE_DEFINITIONS,
  SORT_DEFINITIONS,
  filterModelsByUseCase,
  sortModels,
} from '@/lib/model-types';
import {
  DEFAULT_SORT,
  DEFAULT_TOP_N,
  DEFAULT_MAX_ERROR_RATE,
  DEFAULT_TIME_RANGE,
  DEFAULT_MY_REPORTS,
  DEFAULT_RELIABILITY_FILTER_ENABLED,
  DEFAULT_USE_CASE,
} from '@/lib/api-definitions';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

export interface Model {
  id: string;
  name: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  description: string | null;
  modality: string | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  supportedParameters: string[] | null;
  isModerated: boolean | null;
  createdAt?: string | null;
  issueCount?: number;
  errorRate?: number;
  successCount?: number;
  rateLimited?: number;
  unavailable?: number;
  errorCount?: number;
}

interface FeedbackCounts {
  [modelId: string]: {
    rateLimited?: number;
    unavailable?: number;
    error?: number;
    successCount?: number;
    errorRate: number;
  };
}

interface ApiResponse {
  models: Omit<Model, 'issueCount'>[];
  feedbackCounts: FeedbackCounts;
  lastUpdated?: string;
}

// Use shared types from model-types.ts (single source of truth)
export type UseCaseType = ApiUseCaseType;
export type SortType = ApiSortType;

// Re-export use case and sort definitions for UI components
export const USE_CASES = USE_CASE_DEFINITIONS;
export const SORT_OPTIONS = SORT_DEFINITIONS;

export const modelKeys = {
  all: ['models'] as const,
  count: () => [...modelKeys.all, 'count'] as const,
};

// Build API URL for the code snippet (what users will copy)
function buildApiUrl(useCases: UseCaseType[], sort: SortType): string {
  const params = new URLSearchParams();
  if (useCases.length > 0) params.set('useCase', useCases.join(','));
  params.set('sort', sort); // Always include sort
  return `/api/v1/models/ids?${params.toString()}`;
}

interface ModelsResponse {
  models: Model[];
  lastUpdated: string | null;
}

interface FetchOptions {
  timeRange: string;
  maxErrorRate?: number;
  myReports?: boolean;
}

async function fetchAllModels(options: FetchOptions): Promise<ModelsResponse> {
  const params = new URLSearchParams();
  params.append('timeRange', options.timeRange);
  if (options.maxErrorRate !== undefined) {
    params.append('maxErrorRate', options.maxErrorRate.toString());
  }
  if (options.myReports !== undefined) {
    params.append('myReports', options.myReports.toString());
  }
  const url = `/api/v1/models/full?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch models');
  }
  const data: ApiResponse = await response.json();

  // Attach error rate and optional count details (if enabled server-side)
  const models = data.models.map((model) => {
    const feedback = data.feedbackCounts[model.id];
    const errorRate = feedback ? feedback.errorRate : 0;
    const errorCount = feedback?.error;
    const rateLimited = feedback?.rateLimited;
    const unavailable = feedback?.unavailable;
    const successCount = feedback?.successCount;

    if (
      typeof errorCount !== 'number' ||
      typeof rateLimited !== 'number' ||
      typeof unavailable !== 'number' ||
      typeof successCount !== 'number'
    ) {
      return { ...model, errorRate };
    }

    const issueCount = errorCount + rateLimited + unavailable;
    return {
      ...model,
      errorRate,
      issueCount,
      successCount,
      rateLimited,
      unavailable,
      errorCount,
    };
  });

  return {
    models,
    lastUpdated: data.lastUpdated ?? null,
  };
}

// filterModelsByUseCase and sortModels are imported from @/lib/model-types (single source of truth)

// FREE_MODELS_FILE is imported from /public/free-llm-router.ts at build time (see top of file)
// This ensures users always get the latest SDK with caching built-in
export { FREE_MODELS_FILE };

function getSdkRuntimeFile(source: string): string {
  const marker = '// DOCS_SNIPPETS_START';
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return source;
  return `${source.slice(0, markerIndex).trimEnd()}\n`;
}

export function generateSnippet(_apiUrl?: string): string {
  return getSdkRuntimeFile(FREE_MODELS_FILE);
}

/** Extract props for ModelControls from useModels() return value */
export function getModelControlsProps(models: ReturnType<typeof useModels>) {
  return {
    activeUseCases: models.activeUseCases,
    activeSort: models.activeSort,
    activeTopN: models.activeTopN,
    reliabilityFilterEnabled: models.reliabilityFilterEnabled,
    activeMaxErrorRate: models.activeMaxErrorRate,
    activeTimeRange: models.activeTimeRange,
    activeMyReports: models.activeMyReports,
    onToggleUseCase: models.toggleUseCase,
    onSortChange: models.setActiveSort,
    onTopNChange: models.setActiveTopN,
    onReliabilityFilterEnabledChange: models.setReliabilityFilterEnabled,
    onMaxErrorRateChange: models.setActiveMaxErrorRate,
    onTimeRangeChange: models.setActiveTimeRange,
    onMyReportsChange: models.setActiveMyReports,
    onReset: models.resetToDefaults,
  };
}

export interface UseModelsOptions {
  overrideTimeRange?: string;
  overrideMyReports?: boolean;
  overrideReliabilityFilterEnabled?: boolean;
}

export function useModels(options?: UseModelsOptions) {
  const [activeUseCases, setActiveUseCases] = useLocalStorage<UseCaseType[]>(
    'freeModels:useCases',
    []
  );
  const [activeSort, setActiveSort] = useLocalStorage<SortType>('freeModels:sort', DEFAULT_SORT);
  const [activeTopN, setActiveTopN] = useLocalStorage<number | undefined>(
    'freeModels:topN',
    DEFAULT_TOP_N
  );
  const [reliabilityFilterEnabled, setReliabilityFilterEnabled] = useLocalStorage<boolean>(
    'freeModels:reliabilityFilterEnabled',
    DEFAULT_RELIABILITY_FILTER_ENABLED
  );
  const [activeMaxErrorRate, setActiveMaxErrorRate] = useLocalStorage<number | undefined>(
    'freeModels:maxErrorRate',
    DEFAULT_MAX_ERROR_RATE
  );
  const [activeTimeRange, setActiveTimeRange] = useLocalStorage<string>(
    'freeModels:timeRange',
    DEFAULT_TIME_RANGE
  );
  const [activeMyReports, setActiveMyReports] = useLocalStorage<boolean>(
    'freeModels:myReports',
    DEFAULT_MY_REPORTS
  );

  // Use override values if provided, otherwise use state values
  const effectiveTimeRange = options?.overrideTimeRange ?? activeTimeRange;
  const effectiveMyReports = options?.overrideMyReports ?? activeMyReports;
  const effectiveReliabilityEnabled =
    options?.overrideReliabilityFilterEnabled ?? reliabilityFilterEnabled;
  const effectiveMaxErrorRate = effectiveReliabilityEnabled ? activeMaxErrorRate : undefined;

  // Fetch all models once
  const {
    data: modelsResponse = { models: [], lastUpdated: null },
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['models', effectiveTimeRange, effectiveMaxErrorRate, effectiveMyReports],
    queryFn: () =>
      fetchAllModels({
        timeRange: effectiveTimeRange,
        maxErrorRate: effectiveMaxErrorRate,
        myReports: effectiveMyReports,
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...STRICT_QUERY_OPTIONS,
  });

  // Filter and sort on frontend
  const models = useMemo(() => {
    const filtered = filterModelsByUseCase(modelsResponse.models, activeUseCases);
    return sortModels(filtered, activeSort);
  }, [modelsResponse.models, activeUseCases, activeSort]);

  // API URL for the code snippet (reflects current use cases/sort)
  const apiUrl = useMemo(
    () => buildApiUrl(activeUseCases, activeSort),
    [activeUseCases, activeSort]
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
    setActiveUseCases(DEFAULT_USE_CASE);
    setActiveSort(DEFAULT_SORT);
    setActiveTopN(DEFAULT_TOP_N);
    setReliabilityFilterEnabled(DEFAULT_RELIABILITY_FILTER_ENABLED);
    setActiveMaxErrorRate(DEFAULT_MAX_ERROR_RATE);
    setActiveTimeRange(DEFAULT_TIME_RANGE);
    setActiveMyReports(DEFAULT_MY_REPORTS);
  };

  return {
    models,
    totalModelCount: modelsResponse.models.length,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    activeUseCases,
    activeSort,
    activeTopN,
    reliabilityFilterEnabled,
    activeMaxErrorRate,
    activeTimeRange,
    activeMyReports,
    lastUpdated: modelsResponse.lastUpdated,
    apiUrl,
    setActiveUseCases,
    setActiveSort,
    setActiveTopN,
    setReliabilityFilterEnabled,
    setActiveMaxErrorRate,
    setActiveTimeRange,
    setActiveMyReports,
    toggleUseCase,
    resetToDefaults,
  };
}
