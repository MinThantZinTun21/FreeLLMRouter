import { ModelControls } from '@/components/ModelControls';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_MY_REPORTS } from '@/lib/api-definitions';
import {
  toSort,
  toTimeRange,
  toUseCases,
  type ParsedResponseData,
} from '@/components/auth/history/history-utils';

const noop = () => {};

export function RequestDetailsPanel({ responseData }: { responseData: ParsedResponseData | null }) {
  const params = responseData?.params;
  const modelIds = responseData?.ids ?? [];
  const modelCount = responseData?.count ?? modelIds.length;
  const visibleModelIds = modelIds.slice(0, 10);
  const remainingModels = Math.max(0, modelIds.length - visibleModelIds.length);

  const hasParams =
    !!params &&
    (params.useCases?.length ||
      params.sort ||
      params.topN !== undefined ||
      params.maxErrorRate !== undefined ||
      params.timeRange ||
      params.myReports !== undefined);

  return (
    <div className="space-y-3">
      <div>
        {hasParams ? (
          <ModelControls
            size="sm"
            disabled
            surface={false}
            activeUseCases={toUseCases(params)}
            activeSort={toSort(params)}
            activeTopN={params.topN}
            reliabilityFilterEnabled={params.maxErrorRate !== undefined}
            activeMaxErrorRate={params.maxErrorRate}
            activeTimeRange={toTimeRange(params)}
            activeMyReports={params.myReports ?? DEFAULT_MY_REPORTS}
            onToggleUseCase={noop}
            onSortChange={noop}
            onTopNChange={noop}
            onReliabilityFilterEnabledChange={noop}
            onMaxErrorRateChange={noop}
            onTimeRangeChange={noop}
            onMyReportsChange={noop}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No parameters available</p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold">Returned models</span>
          <Badge variant="outline">{modelCount}</Badge>
        </div>

        {!responseData ? (
          <p className="text-sm text-muted-foreground">No model list available</p>
        ) : modelIds.length === 0 && modelCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Model list not captured for this request. ({modelCount} returned)
          </p>
        ) : modelIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No models returned</p>
        ) : (
          <div className="space-y-2">
            <ul className="space-y-1">
              {visibleModelIds.map((modelId) => (
                <li key={modelId}>
                  <code className="text-xs">{modelId}</code>
                </li>
              ))}
            </ul>
            {remainingModels > 0 && (
              <p className="text-xs text-muted-foreground">+{remainingModels} more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
