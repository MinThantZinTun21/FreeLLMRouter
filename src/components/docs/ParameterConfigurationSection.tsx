import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/components/QueryProvider';
import { ApiPreferencesConfigurator } from '@/components/ApiPreferencesConfigurator';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { useCachedSession, authClient } from '@/lib/auth-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModels, getModelControlsProps } from '@/hooks/useModels';
import { codeExamples } from '@/lib/code-examples';
import type { ApiKeyPreferences } from '@/lib/api-definitions';
import {
  DEFAULT_MY_REPORTS,
  DEFAULT_SORT,
  DEFAULT_TIME_RANGE,
  DEFAULT_USE_CASE,
} from '@/lib/api-definitions';
import { fetchJsonOrThrow, NO_STORE_REQUEST_INIT } from '@/lib/client-api';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

interface ApiKeyOption {
  id: string;
  name: string;
  enabled: boolean;
}

const NO_API_KEY_VALUE = '__no_api_key__';

async function fetchApiKeys(): Promise<ApiKeyOption[]> {
  const response = await authClient.apiKey.list();
  return ((response.data as ApiKeyOption[]) || []).filter((key) => key.enabled);
}

async function fetchPreferences(apiKeyId: string): Promise<ApiKeyPreferences> {
  const data = await fetchJsonOrThrow<{ preferences?: ApiKeyPreferences }>(
    `/api/auth/preferences?apiKeyId=${encodeURIComponent(apiKeyId)}`,
    {
      credentials: 'include',
      ...NO_STORE_REQUEST_INIT,
    },
    'Could not load saved preferences'
  );
  return data.preferences || {};
}

async function savePreferences(apiKeyId: string, preferences: ApiKeyPreferences): Promise<void> {
  await fetchJsonOrThrow<{ preferences?: ApiKeyPreferences }>(
    '/api/auth/preferences',
    {
      method: 'PUT',
      credentials: 'include',
      ...NO_STORE_REQUEST_INIT,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKeyId, preferences }),
    },
    'Failed to save preferences'
  );
}

