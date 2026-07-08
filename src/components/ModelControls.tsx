import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import type { UseCaseType, SortType } from '@/lib/api-definitions';
import {
  USE_CASE_DEFINITIONS,
  SORT_DEFINITIONS,
  VALID_TIME_RANGES_WITH_LABELS,
  TIME_RANGE_DEFINITIONS,
  DEFAULT_TIME_RANGE,
  DEFAULT_MY_REPORTS,
  TOOLTIP_USE_CASE,
  TOOLTIP_SORT,
  TOOLTIP_TOP_N,
  TOOLTIP_RELIABILITY_FILTER,
} from '@/lib/api-definitions';
import { ChevronDown, RotateCcw } from 'lucide-react';

interface ModelControlsProps {
  activeUseCases: UseCaseType[];
  activeSort: SortType;
  activeTopN?: number;
  reliabilityFilterEnabled?: boolean;
  activeMaxErrorRate?: number;
  activeTimeRange?: string;
  activeMyReports?: boolean;
  /** When true, render only time range + my reports controls (used on health page). */
  simpleHealthControls?: boolean;
  showReliabilityControls?: boolean;
  onToggleUseCase: (useCase: UseCaseType | 'all') => void;
  onSortChange: (sort: SortType) => void;
  onTopNChange?: (topN: number | undefined) => void;
  onReliabilityFilterEnabledChange?: (enabled: boolean) => void;
  onMaxErrorRateChange?: (value: number | undefined) => void;
  onTimeRangeChange?: (value: string) => void;
  onMyReportsChange?: (value: boolean) => void;
  excludeControlLabel?: string;
  excludeModels?: Array<{ id: string; name?: string | null }>;
  excludedModelIds?: string[];
  onExcludedModelIdsChange?: (ids: string[]) => void;
  onReset?: () => void;
  size?: 'sm' | 'lg';
  disabled?: boolean;
  surface?: boolean;
}

