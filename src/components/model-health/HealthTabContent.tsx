import { useMemo, useCallback, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHealth, type TimeRange } from '@/hooks/useHealth';
import { ModelList } from '@/components/ModelList';
import { IssuesChart } from '@/components/model-health/HealthChart';
import { ModelControls } from '@/components/ModelControls';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authClient, useCachedSession } from '@/lib/auth-client';
import type { ApiKeyPreferences } from '@/lib/api-definitions';
import { filterModelsByUseCase, sortModels } from '@/lib/model-types';
import {
  DEFAULT_MY_REPORTS,
  DEFAULT_SORT,
  DEFAULT_TIME_RANGE,
  DEFAULT_TOP_N,
  DEFAULT_USE_CASE,
} from '@/lib/api-definitions';
import type { Model } from '@/hooks/useModels';

interface ApiKeyOption {
  id: string;
  name: string;
  enabled: boolean;
}

const NO_API_KEY_VALUE = '__no_api_key__';

interface FeedbackEntry {
  rateLimited?: number;
  unavailable?: number;
  error?: number;
  successCount?: number;
  errorRate: number;
}

async function fetchApiKeys(): Promise<ApiKeyOption[]> {
  const response = await authClient.apiKey.list();
  return ((response.data as ApiKeyOption[]) || []).filter((key) => key.enabled);
}

async function fetchPreferences(apiKeyId: string): Promise<ApiKeyPreferences> {
  const response = await fetch(`/api/auth/preferences?apiKeyId=${apiKeyId}`, {
    credentials: 'include',
  });
  if (!response.ok) return {};
  const data = await response.json();
  return data.preferences || {};
}

