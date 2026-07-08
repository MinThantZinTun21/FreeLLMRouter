import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/ui/code-block';
import { useModels, generateSnippet, getModelControlsProps } from '@/hooks/useModels';
import { codeExamples } from '@/lib/code-examples/index';
import { useCachedSession, authClient } from '@/lib/auth-client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import {
  type ApiKeyPreferences,
  DEFAULT_USE_CASE,
  DEFAULT_SORT,
  DEFAULT_TIME_RANGE,
  DEFAULT_MY_REPORTS,
} from '@/lib/api-definitions';

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
  const response = await fetch(`/api/auth/preferences?apiKeyId=${apiKeyId}`, {
    credentials: 'include',
  });
  if (!response.ok) return {};
  const data = await response.json();
  return data.preferences || {};
}

interface ApiUsageStepProps {
  variant?: 'full' | 'compact';
}

export function ApiUsageStep({ variant = 'full' }: ApiUsageStepProps) {
  const isCompact = variant === 'compact';
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
    apiUrl,
    setActiveUseCases,
    setActiveSort,
    setActiveTopN,
    setReliabilityFilterEnabled,
    setActiveMaxErrorRate,
    setActiveTimeRange,
    setActiveMyReports,
  } = modelsData;
  const modelControlsProps = getModelControlsProps(modelsData);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>(NO_API_KEY_VALUE);
  const [localSnapshot, setLocalSnapshot] = useState<ApiKeyPreferences | null>(null);
  const snippet = generateSnippet(apiUrl);
  const [useItMode, setUseItMode] = useState<'default' | 'override'>('default');

  const { data: apiKeys = [] } = useQuery({
    queryKey: ['stepApiKeys'],
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
    queryKey: ['stepApiKeyPreferences', selectedApiKeyId],
    queryFn: () => fetchPreferences(selectedApiKeyId),
    enabled: !!session?.user && selectedApiKeyId !== NO_API_KEY_VALUE,
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

  const currentPreferences = useMemo<ApiKeyPreferences>(
    () => ({
      useCases: activeUseCases,
      sort: activeSort,
      topN: activeTopN,
      maxErrorRate: reliabilityFilterEnabled ? activeMaxErrorRate : undefined,
      timeRange: activeTimeRange as ApiKeyPreferences['timeRange'],
      myReports: activeMyReports,
      excludeModelIds: [],
    }),
    [
      activeUseCases,
      activeSort,
      activeTopN,
      reliabilityFilterEnabled,
      activeMaxErrorRate,
      activeTimeRange,
      activeMyReports,
    ]
  );

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
      }
      setSelectedApiKeyId(NO_API_KEY_VALUE);
      return;
    }

    if (selectedApiKeyId === NO_API_KEY_VALUE) {
      setLocalSnapshot(currentPreferences);
    }
    setSelectedApiKeyId(value);
  };

  const defaultBasicSnippet = codeExamples.basicUsageDefault();
  const overrideBasicSnippet = codeExamples.basicUsage(
    activeUseCases,
    activeSort,
    activeTopN,
    reliabilityFilterEnabled ? activeMaxErrorRate : undefined,
    reliabilityFilterEnabled ? activeTimeRange : undefined,
    reliabilityFilterEnabled ? activeMyReports : undefined
  );

  return (
    <div className="w-full space-y-12">
      {isCompact && (
        <p className="text-sm text-muted-foreground">
          Need full setup and configuration?{' '}
          <a href="/docs" className="text-primary hover:underline">
            See the docs
          </a>
          .
        </p>
      )}

      {!isCompact && (
        <>
          {/* Step 1: Set Up OpenRouter */}
          <div id="setup-openrouter" className="space-y-3 md:space-y-4 scroll-mt-20">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                1
              </span>
              <h3 className="text-xl font-semibold sm:text-2xl">Set Up OpenRouter</h3>
            </div>
            <p className="text-muted-foreground">
              <a
                href="https://openrouter.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenRouter
              </a>{' '}
              provides a unified API for accessing many LLM providers. Sign up for free and{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                create a dedicated API key
              </a>{' '}
              specifically for free model usage.
            </p>
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Protect yourself from accidental charges.</strong> Create a{' '}
                <strong>separate API key</strong> just for free models and set a{' '}
                <a
                  href="https://openrouter.ai/settings/limits"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  credit limit
                </a>{' '}
                (e.g. $1) on your account. If a non-free model is accidentally used, you could be
                charged. We are not responsible for any charges incurred on OpenRouter.
              </AlertDescription>
            </Alert>
          </div>

          {/* Step 2: Get Your API Key */}
          <div id="get-api-key" className="space-y-3 md:space-y-4 scroll-mt-20">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                2
              </span>
              <h3 className="text-xl font-semibold sm:text-2xl">Get Your API Key</h3>
            </div>
            <p className="text-muted-foreground">
              <a
                href="/login"
                className="text-primary font-medium hover:underline hover:opacity-90"
              >
                Sign in with GitHub
              </a>{' '}
              to create your API key. All keys share a per-user limit of 200 requests per 24 hours
              (with SDK caching, this is plenty).
            </p>
          </div>
        </>
      )}

      {/* Step 3: Copy free-llm-router.ts */}
      <div id="copy-file" className="space-y-3 md:space-y-4 scroll-mt-20">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
            {isCompact ? 1 : 3}
          </span>
          <h3 className="text-xl font-semibold sm:text-2xl">
            Copy{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-lg sm:text-xl">
              free-llm-router.ts
            </code>
          </h3>
        </div>
        <p className="text-muted-foreground">
          This helper fetches free model IDs from our API, reports both successes and issues back,
          and handles caching automatically.
        </p>
        <CodeBlock code={snippet} copyLabel="Copy" className="[&>div:first-child]:max-h-[26vh]" />
      </div>

      {/* Step 5: Use It */}
      <div id="use-it" className="space-y-3 md:space-y-4 scroll-mt-20">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
            {isCompact ? 2 : 4}
          </span>
          <h3 className="text-xl font-semibold sm:text-2xl">Use It</h3>
        </div>
        <p className="text-muted-foreground">
          Use saved key defaults, or override for a single request.
        </p>
        {!isCompact && (
          <div className="flex items-center justify-between gap-3">
            <Tabs
              value={useItMode}
              onValueChange={(value) => setUseItMode(value as 'default' | 'override')}
            >
              <TabsList className="h-8">
                <TabsTrigger value="default" className="text-xs">
                  Default
                </TabsTrigger>
                <TabsTrigger value="override" className="text-xs">
                  Override
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {useItMode === 'override' && session?.user && apiKeys.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">API key</span>
                <Select value={selectedApiKeyId} onValueChange={setSelectedApiKeyId}>
                  <SelectTrigger className="w-full sm:w-56 h-9" size="default">
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
              </div>
            )}
          </div>
        )}
        <CodeBlock
          code={isCompact || useItMode === 'default' ? defaultBasicSnippet : overrideBasicSnippet}
          language="typescript"
          className="text-sm"
        />
        {!isCompact && (
          <p className="text-sm text-muted-foreground">
            More patterns are available in{' '}
            <a href="#code-examples" className="text-primary hover:underline">
              Code Examples
            </a>{' '}
            .
          </p>
        )}
      </div>

      <div id="further-configure-params" className="space-y-3 md:space-y-4 scroll-mt-20">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
            {isCompact ? 3 : 5}
          </span>
          <h3 className="text-xl font-semibold sm:text-2xl">Further Configure Parameters</h3>
        </div>
        <p className="text-muted-foreground">
          Need to tune use case, sorting, limits, reliability filters, and exclusions? Open{' '}
          <a
            href={isCompact ? '/docs/parameter-configuration' : '#parameter-configuration'}
            className="text-primary hover:underline"
          >
            Parameter Configuration
          </a>
          .
        </p>
      </div>
    </div>
  );
}
