import { useState } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModelControls } from '@/components/ModelControls';
import type { UseCaseType, SortType } from '@/lib/api-definitions';
import { Loader2 } from 'lucide-react';
import {
  DEFAULT_SORT,
  DEFAULT_USE_CASE,
  DEFAULT_TOP_N,
  DEFAULT_MAX_ERROR_RATE,
  DEFAULT_TIME_RANGE,
  DEFAULT_MY_REPORTS,
  DEFAULT_RELIABILITY_FILTER_ENABLED,
} from '@/lib/api-definitions';
import { siteConfig } from '@/lib/seo';

interface TryItPanelProps {
  endpoint: string;
  method: 'GET' | 'POST';
  defaultBody?: object;
  exampleResponse: string;
}

export function TryItPanel({ endpoint, method, defaultBody, exampleResponse }: TryItPanelProps) {
  const [activeUseCases, setActiveUseCases] = useState<UseCaseType[]>(DEFAULT_USE_CASE);
  const [activeSort, setActiveSort] = useState<SortType>(DEFAULT_SORT);
  const [activeTopN, setActiveTopN] = useState<number | undefined>(DEFAULT_TOP_N);
  const [reliabilityFilterEnabled, setReliabilityFilterEnabled] = useState(
    DEFAULT_RELIABILITY_FILTER_ENABLED
  );
  const [activeMaxErrorRate, setActiveMaxErrorRate] = useState<number | undefined>(
    DEFAULT_MAX_ERROR_RATE
  );
  const [activeTimeRange, setActiveTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [activeMyReports, setActiveMyReports] = useState(DEFAULT_MY_REPORTS);
  const [apiKey, setApiKey] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const canSend = apiKey.trim().length > 0;

  const toggleUseCase = (useCase: UseCaseType | 'all') => {
    if (useCase === 'all') {
      setActiveUseCases([]);
    } else {
      setActiveUseCases((prev) =>
        prev.includes(useCase) ? prev.filter((uc) => uc !== useCase) : [...prev, useCase]
      );
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

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (activeUseCases.length > 0) params.set('useCase', activeUseCases.join(','));
    params.set('sort', activeSort);
    if (activeTopN) params.set('topN', String(activeTopN));
    if (reliabilityFilterEnabled) {
      if (activeMaxErrorRate !== undefined) params.set('maxErrorRate', String(activeMaxErrorRate));
      if (activeTimeRange !== '24h') params.set('timeRange', activeTimeRange);
      if (activeMyReports) params.set('myReports', 'true');
    }
    return `${endpoint}?${params.toString()}`;
  };

  const buildCurlCommand = () => {
    const token = apiKey.trim() || 'YOUR_API_KEY';
    const authHeader = `-H "Authorization: Bearer ${token}" \\`;
    if (method === 'POST') {
      const body = defaultBody ? JSON.stringify(defaultBody, null, 2) : '{}';
      return `curl -X POST ${siteConfig.url}${endpoint} \\
  ${authHeader}
  -H "Content-Type: application/json" \\
  -d '${body.replace(/\n/g, '\n  ')}'`;
    }
    return `curl ${siteConfig.url}${buildUrl()} \\
  ${authHeader}`;
  };

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    setStatusCode(null);

    try {
      const url = method === 'GET' ? buildUrl() : endpoint;
      const body = defaultBody ? JSON.stringify(defaultBody) : undefined;
      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method === 'POST' ? body : undefined,
      };

      const res = await fetch(url, options);
      setStatusCode(res.status);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setResponse(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Request failed' }, null, 2)
      );
      setStatusCode(500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Request Block */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
          <h4 className="text-sm font-medium">Request</h4>
          <Button size="sm" onClick={handleSend} disabled={loading || !canSend}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </div>

        <div className="px-4 py-3 border-b">
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">API Key</span>
            <Input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="fma_..."
              type="text"
              className="h-8 text-sm"
              autoComplete="off"
            />
          </div>
          {!canSend && (
            <p className="mt-2 text-xs text-muted-foreground">Required to send requests.</p>
          )}
        </div>

        {/* Use Case/Sort selectors (for GET) */}
        {method === 'GET' && (
          <div className="px-4 py-3 border-b">
            <ModelControls
              activeUseCases={activeUseCases}
              activeSort={activeSort}
              activeTopN={activeTopN}
              reliabilityFilterEnabled={reliabilityFilterEnabled}
              activeMaxErrorRate={activeMaxErrorRate}
              activeTimeRange={activeTimeRange}
              activeMyReports={activeMyReports}
              onToggleUseCase={toggleUseCase}
              onSortChange={setActiveSort}
              onTopNChange={setActiveTopN}
              onReliabilityFilterEnabledChange={setReliabilityFilterEnabled}
              onMaxErrorRateChange={setActiveMaxErrorRate}
              onTimeRangeChange={(value) => setActiveTimeRange(value as any)}
              onMyReportsChange={setActiveMyReports}
              onReset={resetToDefaults}
              size="sm"
            />
          </div>
        )}

        <CodeBlock
          code={buildCurlCommand()}
          language="bash"
          showCopy={false}
          className="rounded-none border-none"
        />
      </div>

      {/* Response Block */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
          <h4 className="text-sm font-medium">Response</h4>
          {statusCode !== null && (
            <span
              className={`text-xs font-medium ${
                statusCode >= 200 && statusCode < 300
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {statusCode}
            </span>
          )}
        </div>
        <CodeBlock
          code={response || exampleResponse}
          language="json"
          showCopy={!!response}
          className="rounded-none border-none"
        />
      </div>
    </div>
  );
}