export function ParameterConfigurationSection() {
  const { data: session } = useCachedSession();
  const modelsData = useModels();
  const {
    models,
    loading,
    error,
    lastUpdated,
    activeUseCases,
    activeSort,
    activeTopN,
    reliabilityFilterEnabled,
    activeMaxErrorRate,
    activeTimeRange,
    activeMyReports,
    setActiveUseCases,
    setActiveSort,
    setActiveTopN,
    setReliabilityFilterEnabled,
    setActiveMaxErrorRate,
    setActiveTimeRange,
    setActiveMyReports,
  } = modelsData;

  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>(NO_API_KEY_VALUE);
  const [localSnapshot, setLocalSnapshot] = useState<ApiKeyPreferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [prefLoadError, setPrefLoadError] = useState<string | null>(null);
  const [excludedModelIds, setExcludedModelIds] = useState<string[]>([]);
  const [previewPage, setPreviewPage] = useState(1);

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['parameterSectionApiKeys'],
    queryFn: fetchApiKeys,
    enabled: !!session?.user,
    ...STRICT_QUERY_OPTIONS,
  });

  useEffect(() => {
    if (!session?.user) return;
    if (
      selectedApiKeyId !== NO_API_KEY_VALUE &&
      !apiKeys.some((key) => key.id === selectedApiKeyId)
    ) {
      setSelectedApiKeyId(NO_API_KEY_VALUE);
      setSaveStatus('idle');
    }
  }, [session?.user, apiKeys, selectedApiKeyId]);

  const {
    data: selectedPreferences,
    error: selectedPreferencesError,
    refetch: refetchSelectedPreferences,
  } = useQuery({
    queryKey: ['parameterSectionApiKeyPreferences', selectedApiKeyId],
    queryFn: () => fetchPreferences(selectedApiKeyId),
    enabled: !!session?.user && selectedApiKeyId !== NO_API_KEY_VALUE,
    ...STRICT_QUERY_OPTIONS,
  });

  useEffect(() => {
    if (
      !session?.user ||
      selectedApiKeyId === NO_API_KEY_VALUE ||
      selectedPreferences === undefined
    ) {
      return;
    }

    setActiveUseCases(selectedPreferences.useCases ?? DEFAULT_USE_CASE);
    setActiveSort(selectedPreferences.sort ?? DEFAULT_SORT);
    setActiveTopN(selectedPreferences.topN);
    setReliabilityFilterEnabled(selectedPreferences.maxErrorRate !== undefined);
    setActiveMaxErrorRate(selectedPreferences.maxErrorRate);
    setActiveTimeRange(selectedPreferences.timeRange ?? DEFAULT_TIME_RANGE);
    setActiveMyReports(selectedPreferences.myReports ?? DEFAULT_MY_REPORTS);
    setExcludedModelIds(selectedPreferences.excludeModelIds ?? []);
    setPreviewPage(1);
    setPrefLoadError(null);
    setSaveStatus('idle');
  }, [
    session?.user,
    selectedApiKeyId,
    selectedPreferences,
    setActiveUseCases,
    setActiveSort,
    setActiveTopN,
    setReliabilityFilterEnabled,
    setActiveMaxErrorRate,
    setActiveTimeRange,
    setActiveMyReports,
  ]);

  useEffect(() => {
    if (selectedApiKeyId === NO_API_KEY_VALUE) {
      setPrefLoadError(null);
      return;
    }
    if (selectedPreferencesError) {
      setPrefLoadError(
        selectedPreferencesError instanceof Error
          ? selectedPreferencesError.message
          : 'Could not load saved preferences'
      );
    }
  }, [selectedApiKeyId, selectedPreferencesError]);

  const currentPreferences = useMemo<ApiKeyPreferences>(
    () => ({
      useCases: activeUseCases,
      sort: activeSort,
      topN: activeTopN,
      maxErrorRate: reliabilityFilterEnabled ? activeMaxErrorRate : undefined,
      timeRange: activeTimeRange as ApiKeyPreferences['timeRange'],
      myReports: activeMyReports,
      excludeModelIds: excludedModelIds,
    }),
    [
      activeUseCases,
      activeSort,
      activeTopN,
      reliabilityFilterEnabled,
      activeMaxErrorRate,
      activeTimeRange,
      activeMyReports,
      excludedModelIds,
    ]
  );

  const isDirty = useMemo(() => {
    if (
      !session?.user ||
      selectedApiKeyId === NO_API_KEY_VALUE ||
      selectedPreferences === undefined
    ) {
      return false;
    }
    const baseline: ApiKeyPreferences = {
      useCases: selectedPreferences.useCases ?? DEFAULT_USE_CASE,
      sort: selectedPreferences.sort ?? DEFAULT_SORT,
      topN: selectedPreferences.topN,
      maxErrorRate: selectedPreferences.maxErrorRate,
      timeRange: selectedPreferences.timeRange ?? DEFAULT_TIME_RANGE,
      myReports: selectedPreferences.myReports ?? DEFAULT_MY_REPORTS,
      excludeModelIds: selectedPreferences.excludeModelIds ?? [],
    };
    return JSON.stringify(currentPreferences) !== JSON.stringify(baseline);
  }, [session?.user, selectedApiKeyId, selectedPreferences, currentPreferences]);

  const savePrefsMutation = useMutation({
    mutationFn: ({ keyId, preferences }: { keyId: string; preferences: ApiKeyPreferences }) =>
      savePreferences(keyId, preferences),
    onSuccess: () => {
      setSaveStatus('saved');
      void refetchSelectedPreferences();
    },
    onError: () => {
      setSaveStatus('error');
    },
  });
  const { mutate: savePreferencesForKey, isPending: isSavingPreferences } = savePrefsMutation;

  const modelControlsProps = getModelControlsProps(modelsData);
  const previewModels = useMemo(() => {
    const excluded = new Set(excludedModelIds);
    const filtered = models.filter((model) => !excluded.has(model.id));
    return activeTopN ? filtered.slice(0, activeTopN) : filtered;
  }, [models, activeTopN, excludedModelIds]);

  const handleApiKeyChange = (value: string) => {
    if (value === NO_API_KEY_VALUE) {
      if (localSnapshot) {
        setActiveUseCases(localSnapshot.useCases ?? DEFAULT_USE_CASE);
        setActiveSort(localSnapshot.sort ?? DEFAULT_SORT);
        setActiveTopN(localSnapshot.topN);
        setReliabilityFilterEnabled(localSnapshot.maxErrorRate !== undefined);
        setActiveMaxErrorRate(localSnapshot.maxErrorRate);
        setActiveTimeRange(localSnapshot.timeRange ?? DEFAULT_TIME_RANGE);
        setActiveMyReports(localSnapshot.myReports ?? DEFAULT_MY_REPORTS);
        setExcludedModelIds(localSnapshot.excludeModelIds ?? []);
      }
      setSelectedApiKeyId(NO_API_KEY_VALUE);
      setPreviewPage(1);
      setSaveStatus('idle');
      return;
    }

    if (selectedApiKeyId === NO_API_KEY_VALUE) {
      setLocalSnapshot(currentPreferences);
    }
    setSelectedApiKeyId(value);
    setPrefLoadError(null);
    setSaveStatus('idle');
  };

  const toggleExcludedModel = (modelId: string) => {
    setExcludedModelIds((prev) =>
      prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]
    );
    setPreviewPage(1);
    setSaveStatus('idle');
  };

  const overrideCallSnippet = codeExamples.getModelIdsCall(
    activeUseCases,
    activeSort,
    activeTopN,
    reliabilityFilterEnabled ? activeMaxErrorRate : undefined,
    reliabilityFilterEnabled ? activeTimeRange : undefined,
    reliabilityFilterEnabled ? activeMyReports : undefined
  );

  return (
    <section id="parameter-configuration" className="mt-20 scroll-mt-20 space-y-6">
      <h2 className="mb-4 text-5xl font-bold">Parameter Configuration</h2>

      <section id="parameter-configuration-overview" className="space-y-3 scroll-mt-20">
        <h3 className="text-xl font-semibold sm:text-2xl">Overview</h3>
        <p className="text-muted-foreground">
          Configure model selection once in the app, then call <code>getModelIds()</code> without
          request parameters. Saved defaults are applied per API key automatically.
        </p>
        <p className="text-muted-foreground">
          Use <strong>Preview only</strong> to test filters locally without saving to a key.
        </p>
      </section>

      <section id="configure-params-live" className="space-y-3 scroll-mt-20">
        <h3 className="text-xl font-semibold sm:text-2xl">Configure Parameters</h3>
        <ApiPreferencesConfigurator
          modelControlsProps={{
            ...modelControlsProps,
            excludeControlLabel:
              selectedApiKeyId === NO_API_KEY_VALUE ? 'Hide Models' : 'Exclude Models',
            excludeModels: models.map((model) => ({ id: model.id, name: model.name })),
            excludedModelIds,
            onExcludedModelIdsChange: (ids) => {
              setExcludedModelIds(ids);
              setPreviewPage(1);
              setSaveStatus('idle');
            },
            onReset: () => {
              modelControlsProps.onReset?.();
              setExcludedModelIds([]);
              setPreviewPage(1);
              setSaveStatus('idle');
            },
          }}
          modelListProps={{
            models: previewModels,
            loading,
            error,
            currentPage: previewPage,
            onPageChange: setPreviewPage,
            itemsPerPage: 5,
            lastUpdated,
            excludedModelIds,
            excludeActionMode: selectedApiKeyId === NO_API_KEY_VALUE ? 'hide' : 'exclude',
            onToggleExcludeModel: toggleExcludedModel,
          }}
          bottomRow={
            <>
              {session?.user && apiKeys.length === 0 && (
                <div className="flex items-center justify-between gap-3">
                  <Button asChild size="lg">
                    <a href="/dashboard?tab=api">Create API Key</a>
                  </Button>
                </div>
              )}
              {session?.user && (
                <div className="flex items-center justify-between gap-3">
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
                  {selectedApiKeyId !== NO_API_KEY_VALUE && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-muted-foreground">
                        {prefLoadError
                          ? prefLoadError
                          : saveStatus === 'saved'
                            ? 'Preferences saved.'
                            : saveStatus === 'error'
                              ? 'Save failed. Try again.'
                              : isDirty
                                ? 'Unsaved changes.'
                                : ''}
                      </p>
                      {prefLoadError && (
                        <Button
                          size="lg"
                          variant="outline"
                          onClick={() => void refetchSelectedPreferences()}
                        >
                          Retry Load
                        </Button>
                      )}
                      <Button
                        size="lg"
                        onClick={() =>
                          savePreferencesForKey({
                            keyId: selectedApiKeyId,
                            preferences: currentPreferences,
                          })
                        }
                        disabled={isSavingPreferences || !isDirty}
                      >
                        {isSavingPreferences ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          }
          helper={
            <>
              Tune filters and preview the output list. For full parameter details, see{' '}
              <a href="#query-params" className="text-primary hover:underline">
                Query Parameters
              </a>
              .
            </>
          }
        />
      </section>

      <section id="key-defaults" className="space-y-3 scroll-mt-20">
        <h3 className="text-xl font-semibold sm:text-2xl">Key Defaults</h3>
        <p className="text-muted-foreground">
          Parameters are saved per API key. A call like <code>getModelIds()</code> uses the selected
          key&apos;s saved defaults.
        </p>
        <p className="text-muted-foreground">
          Model exclusions are also saved per key in app settings. They are applied automatically
          for that key and are not part of request-level override arguments.
        </p>
        <CodeBlock
          code={`const { ids, requestId } = await getModelIds()`}
          language="typescript"
          className="text-sm"
        />
      </section>

      <section id="request-overrides" className="space-y-3 scroll-mt-20">
        <h3 className="text-xl font-semibold sm:text-2xl">Request Overrides</h3>
        <p className="text-muted-foreground">
          Passing arguments to <code>getModelIds(...)</code> overrides those defaults for that
          request only.
        </p>
        <CodeBlock code={overrideCallSnippet} language="typescript" className="text-sm" />
      </section>
    </section>
  );
}

export function ParameterConfigurationSectionWithProvider() {
  return (
    <QueryProvider>
      <ParameterConfigurationSection />
    </QueryProvider>
  );
}
