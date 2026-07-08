import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { modelDetailPath } from '@/lib/model-urls';
import type { AvailabilityData } from '@/hooks/useAvailability';

interface AvailabilityMatrixProps {
  models: AvailabilityData[];
  dates: string[];
  loading?: boolean;
  error?: string | null;
  showStatusFilter?: boolean;
  showModelCount?: boolean;
}

type AvailabilityStatusFilter = 'all_models' | 'currently_free' | 'no_longer_free';

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.getUTCDate().toString();
}

function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMonthHeader(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function getAvailableDaysCount(model: AvailabilityData, dates: string[]): number {
  return dates.filter((date) => model.availability[date] === true).length;
}

function getShortModelName(name: string): string {
  // Remove provider prefix (e.g., "meta-llama/" or "google/") and ":free" suffix
  return name.replace(/^[^/]+\//, '').replace(/:free$/, '');
}

export function AvailabilityMatrix({
  models,
  dates,
  loading,
  error,
  showStatusFilter = true,
  showModelCount = true,
}: AvailabilityMatrixProps) {
  // Show last 30 days by default, with pagination options
  const [visibleDays, setVisibleDays] = useState(30);
  const [statusFilter, setStatusFilter] = useState<AvailabilityStatusFilter>('all_models');
  const matrixRootRef = useRef<HTMLDivElement | null>(null);

  const visibleDates = useMemo(() => {
    return dates.slice(-visibleDays);
  }, [dates, visibleDays]);

  const displayModels = useMemo(() => {
    const latestSnapshotDate = models.reduce<string | null>((latest, model) => {
      const modelDates = Object.keys(model.availability);
      if (modelDates.length === 0) return latest;
      const modelLatest = modelDates.sort().slice(-1)[0];
      if (!latest || modelLatest > latest) return modelLatest;
      return latest;
    }, null);
    const latestVisibleDate = visibleDates[visibleDates.length - 1];

    const filtered = models.filter((model) => {
      const isCurrentlyAvailable = latestSnapshotDate
        ? model.availability[latestSnapshotDate] === true
        : model.isActive !== false;
      if (statusFilter === 'currently_free') return isCurrentlyAvailable;
      if (statusFilter === 'no_longer_free') return !isCurrentlyAvailable;
      return true;
    });

    const latestAvailableIndex = (model: AvailabilityData) => {
      for (let i = visibleDates.length - 1; i >= 0; i--) {
        if (model.availability[visibleDates[i]] === true) {
          return i;
        }
      }
      return -1;
    };

    return [...filtered].sort((a, b) => {
      const aLatest = latestAvailableIndex(a);
      const bLatest = latestAvailableIndex(b);
      if (aLatest !== bLatest) return bLatest - aLatest;

      const aAvailableOnLatest = latestVisibleDate
        ? a.availability[latestVisibleDate] === true
        : false;
      const bAvailableOnLatest = latestVisibleDate
        ? b.availability[latestVisibleDate] === true
        : false;
      if (aAvailableOnLatest !== bAvailableOnLatest) return aAvailableOnLatest ? -1 : 1;

      const aDays = getAvailableDaysCount(a, visibleDates);
      const bDays = getAvailableDaysCount(b, visibleDates);
      if (aDays !== bDays) return bDays - aDays;

      return a.modelName.localeCompare(b.modelName);
    });
  }, [models, statusFilter, visibleDates]);

  // Group dates by month for header
  const monthHeaders = useMemo(() => {
    const headers: { month: string; startIndex: number; span: number }[] = [];
    let currentMonth = '';
    let currentStart = 0;

    visibleDates.forEach((date, index) => {
      const month = formatMonthHeader(date);
      if (month !== currentMonth) {
        if (currentMonth) {
          headers.push({
            month: currentMonth,
            startIndex: currentStart,
            span: index - currentStart,
          });
        }
        currentMonth = month;
        currentStart = index;
      }
    });

    // Add last month
    if (currentMonth) {
      headers.push({
        month: currentMonth,
        startIndex: currentStart,
        span: visibleDates.length - currentStart,
      });
    }

    return headers;
  }, [visibleDates]);

  useEffect(() => {
    const scroller = matrixRootRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="table-container"]'
    );
    if (!scroller) return;

    const scrollToRight = () => {
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
    };

    // Run after layout settles (fonts/table widths/hydration).
    let raf1 = 0;
    let raf2 = 0;
    const timeoutId = window.setTimeout(scrollToRight, 120);

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(scrollToRight);
    });

    const observer = new ResizeObserver(() => {
      scrollToRight();
    });
    observer.observe(scroller);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [visibleDates.length, displayModels.length]);

  if (loading && models.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Loading availability data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-destructive">
        Error: {error}
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        No availability data yet. Data will appear after the first model sync from OpenRouter.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {(showModelCount || showStatusFilter) && (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {showModelCount
              ? `${displayModels.length} model${displayModels.length === 1 ? '' : 's'} shown`
              : ''}
          </span>
          {showStatusFilter && (
            <ButtonGroup>
              <Button
                variant={statusFilter === 'all_models' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all_models')}
              >
                All Free Models
              </Button>
              <Button
                variant={statusFilter === 'currently_free' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('currently_free')}
              >
                Currently free
              </Button>
              <Button
                variant={statusFilter === 'no_longer_free' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('no_longer_free')}
              >
                No longer free
              </Button>
            </ButtonGroup>
          )}
        </div>
      )}
      <div ref={matrixRootRef}>
        <Table>
          <TableHeader>
            {/* Month header row */}
            <TableRow className="border-b-0">
              <TableHead className="sticky left-0 z-20 bg-card" />
              <TableHead className="bg-card" />
              {monthHeaders.map((header, idx) => (
                <TableHead
                  key={`${header.month}-${idx}`}
                  colSpan={header.span}
                  className="text-center text-xs font-normal text-muted-foreground bg-card border-b-0"
                >
                  {header.month}
                </TableHead>
              ))}
            </TableRow>
            {/* Day header row */}
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-card min-w-[180px]">Model</TableHead>
              <TableHead className="text-right min-w-[60px] bg-card">Days</TableHead>
              {visibleDates.map((date) => (
                <TableHead key={date} className="text-center px-0.5 min-w-[20px] bg-card">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-muted-foreground cursor-help">
                        {formatDateShort(date)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{formatDateFull(date)}</TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayModels.map((model) => {
              const daysAvailable = getAvailableDaysCount(model, visibleDates);

              return (
                <TableRow key={model.modelId}>
                  <TableCell className="sticky left-0 z-10 bg-card font-medium">
                    <a
                      href={modelDetailPath(model.modelId)}
                      className="block rounded-sm hover:text-primary transition-colors"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate block max-w-[180px] cursor-pointer text-sm underline-offset-2 hover:underline">
                            {getShortModelName(model.modelName)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{model.modelName}</p>
                          <p className="text-xs opacity-80">{model.modelId}</p>
                        </TooltipContent>
                      </Tooltip>
                    </a>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {daysAvailable}
                  </TableCell>
                  {visibleDates.map((date) => {
                    const isAvailable = model.availability[date];

                    return (
                      <TableCell key={date} className="text-center px-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`w-3 h-3 rounded-sm mx-auto ${
                                isAvailable === undefined
                                  ? 'bg-muted'
                                  : isAvailable
                                    ? 'bg-emerald-500'
                                    : 'bg-red-500'
                              }`}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatDateFull(date)}</p>
                            <p className="font-medium">
                              {isAvailable === undefined
                                ? 'No data'
                                : isAvailable
                                  ? 'Available'
                                  : 'Unavailable'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {displayModels.length === 0 && (
        <div className="border-t p-6 text-center text-sm text-muted-foreground">
          No models match this filter.
        </div>
      )}

      {/* Pagination controls for date range */}
      {dates.length > 30 && (
        <div className="flex justify-center gap-2 p-4 border-t">
          <Button
            variant={visibleDays === 30 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisibleDays(30)}
          >
            30 days
          </Button>
          <Button
            variant={visibleDays === 60 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisibleDays(60)}
          >
            60 days
          </Button>
          <Button
            variant={visibleDays === 90 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisibleDays(90)}
          >
            90 days
          </Button>
        </div>
      )}
    </div>
  );
}
