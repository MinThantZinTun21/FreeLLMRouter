import { Button } from '@/components/ui/button';
import { SORT_OPTIONS, type SortType } from '@/hooks/useModels';
import { ChevronRight } from 'lucide-react';

interface SortSelectorProps {
  activeSort: SortType;
  onSortChange: (sort: SortType) => void;
  onConfirm?: () => void;
}

export function SortSelector({ activeSort, onSortChange, onConfirm }: SortSelectorProps) {
  return (
    <div className="flex flex-wrap justify-center items-center gap-2">
      {SORT_OPTIONS.map((option) => (
        <Button
          key={option.key}
          variant={activeSort === option.key ? 'secondary' : 'outline'}
          size="xl"
          onClick={() => onSortChange(option.key)}
        >
          {option.label}
        </Button>
      ))}
      {onConfirm && (
        <Button size="xl" onClick={onConfirm}>
          Get Code
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
