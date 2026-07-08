import { useAvailability } from '@/hooks/useAvailability';
import { ModelCountHeader } from '@/components/ModelCountHeader';
import { AvailabilityMatrix } from '@/components/model-availability/AvailabilityMatrix';
import { ModelControls } from '@/components/ModelControls';

export function AvailabilityTabContent() {
  const {
    models,
    dates,
    loading,
    error,
    count,
    lastUpdated,
    activeUseCases,
    activeSort,
    toggleUseCase,
    setActiveSort,
    resetToDefaults,
  } = useAvailability();

  return (
    <div>
      <p className="mb-3 text-base text-muted-foreground sm:mb-4 sm:text-lg">
        Daily model availability tracked from OpenRouter sync. Green indicates the model was
        available as a free model on that day.
      </p>
      <p className="mb-8 text-sm text-muted-foreground sm:text-base">
        Data is recorded each time models are synced from OpenRouter. Models that are no longer free
        or have been removed will show as unavailable.
      </p>

      {/* Controls - reuse ModelControls with subset of options */}
      <ModelControls
        activeUseCases={activeUseCases}
        activeSort={activeSort}
        onToggleUseCase={toggleUseCase}
        onSortChange={setActiveSort}
        onReset={resetToDefaults}
        size="lg"
      />

      <ModelCountHeader
        count={count}
        lastUpdated={lastUpdated}
        label={`model${count === 1 ? '' : 's'} tracked`}
      />

      {/* Availability Matrix */}
      <div className="mt-6">
        <AvailabilityMatrix models={models} dates={dates} loading={loading} error={error} />
      </div>
    </div>
  );
}
