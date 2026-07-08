import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { ApiPreferencesConfigurator } from '@/components/ApiPreferencesConfigurator';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UseCaseType, TimeRange, ApiKeyPreferences } from '@/lib/api-definitions';
import {
  DEFAULT_SORT,
  DEFAULT_TIME_RANGE,
  DEFAULT_MY_REPORTS,
  DEFAULT_TOP_N,
  DEFAULT_USE_CASE,
} from '@/lib/api-definitions';
import { filterModelsByUseCase, sortModels } from '@/lib/model-types';
import type { Model } from '@/hooks/useModels';
import { Loader2 } from 'lucide-react';
import { fetchJsonOrThrow, NO_STORE_REQUEST_INIT } from '@/lib/client-api';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

interface ApiKey {
  id: string;
  name: string;
  enabled: boolean;
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

interface ModelsApiResponse {
  models: Model[];
  feedbackCounts: FeedbackCounts;
  lastUpdated?: string;
}

function getDefaultPreferences(): ApiKeyPreferences {
  return {
    useCases: [...DEFAULT_USE_CASE],
    sort: DEFAULT_SORT,
    topN: DEFAULT_TOP_N,
    maxErrorRate: undefined,
    timeRange: DEFAULT_TIME_RANGE,
    myReports: DEFAULT_MY_REPORTS,
    excludeModelIds: [],
  };
}

function normalizePreferences(preferences: ApiKeyPreferences): ApiKeyPreferences {
  return {
    useCases: preferences.useCases ?? [...DEFAULT_USE_CASE],
    sort: preferences.sort ?? DEFAULT_SORT,
    topN: preferences.topN ?? DEFAULT_TOP_N,
    maxErrorRate: preferences.maxErrorRate,
    timeRange: preferences.timeRange ?? DEFAULT_TIME_RANGE,
    myReports: preferences.myReports ?? DEFAULT_MY_REPORTS,
    excludeModelIds: preferences.excludeModelIds ?? [],
  };
}

async function fetchApiKeys(): Promise<ApiKey[]> {
  const response = await authClient.apiKey.list();
  return ((response.data as ApiKey[]) || []).filter((key) => key.enabled);
}

async function fetchPreferences(apiKeyId: string): Promise<ApiKeyPreferences> {
  const data = await fetchJsonOrThrow<{ preferences?: ApiKeyPreferences }>(
    `/api/auth/preferences?apiKeyId=${encodeURIComponent(apiKeyId)}`,
    {
      credentials: 'include',
      ...NO_STORE_REQUEST_INIT,
      headers: { Accept: 'application/json' },
    },
    'Could not load saved preferences'
  );
  return data.preferences || {};
}

async function savePreferences(
  apiKeyId: string,
  preferences: ApiKeyPreferences
): Promise<ApiKeyPreferences> {
  const data = await fetchJsonOrThrow<{ preferences?: ApiKeyPreferences }>(
    '/api/auth/preferences',
    {
      method: 'PUT',
      credentials: 'include',
      ...NO_STORE_REQUEST_INIT,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apiKeyId, preferences }),
    },
    'Failed to save preferences'
  );
  return data.preferences || {};
}