export function ModelControls({
  activeUseCases,
  activeSort,
  activeTopN,
  reliabilityFilterEnabled = false,
  activeMaxErrorRate,
  activeTimeRange = DEFAULT_TIME_RANGE,
  activeMyReports = DEFAULT_MY_REPORTS,
  simpleHealthControls = false,
  showReliabilityControls = true,
  onToggleUseCase,
  onSortChange,
  onTopNChange,
  onReliabilityFilterEnabledChange,
  onMaxErrorRateChange,
  onTimeRangeChange,
  onMyReportsChange,
  excludeControlLabel = 'Exclude Models',
  excludeModels = [],
  excludedModelIds = [],
  onExcludedModelIdsChange,
  onReset,
  size = 'lg',
  disabled = false,
  surface = true,
}: ModelControlsProps) {
  const isSmall = size === 'sm';

  // Local state for topN input to allow free typing
  const [topNInput, setTopNInput] = useState(activeTopN?.toString() ?? '');
  useEffect(() => {
    setTopNInput(activeTopN?.toString() ?? '');
  }, [activeTopN]);

  // Local state for maxErrorRate input
  const [errorRateInput, setErrorRateInput] = useState(activeMaxErrorRate?.toString() ?? '');
  useEffect(() => {
    setErrorRateInput(activeMaxErrorRate?.toString() ?? '');
  }, [activeMaxErrorRate]);

  const useCaseLabel =
    activeUseCases.length === 0
      ? 'All'
      : activeUseCases.length === 1
        ? USE_CASE_DEFINITIONS.find((uc) => uc.key === activeUseCases[0])?.label ||
          activeUseCases[0]
        : `${activeUseCases.length} selected`;

  const sortLabel = SORT_DEFINITIONS.find((s) => s.key === activeSort)?.label || activeSort;

  const labelClass = isSmall ? 'text-xs leading-4' : 'text-xs md:text-sm font-medium leading-5';
  const gapClass = isSmall ? 'gap-1' : 'gap-2';
  const buttonClass = isSmall ? 'h-5! md:h-8! min-w-[16px]' : 'h-8! md:h-10! min-w-[20px]';
  const chevronClass = isSmall ? 'h-3 w-3' : 'h-4 w-4';
  // Keep selected IDs in the item set so the combobox doesn't drop values during async model loads.
  const excludeIds = Array.from(
    new Set([...excludeModels.map((model) => model.id), ...excludedModelIds])
  );
  const excludeLabelById = new Map(
    excludeModels.map((model) => [model.id, model.name || model.id])
  );

  // Check if reliability filter controls should be shown
  const showReliabilitySubControls =
    reliabilityFilterEnabled && onMaxErrorRateChange && onTimeRangeChange && onMyReportsChange;

  return (
    <div
      aria-disabled={disabled}
      className={`flex items-start ${surface ? 'bg-card/50 rounded-lg' : ''} ${isSmall ? 'gap-x-4 gap-y-2 p-3 ' : 'gap-x-6 gap-y-3 p-3 md:p-4 my-3 md:my-4 '} ${disabled ? 'pointer-events-none opacity-70 select-none' : ''}`}
    >
      <div
        className={`flex flex-wrap ${isSmall ? 'gap-x-4 gap-y-2' : 'gap-x-6 gap-y-3'} ${onReset ? 'flex-1' : ''}`}
      >
        {/* Use Case dropdown */}
        <div className={`flex flex-col ${gapClass}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-muted-foreground ${labelClass} cursor-help`}>Use Case</span>
            </TooltipTrigger>
            <TooltipContent>{TOOLTIP_USE_CASE}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size={size} className={`${buttonClass} gap-2`}>
                {useCaseLabel}
                <ChevronDown className={`${chevronClass} opacity-50`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuCheckboxItem
                checked={activeUseCases.length === 0}
                onCheckedChange={() => onToggleUseCase('all')}
              >
                All
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {USE_CASE_DEFINITIONS.filter((uc) => uc.key !== 'all').map((useCase) => (
                <DropdownMenuCheckboxItem
                  key={useCase.key}
                  checked={activeUseCases.includes(useCase.key as UseCaseType)}
                  onCheckedChange={() => onToggleUseCase(useCase.key as UseCaseType)}
                >
                  {useCase.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Sort dropdown */}
        <div className={`flex flex-col ${gapClass}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-muted-foreground ${labelClass} cursor-help`}>Sort</span>
            </TooltipTrigger>
            <TooltipContent>{TOOLTIP_SORT}</TooltipContent>
          </Tooltip>
          <Select value={activeSort} onValueChange={(value) => onSortChange(value as SortType)}>
            <SelectTrigger className={`w-auto ${buttonClass}`}>
              <SelectValue>{sortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_DEFINITIONS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Top N control */}
        {onTopNChange && (
          <div className={`flex flex-col ${gapClass}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`text-muted-foreground ${labelClass} cursor-help`}>Top N</span>
              </TooltipTrigger>
              <TooltipContent>{TOOLTIP_TOP_N}</TooltipContent>
            </Tooltip>
            <ButtonGroup>
              <Button
                variant={activeTopN !== undefined ? 'default' : 'outline'}
                size={size}
                className={buttonClass}
                onClick={() => onTopNChange(activeTopN === undefined ? 5 : undefined)}
              >
                {activeTopN !== undefined ? 'On' : 'Off'}
              </Button>
              {activeTopN !== undefined && (
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={topNInput}
                  onChange={(e) => setTopNInput(e.target.value)}
                  onBlur={() => {
                    const value = parseInt(topNInput, 10);
                    if (!isNaN(value) && value >= 1) {
                      onTopNChange(Math.min(100, value));
                    } else {
                      setTopNInput(activeTopN?.toString() ?? '');
                    }
                  }}
                  className={`w-16 ${buttonClass}`}
                />
              )}
            </ButtonGroup>
          </div>
        )}

        {/* Health controls */}
        {simpleHealthControls ? (
          <div className={`flex flex-col ${gapClass}`}>
            <span className={`text-muted-foreground ${labelClass}`}>Health</span>
            <ButtonGroup>
              <Select value={activeTimeRange} onValueChange={onTimeRangeChange}>
                <SelectTrigger className={`w-24 ${buttonClass}`}>
                  <SelectValue>{activeTimeRange}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_DEFINITIONS.filter((tr) =>
                    VALID_TIME_RANGES_WITH_LABELS.includes(tr.value)
                  ).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {onMyReportsChange && (
                <Button
                  variant={activeMyReports ? 'default' : 'outline'}
                  size={size}
                  className={buttonClass}
                  onClick={() => onMyReportsChange(!activeMyReports)}
                >
                  {activeMyReports ? 'My Reports' : 'Community'}
                </Button>
              )}
            </ButtonGroup>
          </div>
        ) : (
          showReliabilityControls &&
          onReliabilityFilterEnabledChange && (
            <div className={`flex flex-col ${gapClass}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`text-muted-foreground ${labelClass} cursor-help`}>
                    Health Filter{' '}
                    {`${reliabilityFilterEnabled && activeMaxErrorRate ? `(error less than ${activeMaxErrorRate}% within the past ${activeTimeRange})` : ''}`}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{TOOLTIP_RELIABILITY_FILTER}</TooltipContent>
              </Tooltip>
              <ButtonGroup>
                <Button
                  variant={reliabilityFilterEnabled ? 'default' : 'outline'}
                  size={size}
                  className={buttonClass}
                  onClick={() => onReliabilityFilterEnabledChange(!reliabilityFilterEnabled)}
                >
                  {reliabilityFilterEnabled ? 'On' : 'Off'}
                </Button>
                {showReliabilitySubControls && (
                  <>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={errorRateInput}
                      onChange={(e) => setErrorRateInput(e.target.value)}
                      onBlur={() => {
                        const value = parseInt(errorRateInput, 10);
                        if (!isNaN(value) && value >= 0 && value <= 100) {
                          onMaxErrorRateChange(value);
                        } else {
                          setErrorRateInput(activeMaxErrorRate?.toString() ?? '');
                        }
                      }}
                      className={`pr-0! w-14 ${buttonClass} border-r-0!`}
                    />
                    <ButtonGroupText
                      className={`pr-3 pl-0 bg-background shadow-xs border-l-0! dark:bg-input/30 dark:border-input ${buttonClass}`}
                    >
                      %
                    </ButtonGroupText>
                    <Select value={activeTimeRange} onValueChange={onTimeRangeChange}>
                      <SelectTrigger className={`w-20 ${buttonClass}`}>
                        <SelectValue>{activeTimeRange}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_RANGE_DEFINITIONS.filter((tr) =>
                          VALID_TIME_RANGES_WITH_LABELS.includes(tr.value)
                        ).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant={activeMyReports ? 'default' : 'outline'}
                      size={size}
                      className={buttonClass}
                      onClick={() => onMyReportsChange(!activeMyReports)}
                    >
                      {activeMyReports ? 'My Reports Only' : 'All Community Reports'}
                    </Button>
                  </>
                )}
              </ButtonGroup>
            </div>
          )
        )}

        {/* Exclude Models control */}
        {onExcludedModelIdsChange && (
          <div className={`flex flex-col ${gapClass} min-w-[200px]`}>
            <span className={`text-muted-foreground ${labelClass}`}>
              {excludeControlLabel}{' '}
              {excludedModelIds.length > 0 ? `(${excludedModelIds.length})` : ''}
            </span>
            <Combobox
              multiple
              items={excludeIds}
              value={excludedModelIds}
              onValueChange={(value) => onExcludedModelIdsChange?.((value as string[]) || [])}
            >
              <ComboboxChips className={`${buttonClass} min-w-[160px] sm:min-w-[220px]`}>
                {excludedModelIds.length > 1 ? (
                  <ComboboxChip showRemove={false}>{excludedModelIds.length} models</ComboboxChip>
                ) : (
                  excludedModelIds.map((id) => (
                    <ComboboxChip key={id}>{excludeLabelById.get(id) || id}</ComboboxChip>
                  ))
                )}
                <ComboboxChipsInput placeholder="Type model" />
              </ComboboxChips>
              <ComboboxContent>
                <ComboboxEmpty>No models found.</ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(id: string) => (
                      <ComboboxItem key={id} value={id}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {excludeLabelById.get(id) || id}
                          </span>
                          <span className="block truncate text-muted-foreground text-xs">{id}</span>
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        )}
      </div>

      {/* Reset button */}
      {onReset && (
        <div className={`flex flex-col ${gapClass}`}>
          <span className={`text-muted-foreground ${labelClass} invisible`}>Reset</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={size}
                className={`${buttonClass} gap-2`}
                onClick={onReset}
              >
                {/* <RotateCcw className={chevronClass} /> */}
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to defaults</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
