import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, RefreshCw } from 'lucide-react';

export function TruncatedWithTooltip({ text, className }: { text: string; className?: string }) {
  if (text === '-' || text.length < 30) {
    return <span className={className}>{text}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-help ${className || ''}`}>{text}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs wrap-break-word">{text}</TooltipContent>
    </Tooltip>
  );
}

export function SeeMoreButton({
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-4">
      <Button variant="outline" onClick={onLoadMore} disabled={isFetchingMore}>
        {isFetchingMore ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4 mr-2" />
            See More
          </>
        )}
      </Button>
    </div>
  );
}