export function HealthTabContent() {
  const { data: session } = useCachedSession();
  const {
    issues,
    timeline,
    loading,
    error,
    range,
    setRange,
    count,
    lastUpdated,
    myReports,
    setMyReports,
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
  } = useHealth();
  const [currentPage, setCurrentPage] = useState(1);
  const [excludedModelIds, setExcludedModelIds] = useState<string[]>([]);
  const [modelListView, setModelListView] = useState<'reported' | 'all'>('reported');
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>(NO_API_KEY_VALUE);
  const [localSnapshot, setLocalSnapshot] = useState<ApiKeyPreferences | null>(null);
  const isUsingApiKey = !!session?.user && selectedApiKeyId !== NO_API_KEY_VALUE;

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['healthApiKeys'],
    queryFn: fetchApiKeys,
    enabled: !!session?.user,
  });

  useEffect(() => {
    if (!session?.user) return;
    if (
      selectedApiKeyId !== NO_API_KEY_VALUE &&
      !apiKeys.some((key) => key.id === selectedApiKeyId)
    ) {
      setSelectedApiKeyId(NO_API_KEY_VALUE);
    }
  }, [session?.user, apiKeys, selectedApiKeyId]);

  const { data: selectedPreferences } = useQuery({
    queryKey: ['healthApiKeyPreferences', selectedApiKeyId],
    queryFn: () => fetchPreferences(selectedApiKeyId),
    enabled: isUsingApiKey,
  });

  useEffect(() => {
    if (!isUsingApiKey || selectedPreferences === undefined) return;

    setActiveUseCases(selectedPreferences.useCases ?? DEFAULT_USE_CASE);
    setActiveSort(selectedPreferences.sort ?? DEFAULT_SORT);
    setActiveTopN(selectedPreferences.topN ?? DEFAULT_TOP_N);
    setReliabilityFilterEnabled(selectedPreferences.maxErrorRate !== undefined);
    setActiveMaxErrorRate(selectedPreferences.maxErrorRate);
    setRange((selectedPreferences.timeRange ?? DEFAULT_TIME_RANGE) as TimeRange);
    setMyReports(selectedPreferences.myReports ?? DEFAULT_MY_REPORTS);
    setExcludedModelIds(selectedPreferences.excludeModelIds ?? []);
    setCurrentPage(1);
  }, [
    isUsingApiKey,
    selectedPreferences,
    setActiveUseCases,
    setActiveSort,
    setActiveTopN,
    setReliabilityFilterEnabled,
    setActiveMaxErrorRate,
    setRange,
    setMyReports,
  ]);

  const handleApiKeyChange = (value: string) => {
    if (value === NO_API_KEY_VALUE) {
      if (localSnapshot) {
        setActiveUseCases(localSnapshot.useCases ?? DEFAULT_USE_CASE);
        setActiveSort(localSnapshot.sort ?? DEFAULT_SORT);
        setActiveTopN(localSnapshot.topN ?? DEFAULT_TOP_N);
        setReliabilityFilterEnabled(localSnapshot.maxErrorRate !== undefined);
        setActiveMaxErrorRate(localSnapshot.maxErrorRate);
        setRange((localSnapshot.timeRange ?? DEFAULT_TIME_RANGE) as TimeRange);
        setMyReports(localSnapshot.myReports ?? DEFAULT_MY_REPORTS);
        setExcludedModelIds(localSnapshot.excludeModelIds ?? []);
      }
      setSelectedApiKeyId(NO_API_KEY_VALUE);
      return;
    }

    if (selectedApiKeyId === NO_API_KEY_VALUE) {
      setLocalSnapshot({
        useCases: activeUseCases,
        sort: activeSort,
        topN: activeTopN,
        maxErrorRate: reliabilityFilterEnabled ? activeMaxErrorRate : undefined,
        timeRange: range as ApiKeyPreferences['timeRange'],
        myReports,
        excludeModelIds: excludedModelIds,
      });
    }
    setSelectedApiKeyId(value);
  };

  // Fetch all models for the "All" view (lazy - only when selected)
  const { data: allModelsData, isLoading: allModelsLoading } = useQuery({
    queryKey: ['healthAllModels', range],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('timeRange', range);
      const response = await fetch(`/api/v1/models/full?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data: {
        models: Omit<Model, 'issueCount'>[];
        feedbackCounts: Record<string, FeedbackEntry>;
      } = await response.json();
      return data.models.map((model) => {
        const feedback = data.feedbackCounts[model.id];
        const nextModel: Model = {
          ...model,
          errorRate: feedback ? feedback.errorRate : undefined,
        };
        if (
          feedback &&
          typeof feedback.error === 'number' &&
          typeof feedback.rateLimited === 'number' &&
          typeof feedback.unavailable === 'number' &&
          typeof feedback.successCount === 'number'
        ) {
          nextModel.issueCount = feedback.error + feedback.rateLimited + feedback.unavailable;
          nextModel.successCount = feedback.successCount;
          nextModel.rateLimited = feedback.rateLimited;
          nextModel.unavailable = feedback.unavailable;
          nextModel.errorCount = feedback.error;
        }
        return nextModel;
      });
    },
    enabled: modelListView === 'all',
    staleTime: 5 * 60 * 1000,
  });

  // Wrapper to cast string to TimeRange for ModelControls compatibility
  const handleTimeRangeChange = useCallback(
    (value: string) => {
      setRange(value as TimeRange);
    },
    [setRange]
  );

  // Convert IssueData to Model format for ModelList
  const models: Model[] = useMemo(() => {
    return issues.map((issue) => {
      const model: Model = {
        id: issue.modelId,
        name: issue.modelName,
        contextLength: issue.contextLength,
        maxCompletionTokens: issue.maxCompletionTokens,
        description: null,
        modality: issue.modality,
        inputModalities: issue.inputModalities,
        outputModalities: issue.outputModalities,
        supportedParameters: issue.supportedParameters,
        isModerated: null,
        errorRate: issue.errorRate,
      };
      if (
        typeof issue.total === 'number' &&
        typeof issue.successCount === 'number' &&
        typeof issue.rateLimited === 'number' &&
        typeof issue.unavailable === 'number' &&
        typeof issue.error === 'number'
      ) {
        model.issueCount = issue.total;
        model.successCount = issue.successCount;
        model.rateLimited = issue.rateLimited;
        model.unavailable = issue.unavailable;
        model.errorCount = issue.error;
      }
      return model;
    });
  }, [issues]);

  // All models filtered/sorted client-side for the "All" view
  const allModelsFiltered: Model[] = useMemo(() => {
    if (!allModelsData) return [];
    const filtered = filterModelsByUseCase(allModelsData, activeUseCases);
    const sorted = sortModels(filtered, activeSort);
    if (activeTopN !== undefined && activeTopN > 0) {
      return sorted.slice(0, activeTopN);
    }
    return sorted;
  }, [allModelsData, activeUseCases, activeSort, activeTopN]);

  const activeModels = modelListView === 'reported' ? models : allModelsFiltered;

  const visibleModels = useMemo(() => {
    const excluded = new Set(excludedModelIds);
    return activeModels.filter((model) => !excluded.has(model.id));
  }, [activeModels, excludedModelIds]);

  const visibleIssues = useMemo(() => {
    const excluded = new Set(excludedModelIds);
    return issues.filter((issue) => !excluded.has(issue.modelId));
  }, [issues, excludedModelIds]);

  return (
    <div>
      <p className="mb-3 text-base text-muted-foreground sm:mb-4 sm:text-lg">
        {myReports ? 'Your personal' : 'Community-reported'} model health data based on both
        successful requests and reported issues.
      </p>
      <p className="mb-8 text-sm text-muted-foreground sm:text-base">
        Error rates show the percentage of failed requests relative to total reports. Lower
        percentages indicate healthier models. Help improve this data by reporting both successes
        and issues via the API.
      </p>

      {session?.user && (
        <div className="mb-4 flex items-center gap-3">
          <Select value={selectedApiKeyId} onValueChange={handleApiKeyChange}>
            <SelectTrigger className="w-full sm:w-56 md:w-auto h-9 md:h-12!" size="default">
              <SelectValue placeholder="Select API key" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_API_KEY_VALUE}>Preview only</SelectItem>
              {apiKeys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {key.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Controls */}
      <ModelControls
        activeUseCases={activeUseCases}
        activeSort={activeSort}
        activeTopN={activeTopN}
        activeTimeRange={range}
        activeMyReports={myReports}
        simpleHealthControls
        showReliabilityControls={false}
        onToggleUseCase={toggleUseCase}
        onSortChange={setActiveSort}
        onTopNChange={setActiveTopN}
        onTimeRangeChange={handleTimeRangeChange}
        onMyReportsChange={setMyReports}
        excludeControlLabel="Hide Models"
        excludeModels={activeModels.map((model) => ({ id: model.id, name: model.name }))}
        excludedModelIds={excludedModelIds}
        onExcludedModelIdsChange={(ids) => {
          setExcludedModelIds(ids);
          setCurrentPage(1);
        }}
        onReset={() => {
          resetToDefaults();
          setExcludedModelIds([]);
          setCurrentPage(1);
        }}
        size="lg"
      />

      {/* Chart */}
      <div className="mt-6 mb-3 flex items-center gap-2">
        <span className="font-medium">Error Rate Over Time</span>
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          &#8595; Lower is better
        </span>
      </div>
      <div className="mb-8">
        <IssuesChart
          timeline={timeline}
          issues={visibleIssues}
          range={range}
          showErrorRateDetails={false}
        />
      </div>

      {/* Issues list */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-medium">Models by Error Rate</span>
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          &#8595; Lower is better
        </span>
        <div className="ml-auto">
          <ButtonGroup>
            <Button
              variant={modelListView === 'reported' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setModelListView('reported');
                setCurrentPage(1);
              }}
            >
              Reported Usage
            </Button>
            <Button
              variant={modelListView === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setModelListView('all');
                setCurrentPage(1);
              }}
            >
              All
            </Button>
          </ButtonGroup>
        </div>
      </div>
      <ModelList
        models={visibleModels}
        loading={modelListView === 'reported' ? loading : allModelsLoading}
        error={error}
        showErrorRateDetails={false}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        lastUpdated={lastUpdated}
        headerCount={visibleModels.length}
        headerLabel={
          modelListView === 'reported'
            ? `model${visibleModels.length === 1 ? '' : 's'} shown (${count} total with reported usage)`
            : `model${visibleModels.length === 1 ? '' : 's'} shown (${allModelsData?.length ?? 0} total active)`
        }
        excludedModelIds={excludedModelIds}
        excludeActionMode="hide"
        onToggleExcludeModel={(modelId) => {
          setExcludedModelIds((prev) =>
            prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
          );
        }}
      />
    </div>
  );
}
