'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryProvider } from '@/components/QueryProvider';
import { IssuesChart } from '@/components/model-health/HealthChart';
import { ButtonGroup } from '@/components/ui/button-group';
import { Button } from '@/components/ui/button';
import type { IssueData, TimelinePoint, TimeRange } from '@/hooks/useHealth';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

interface HealthResponse {
  issues: IssueData[];
  timeline: TimelinePoint[];
  range: TimeRange;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

async function fetchModelHealth(modelId: string, range: TimeRange): Promise<HealthResponse> {
  const params = new URLSearchParams({ range });
  const response = await fetch(`/api/health?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch health data');
  const data: HealthResponse = await response.json();

  // Filter to just this model
  const normalizedId = modelId.replace(/:free$/, '');
  return {
    ...data,
    issues: data.issues.filter((i) => i.modelId === modelId || i.modelId === normalizedId),
    timeline: data.timeline.map((point) => {
      const filtered: Record<string, string | number | object> = { date: point.date };
      for (const [key, value] of Object.entries(point)) {
        if (key === 'date') continue;
        const normalizedKey = key.replace(/:free$/, '').replace(/_meta$/, '');
        if (normalizedKey === normalizedId || key === modelId || key === `${modelId}_meta`) {
          filtered[key] = value;
        }
      }
      return filtered as TimelinePoint;
    }),
  };
}

function ModelDetailChartInner({ modelId }: { modelId: string }) {
  const [range, setRange] = useState<TimeRange>('7d');

  const { data, isLoading } = useQuery({
    queryKey: ['model-health', modelId, range],
    queryFn: () => fetchModelHealth(modelId, range),
    ...STRICT_QUERY_OPTIONS,
  });

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <ButtonGroup>
          {TIME_RANGES.map((tr) => (
            <Button
              key={tr.value}
              variant={range === tr.value ? 'default' : 'outline'}
              size="sm"
              className="text-xs px-2.5"
              onClick={() => setRange(tr.value)}
            >
              {tr.label}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      {isLoading ? (
        <div className="h-48 rounded-xl border bg-card flex items-center justify-center text-sm text-muted-foreground">
          Loading chart...
        </div>
      ) : data && data.timeline.length > 0 ? (
        <IssuesChart timeline={data.timeline} issues={data.issues} range={range} />
      ) : (
        <div className="h-48 rounded-xl border bg-card flex items-center justify-center text-sm text-muted-foreground">
          No data available for this time range
        </div>
      )}
    </div>
  );
}

export function ModelDetailChart({ modelId }: { modelId: string }) {
  return (
    <QueryProvider>
      <ModelDetailChartInner modelId={modelId} />
    </QueryProvider>
  );
}
