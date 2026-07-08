import { useQuery } from '@tanstack/react-query';
import {
  type UseCaseType,
  type SortType,
  DEFAULT_SORT,
  DEFAULT_USE_CASE,
} from '@/lib/api-definitions';
import { useLocalStorage } from './useLocalStorage';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

export interface AvailabilityData {
  modelId: string;
  modelName: string;
  isActive: boolean | null;
  modality: string | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  supportedParameters: string[] | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  availability: Record<string, boolean>; // { "2026-01-31": true, "2026-01-30": false, ... }
}

interface AvailabilityResponse {
  models: AvailabilityData[];
  dates: string[];
  lastUpdated: string;
  count: number;
}

interface FetchAvailabilityOptions {
  days?: number;
  useCases?: UseCaseType[];
  sort?: SortType;
}

async function fetchAvailability(options: FetchAvailabilityOptions): Promise<AvailabilityResponse> {
  const params = new URLSearchParams();

  if (options.days) {
    params.append('days', options.days.toString());
  }
  if (options.useCases && options.useCases.length > 0) {
    params.append('useCases', options.useCases.join(','));
  }
  if (options.sort) {
    params.append('sort', options.sort);
  }

  const response = await fetch(`/api/availability?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch availability data');
  }
  return response.json();
}

const AVAILABILITY_DEFAULT_DAYS = 90;

export function useAvailability() {
  const [days, setDays] = useLocalStorage<number>(
    'freeModels:availability:days',
    AVAILABILITY_DEFAULT_DAYS
  );
  const [activeUseCases, setActiveUseCases] = useLocalStorage<UseCaseType[]>(
    'freeModels:availability:useCases',
    DEFAULT_USE_CASE
  );
  const [activeSort, setActiveSort] = useLocalStorage<SortType>(
    'freeModels:availability:sort',
    DEFAULT_SORT
  );

  const {
    data,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['availability', days, activeUseCases, activeSort],
    queryFn: () =>
      fetchAvailability({
        days,
        useCases: activeUseCases,
        sort: activeSort,
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...STRICT_QUERY_OPTIONS,
  });

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
    setDays(AVAILABILITY_DEFAULT_DAYS);
    setActiveUseCases(DEFAULT_USE_CASE);
    setActiveSort(DEFAULT_SORT);
  };

  return {
    models: data?.models ?? [],
    dates: data?.dates ?? [],
    count: data?.count ?? 0,
    lastUpdated: data?.lastUpdated ?? null,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    days,
    setDays,
    activeUseCases,
    activeSort,
    toggleUseCase,
    setActiveSort,
    resetToDefaults,
  };
}
