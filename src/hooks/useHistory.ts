import { useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

export interface ResponseDataParams {
  useCases?: string[];
  sort?: string;
  topN?: number;
  maxErrorRate?: number;
  timeRange?: string;
  myReports?: boolean;
}

export interface ParsedResponseData {
  ids: string[];
  count: number;
  params?: ResponseDataParams;
}

export interface ApiRequestLog {
  id: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number | null;
  responseData: string | null; // JSON string: {"ids": [...], "count": N, "params": {...}}
  createdAt: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
}

export interface FeedbackItem {
  id: string;
  modelId: string;
  isSuccess: boolean;
  issue: string | null;
  details: string | null;
  source: string | null;
  createdAt: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
}

export interface LinkedFeedbackItem {
  id: string;
  modelId: string;
  isSuccess: boolean;
  issue: string | null;
  details: string | null;
  createdAt: string;
}

export interface UnifiedHistoryItem {
  id: string;
  type: 'request' | 'feedback';
  createdAt: string;
  // Request fields (null for feedback)
  endpoint: string | null;
  method: string | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  responseData: string | null; // JSON string: {"ids": [...], "count": N, "params": {...}}
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  // Linked feedback (for requests only)
  linkedFeedback?: LinkedFeedbackItem[];
  timeToFirstFeedbackMs?: number | null;
  // Feedback fields (null for requests)
  modelId: string | null;
  isSuccess: boolean | null;
  issue: string | null;
  details: string | null;
}

interface HistoryResponse<T> {
  items: T[];
  hasMore: boolean;
}

interface UseHistoryResult<T> {
  items: T[];
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

interface UseHistoryOptions {
  enabled?: boolean;
  apiKeyId?: string | null;
}

async function fetchHistory<T>(
  type: string,
  page: number,
  limit: number,
  apiKeyId?: string | null
): Promise<HistoryResponse<T> & { page: number }> {
  const params = new URLSearchParams({
    type,
    page: String(page),
    limit: String(limit),
  });
  if (apiKeyId) params.set('apiKeyId', apiKeyId);

  const response = await fetch(`/api/auth/history?${params}`, {
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      isJson && payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Failed to fetch history (${response.status})`;
    throw new Error(message);
  }

  if (!isJson || !payload || typeof payload !== 'object') {
    throw new Error('Unexpected response format from history endpoint');
  }

  return {
    items: payload.items ?? [],
    hasMore: payload.hasMore ?? false,
    page,
  };
}

export function useHistory<T extends ApiRequestLog | FeedbackItem | UnifiedHistoryItem>(
  type: 'requests' | 'feedback' | 'unified',
  limit = 20,
  options?: UseHistoryOptions
): UseHistoryResult<T> {
  const { data, isLoading, isFetchingNextPage, error, fetchNextPage, hasNextPage, refetch } =
    useInfiniteQuery({
      queryKey: ['history', type, limit, options?.apiKeyId],
      queryFn: ({ pageParam }) => fetchHistory<T>(type, pageParam, limit, options?.apiKeyId),
      initialPageParam: 1,
      getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
      enabled: options?.enabled ?? true,
      ...STRICT_QUERY_OPTIONS,
    });

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into a single items array
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = hasNextPage ?? false;

  return {
    items,
    hasMore,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    loadMore,
    refresh: refetch,
  };
}