async function fetchModelsForPreview(
  timeRange: string,
  maxErrorRate?: number,
  myReports?: boolean
): Promise<{ models: Model[]; lastUpdated: string | null }> {
  const params = new URLSearchParams();
  params.append('timeRange', timeRange);
  if (maxErrorRate !== undefined) {
    params.append('maxErrorRate', maxErrorRate.toString());
  }
  if (myReports !== undefined) {
    params.append('myReports', myReports.toString());
  }
  const response = await fetch(`/api/v1/models/full?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch models');

  const data: ModelsApiResponse = await response.json();
  const models = data.models.map((model) => {
    const feedback = data.feedbackCounts?.[model.id];
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
  return { models, lastUpdated: data.lastUpdated || null };
}

export function ApiKeyConfigurationTab() {
  const [configuringKey, setConfiguringKey] = useState<ApiKey | null>(null);
  const [preferences, setPreferences] = useState<ApiKeyPreferences>(getDefaultPreferences);
  const [previewPage, setPreviewPage] = useState(1);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(false);
  const [prefLoadError, setPrefLoadError] = useState<string | null>(null);
  const [prefsMessage, setPrefsMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
    ...STRICT_QUERY_OPTIONS,
  });

  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: [
      'previewModels',
      preferences.timeRange ?? DEFAULT_TIME_RANGE,
      preferences.maxErrorRate,
      preferences.myReports,
    ],
    queryFn: () =>
      fetchModelsForPreview(
        preferences.timeRange ?? DEFAULT_TIME_RANGE,
        preferences.maxErrorRate,
        preferences.myReports
      ),
    enabled: true,
    staleTime: 5 * 60 * 1000,
    ...STRICT_QUERY_OPTIONS,
  });

  const handleConfigureKey = async (key: ApiKey) => {
    setConfiguringKey(key);
    setPrefsMessage(null);
    setPrefLoadError(null);
    setPreviewPage(1);
    setIsLoadingPreferences(true);

    try {
      const prefs = await fetchPreferences(key.id);
      setPreferences(normalizePreferences(prefs));
    } catch (error) {
      setPrefLoadError(error instanceof Error ? error.message : 'Could not load saved preferences');
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  useEffect(() => {
    if (apiKeys.length === 0) {
      setConfiguringKey(null);
      return;
    }
    if (!configuringKey || !apiKeys.some((key) => key.id === configuringKey.id)) {
      void handleConfigureKey(apiKeys[0]);
    }
  }, [apiKeys, configuringKey]);

  const updatePref = <K extends keyof ApiKeyPreferences>(key: K, value: ApiKeyPreferences[K]) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setPrefsMessage(null);
  };

  const toggleUseCase = (useCase: UseCaseType | 'all') => {
    if (useCase === 'all') {
      updatePref('useCases', []);
    } else {
      const current = preferences.useCases ?? [];
      const updated = current.includes(useCase)
        ? current.filter((uc) => uc !== useCase)
        : [...current, useCase];
      updatePref('useCases', updated);
    }
    setPreviewPage(1);
  };

  const previewModels = useMemo(() => {
    const allModels = modelsData?.models ?? [];
    const useCases = preferences.useCases ?? [];
    const sort = preferences.sort ?? DEFAULT_SORT;
    const filtered = filterModelsByUseCase(allModels, useCases);
    const sorted = sortModels(filtered, sort);
    const excluded = new Set(preferences.excludeModelIds ?? []);
    const withoutExcluded = sorted.filter((model) => !excluded.has(model.id));
    const topN = preferences.topN;
    return topN ? withoutExcluded.slice(0, topN) : withoutExcluded;
  }, [
    modelsData?.models,
    preferences.useCases,
    preferences.sort,
    preferences.topN,
    preferences.excludeModelIds,
  ]);

  const handleReliabilityFilterEnabledChange = (enabled: boolean) => {
    if (!enabled) {
      updatePref('maxErrorRate', undefined);
    } else {
      updatePref('maxErrorRate', 10);
    }
    setPreviewPage(1);
  };

  const toggleExcludedModel = (modelId: string) => {
    const current = preferences.excludeModelIds ?? [];
    const next = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId];
    updatePref('excludeModelIds', next);
    setPreviewPage(1);
  };

  const handleResetPrefs = () => {
    setPreferences(getDefaultPreferences());
    setPreviewPage(1);
    setPrefsMessage(null);
  };

  const savePreferencesMutation = useMutation({
    mutationFn: () => {
      if (!configuringKey) throw new Error('No key selected');
      return savePreferences(configuringKey.id, preferences);
    },
    onSuccess: (savedPreferences) => {
      setPreferences(normalizePreferences(savedPreferences));
      setPrefLoadError(null);
      setPrefsMessage({ type: 'success', text: 'Preferences saved' });
    },
    onError: (err: Error) => {
      setPrefsMessage({ type: 'error', text: err.message || 'Failed to save preferences' });
    },
  });

  if (apiKeys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Create an API key first to configure its default parameters.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ApiPreferencesConfigurator
        modelControlsProps={{
          activeUseCases: preferences.useCases ?? DEFAULT_USE_CASE,
          activeSort: preferences.sort ?? DEFAULT_SORT,
          activeTopN: preferences.topN,
          excludeControlLabel: 'Exclude Models',
          reliabilityFilterEnabled: preferences.maxErrorRate !== undefined,
          activeMaxErrorRate: preferences.maxErrorRate,
          activeTimeRange: preferences.timeRange ?? DEFAULT_TIME_RANGE,
          activeMyReports: preferences.myReports ?? DEFAULT_MY_REPORTS,
          showReliabilityControls: true,
          onToggleUseCase: toggleUseCase,
          onSortChange: (sort) => {
            updatePref('sort', sort);
            setPreviewPage(1);
          },
          onTopNChange: (topN) => {
            updatePref('topN', topN);
            setPreviewPage(1);
          },
          onReliabilityFilterEnabledChange: handleReliabilityFilterEnabledChange,
          onMaxErrorRateChange: (rate) => {
            updatePref('maxErrorRate', rate);
            setPreviewPage(1);
          },
          onTimeRangeChange: (range) => {
            updatePref('timeRange', range as TimeRange);
            setPreviewPage(1);
          },
          onMyReportsChange: (val) => {
            updatePref('myReports', val);
            setPreviewPage(1);
          },
          excludeModels: (modelsData?.models ?? []).map((model) => ({
            id: model.id,
            name: model.name,
          })),
          excludedModelIds: preferences.excludeModelIds ?? [],
          onExcludedModelIdsChange: (ids) => {
            updatePref('excludeModelIds', ids);
            setPreviewPage(1);
          },
          onReset: handleResetPrefs,
          size: 'lg',
        }}
        modelListProps={{
          models: previewModels,
          loading: isLoadingModels,
          currentPage: previewPage,
          onPageChange: setPreviewPage,
          itemsPerPage: 5,
          lastUpdated: modelsData?.lastUpdated || null,
          headerLabel: 'Preview',
          excludedModelIds: preferences.excludeModelIds ?? [],
          excludeActionMode: 'exclude',
          onToggleExcludeModel: toggleExcludedModel,
        }}
        helper={
          <>
            Tune filters and preview the output list. For full parameter details, see{' '}
            <a href="/docs/parameter-configuration" className="text-primary hover:underline">
              docs
            </a>
            .
          </>
        }
        bottomRow={
          <div className="flex items-center justify-between gap-3">
            <Select
              value={configuringKey?.id ?? ''}
              onValueChange={(value) => {
                const key = apiKeys.find((item) => item.id === value);
                if (key) {
                  void handleConfigureKey(key);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-56 md:w-auto h-9 md:h-12!" size="default">
                <SelectValue placeholder="Select API key" />
              </SelectTrigger>
              <SelectContent>
                {apiKeys.map((key) => (
                  <SelectItem key={key.id} value={key.id}>
                    {key.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {configuringKey && (
              <div className="flex items-center gap-3">
                {prefsMessage && (
                  <span
                    className={`text-sm ${prefsMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {prefsMessage.text}
                  </span>
                )}
                {prefLoadError && (
                  <>
                    <span className="text-sm text-red-600">{prefLoadError}</span>
                    <Button
                      variant="outline"
                      onClick={() => configuringKey && void handleConfigureKey(configuringKey)}
                      disabled={isLoadingPreferences}
                    >
                      Retry Load
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => savePreferencesMutation.mutate()}
                  disabled={savePreferencesMutation.isPending || isLoadingPreferences}
                >
                  {savePreferencesMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
