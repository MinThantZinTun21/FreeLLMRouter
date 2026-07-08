import { Button } from '@/components/ui/button';
import { USE_CASES, type UseCaseType } from '@/hooks/useModels';
import { ChevronRight } from 'lucide-react';

interface UseCaseSelectorProps {
  activeFilters: UseCaseType[];
  onToggleFilter: (useCase: UseCaseType | 'all') => void;
  onConfirm?: () => void;
}

export function UseCaseSelector({
  activeFilters,
  onToggleFilter,
  onConfirm,
}: UseCaseSelectorProps) {
  return (
    <div className="space-y-6">
      {/* Use Case Buttons + Continue */}
      <div className="flex flex-wrap justify-center items-center gap-2">
        {USE_CASES.map((useCase) => {
          const isActive =
            useCase.key === 'all'
              ? activeFilters.length === 0
              : activeFilters.includes(useCase.key as UseCaseType);
          return (
            <Button
              key={useCase.key}
              variant={isActive ? 'secondary' : 'outline'}
              size="xl"
              onClick={() => onToggleFilter(useCase.key)}
            >
              {useCase.label}
            </Button>
          );
        })}
        {onConfirm && (
          <Button size="xl" onClick={onConfirm} variant="default">
            Continue
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
