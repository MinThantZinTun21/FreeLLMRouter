import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ModelCountHeader } from '@/components/ModelCountHeader';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Model } from '@/hooks/useModels';
import { ChevronLeft, ChevronRight, CircleMinus } from 'lucide-react';
import { modelDetailPath } from '@/lib/model-urls';

interface ModelListProps {
  models: Model[];
  loading?: boolean;
  error?: string | null;
  currentPage: number;
  onPageChange?: (page: number) => void;
  itemsPerPage?: number;
  showHeader?: boolean;
  headerLabel?: string;
  headerCount?: number;
  lastUpdated?: string | null;
  excludedModelIds?: string[];
  onToggleExcludeModel?: (modelId: string) => void;
  excludeActionMode?: 'hide' | 'exclude';
  showErrorRateDetails?: boolean;
}

const DEFAULT_ITEMS_PER_PAGE = 10;

function formatTokens(count: number | null): string {
  if (!count) return '-';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return count.toString();
}

function getProvider(modelId: string): string {
  return modelId.split('/')[0] || modelId;
}

function getProviderLogoUrl(provider: string): string {
  return `https://models.dev/logos/${provider}.svg`;
}

function getCapabilityBadges(model: Model): string[] {
  const badges: string[] = [];

  if (model.inputModalities?.includes('image')) badges.push('Vision');
  if (model.supportedParameters?.includes('tools')) badges.push('Tools');
  if (
    model.supportedParameters?.includes('reasoning') ||
    model.supportedParameters?.includes('include_reasoning')
  ) {
    badges.push('Reasoning');
  }
  if ((model.contextLength ?? 0) >= 100000) badges.push('Long Context');
  return badges;
}

function isNewModel(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const date = new Date(createdAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return date > sevenDaysAgo;
}

function ProviderLogo({ provider }: { provider: string }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <img
            src={getProviderLogoUrl(provider)}
            alt={provider}
            className="h-5 w-5 object-contain opacity-70 dark:invert dark:opacity-80"
            onError={() => setHasError(true)}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p className="capitalize">{provider}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ModelList({
  models,
  loading,
  error,
  currentPage,
  onPageChange,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  showHeader = true,
  headerLabel,
  headerCount,
  lastUpdated,
  excludedModelIds = [],
  onToggleExcludeModel,
  excludeActionMode = 'exclude',
  showErrorRateDetails = false,
}: ModelListProps) {
  const [pendingExclude, setPendingExclude] = useState<{ id: string; name: string } | null>(null);
  const totalPages = Math.max(1, Math.ceil(models.length / itemsPerPage));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const paginatedModels = models.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  const displayCount = headerCount ?? models.length;
  const canPaginate = Boolean(onPageChange) && totalPages > 1;
  const dialogActionVerb = excludeActionMode === 'hide' ? 'hide' : 'exclude';
  const dialogActionLabel = excludeActionMode === 'hide' ? 'Hide' : 'Exclude';

  let content: ReactNode;
  if (loading && models.length === 0) {
    content = <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  } else if (error) {
    content = <div className="py-8 text-center text-destructive">Error: {error}</div>;
  } else {
    content = (
      <div className="rounded-xl border bg-card divide-y overflow-hidden">
        {paginatedModels.map((model) => {
          const badges = getCapabilityBadges(model);
          const provider = getProvider(model.id);
          const isNew = isNewModel(model.createdAt);
          const isExcluded = excludedModelIds.includes(model.id);

          return (
            <a
              key={model.id}
              href={modelDetailPath(model.id)}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              {/* Provider Logo */}
              <div className="shrink-0">
                <ProviderLogo provider={provider} />
              </div>

              {/* Model Name & Badges */}
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {model.name}
                </span>
                {isNew && (
                  <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-medium hover:bg-blue-500/15">
                    New
                  </Badge>
                )}
                {badges.length > 0 && (
                  <div className="hidden sm:flex gap-1">
                    {badges.map((badge) => (
                      <Badge key={badge} variant="secondary" className="text-[10px] font-medium">
                        {badge}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {/* Context / Output tokens - only show if at least one value exists */}
                {(model.contextLength || model.maxCompletionTokens) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono hidden sm:inline">
                          {formatTokens(model.contextLength)} /{' '}
                          {formatTokens(model.maxCompletionTokens)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Context: {formatTokens(model.contextLength)} · Output:{' '}
                          {formatTokens(model.maxCompletionTokens)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Error rate badge */}
                {model.errorRate !== undefined && model.errorRate > 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant={
                            model.errorRate > 20
                              ? 'destructive'
                              : model.errorRate > 10
                                ? 'secondary'
                                : 'outline'
                          }
                          className="text-[10px] font-medium"
                        >
                          {model.errorRate.toFixed(1)}%
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">
                          {showErrorRateDetails
                            ? `${model.errorRate.toFixed(1)}% (${model.issueCount}/${
                                (model.issueCount ?? 0) + (model.successCount ?? 0)
                              })`
                            : `Error rate: ${model.errorRate.toFixed(1)}%`}
                        </p>
                        {showErrorRateDetails && (model.rateLimited ?? 0) > 0 && (
                          <p className="text-muted-foreground">Rate limited: {model.rateLimited}</p>
                        )}
                        {showErrorRateDetails && (model.unavailable ?? 0) > 0 && (
                          <p className="text-muted-foreground">Unavailable: {model.unavailable}</p>
                        )}
                        {showErrorRateDetails && (model.errorCount ?? 0) > 0 && (
                          <p className="text-muted-foreground">Errors: {model.errorCount}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}

                {onToggleExcludeModel && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isExcluded ? 'secondary' : 'ghost'}
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isExcluded) {
                              onToggleExcludeModel(model.id);
                              return;
                            }
                            setPendingExclude({ id: model.id, name: model.name || model.id });
                          }}
                          title={isExcluded ? 'Remove exclusion' : 'Exclude model'}
                        >
                          <CircleMinus
                            className={`h-3.5 w-3.5 ${isExcluded ? 'text-primary' : 'text-muted-foreground'}`}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isExcluded ? 'Remove exclusion' : 'Exclude model'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <ModelCountHeader count={displayCount} lastUpdated={lastUpdated} label={headerLabel} />
          {canPaginate && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange?.(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-1">
                {safePage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onPageChange?.(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      {content}
      <AlertDialog
        open={!!pendingExclude}
        onOpenChange={(open) => !open && setPendingExclude(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogActionLabel} this model?</AlertDialogTitle>
            <AlertDialogDescription>
              This will {dialogActionVerb} <strong>{pendingExclude?.name}</strong> from the current
              list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingExclude) {
                  onToggleExcludeModel?.(pendingExclude.id);
                }
                setPendingExclude(null);
              }}
            >
              {dialogActionLabel} Model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
