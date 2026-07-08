'use client';

import { useMemo, useState, useEffect } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartLegend, ChartTooltip } from '@/components/ui/chart';
import type { IssueData, TimelinePoint, TimeRange } from '@/hooks/useHealth';
import { cn } from '@/lib/utils';

interface IssuesChartProps {
  timeline: TimelinePoint[];
  issues: IssueData[];
  range: TimeRange;
  showErrorRateDetails?: boolean;
}

// Chart color palette (cycles through these for each model)
const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function formatDateLabel(dateString: string, range: TimeRange): string {
  const date = new Date(dateString);
  if (range === '15m' || range === '1h') {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  if (range === '6h' || range === '24h') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getShortModelName(modelId: string): string {
  // Extract just the model name from "provider/model:variant" format
  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1];
  return modelPart.replace(/:free$/, '');
}

function InteractiveLegendContent({
  payload,
  visibleSeries,
  onToggle,
  issues,
}: {
  payload?: any[];
  visibleSeries: Set<string>;
  onToggle: (dataKey: string) => void;
  issues: IssueData[];
}) {
  if (!payload?.length) {
    return null;
  }

  // Create a map of modelId to issue summary for quick lookup
  const issuesMap = new Map(issues.map((issue) => [issue.modelId, issue]));

  return (
    <div className="flex items-center justify-center gap-x-4 gap-y-2 pt-3 max-h-40 overflow-x-auto px-2">
      {payload
        .filter((item) => item.type !== 'none')
        .map((item) => {
          const isVisible = visibleSeries.has(item.dataKey);
          const shortName = getShortModelName(item.dataKey);
          const issueSummary = issuesMap.get(item.dataKey);

          return (
            <button
              key={item.dataKey ?? item.value}
              onClick={() => onToggle(item.dataKey)}
              className={cn(
                'min-w-[100px] flex items-center gap-1.5 rounded px-1.5 py-0.5 text-sm transition-opacity cursor-pointer',
                isVisible ? 'opacity-100' : 'opacity-40 hover:opacity-60'
              )}
              title={isVisible ? 'Click to hide' : 'Click to show'}
            >
              <div
                className={cn(
                  'h-2 w-2 shrink-0 rounded-[2px] transition-opacity',
                  !isVisible && 'opacity-50'
                )}
                style={{
                  backgroundColor: item.color,
                }}
              />
              <span className={`${!isVisible ? 'text-muted-foreground' : ''} flex flex-col`}>
                {shortName}
                {issueSummary && issueSummary.errorRate > 0 && (
                  <span className="text-xs opacity-70 ml-1">
                    ({issueSummary.errorRate.toFixed(1)}%)
                  </span>
                )}
              </span>
            </button>
          );
        })}
    </div>
  );
}

function SortedTooltipContent({
  active,
  payload,
  label,
  chartConfig,
  showErrorRateDetails,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  chartConfig: ChartConfig;
  showErrorRateDetails: boolean;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  // Sort by value descending (highest error rate first)
  const sortedPayload = payload
    .filter((item) => {
      const name = String(item.name ?? '');
      const meta = item.payload?.[`${name}_meta`] as
        | { errorRate: number; errorCount: number; totalCount: number }
        | undefined;
      if (showErrorRateDetails) {
        return (meta?.totalCount ?? 0) > 0;
      }
      return typeof item.value === 'number' && !Number.isNaN(item.value);
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  if (sortedPayload.length === 0) {
    return null;
  }

  return (
    <div className="border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{label}</div>
      <div className="grid gap-1.5">
        {sortedPayload.map((item) => {
          const name = String(item.name ?? '');
          const meta = item.payload?.[`${name}_meta`] as
            | { errorRate: number; errorCount: number; totalCount: number }
            | undefined;
          const errorCount = meta?.errorCount ?? 0;
          const totalCount = meta?.totalCount ?? 0;

          return (
            <div key={name} className="flex w-full items-center gap-2">
              <div
                className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                style={{ backgroundColor: item.color }}
              />
              <span className="flex-1 text-muted-foreground">
                {chartConfig[name]?.label || name}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {showErrorRateDetails && totalCount > 0
                  ? `${Number(item.value ?? 0).toFixed(1)}% (${errorCount}/${totalCount})`
                  : `${Number(item.value ?? 0).toFixed(1)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function IssuesChart({
  timeline,
  issues,
  range,
  showErrorRateDetails = false,
}: IssuesChartProps) {
  // Get unique model IDs from issues (sorted by total issues)
  const modelIds = useMemo(() => {
    return issues.map((issue) => issue.modelId);
  }, [issues]);

  // State to track which series are currently visible
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(new Set());

  // Initialize visible series when modelIds change
  useEffect(() => {
    setVisibleSeries(new Set(modelIds));
  }, [modelIds]);

  // Handle legend click - toggle series visibility
  const handleLegendClick = (dataKey: string) => {
    setVisibleSeries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dataKey)) {
        // Only allow hiding if there's more than one visible series
        if (newSet.size > 1) {
          newSet.delete(dataKey);
        }
      } else {
        newSet.add(dataKey);
      }
      return newSet;
    });
  };

  // Build chart config dynamically based on models present
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    modelIds.forEach((modelId, index) => {
      config[modelId] = {
        label: getShortModelName(modelId),
        color: CHART_COLORS[index % CHART_COLORS.length],
      };
    });
    return config;
  }, [modelIds]);

  // Legend payload stays constant so clicking an item doesn't remove it
  const legendPayload = useMemo(
    () =>
      modelIds.map((modelId, index) => ({
        dataKey: modelId,
        value: chartConfig[modelId]?.label ?? getShortModelName(modelId),
        color: CHART_COLORS[index % CHART_COLORS.length],
        type: 'square' as const,
      })),
    [chartConfig, modelIds]
  );

  // Format timeline data for recharts.
  // Keep missing/no-report points at 0 so the chart line stays visible.
  const chartData = useMemo(() => {
    return timeline.map((point) => {
      const filledPoint: Record<
        string,
        number | string | { errorRate: number; errorCount: number; totalCount: number }
      > = {
        date: point.date,
        dateLabel: formatDateLabel(point.date, range),
      };
      // Fill in data for each model - use errorRate for chart, keep full data for tooltip
      modelIds.forEach((modelId) => {
        const data = point[modelId];
        if (typeof data === 'number') {
          filledPoint[modelId] = data;
          filledPoint[`${modelId}_meta`] = { errorRate: data, errorCount: 0, totalCount: 0 };
          return;
        }
        if (data && typeof data === 'object' && 'errorRate' in data) {
          const typedData = data as { errorRate: number; errorCount: number; totalCount: number };
          filledPoint[modelId] = typedData.errorRate;
          filledPoint[`${modelId}_meta`] = typedData;
          return;
        }
        filledPoint[modelId] = 0;
        filledPoint[`${modelId}_meta`] = { errorRate: 0, errorCount: 0, totalCount: 0 };
      });
      return filledPoint;
    });
  }, [timeline, range, modelIds]);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full sm:h-100">
      <AreaChart data={chartData}>
        <defs>
          {modelIds.map((modelId, index) => (
            <linearGradient key={modelId} id={`fill-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={CHART_COLORS[index % CHART_COLORS.length]}
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor={CHART_COLORS[index % CHART_COLORS.length]}
                stopOpacity={0.1}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
          tickFormatter={(value) => `${value}%`}
        />
        <ChartTooltip
          cursor={false}
          content={(props) => (
            <SortedTooltipContent
              active={props.active}
              payload={props.payload as any[]}
              label={props.label as string}
              chartConfig={chartConfig}
              showErrorRateDetails={showErrorRateDetails}
            />
          )}
        />
        {modelIds.map((modelId, index) =>
          visibleSeries.has(modelId) ? (
            <Area
              key={modelId}
              dataKey={(data) => (data as Record<string, unknown>)[modelId]}
              name={modelId}
              type="monotone"
              fill={`url(#fill-${index})`}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ) : null
        )}
        <ChartLegend
          payload={legendPayload}
          content={
            <InteractiveLegendContent
              visibleSeries={visibleSeries}
              onToggle={handleLegendClick}
              issues={issues}
            />
          }
        />
      </AreaChart>
    </ChartContainer>
  );
}
