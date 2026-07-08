import { useState, type ReactElement } from 'react';
import { useHistory, type UnifiedHistoryItem, type LinkedFeedbackItem } from '@/hooks/useHistory';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { ExpandableRequestRows } from '@/components/auth/history/ExpandableRequestRows';
import { TruncatedWithTooltip, SeeMoreButton } from '@/components/auth/history/HistoryShared';
import { formatTimeAgo } from '@/components/auth/history/history-utils';

function FeedbackRow({ item }: { item: UnifiedHistoryItem }) {
  return (
    <TableRow>
      <TableCell>
        <code className="text-sm truncate max-w-50">{item.modelId}</code>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">-</span>
      </TableCell>
      <TableCell>
        {item.isSuccess ? (
          <Badge variant="default">Success</Badge>
        ) : (
          <Badge variant="destructive">{item.issue || 'Error'}</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatTimeAgo(item.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-50 truncate">
        <TruncatedWithTooltip text={item.details || '-'} />
      </TableCell>
    </TableRow>
  );
}

function ChildFeedbackRow({ feedback, isUsed }: { feedback: LinkedFeedbackItem; isUsed: boolean }) {
  return (
    <TableRow className={isUsed ? 'bg-green-500/5' : 'bg-muted/20'}>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">↳</span>
          <code className="text-sm truncate max-w-50">{feedback.modelId}</code>
          {isUsed && <span className="text-xs text-green-600 font-medium">used</span>}
        </div>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">-</span>
      </TableCell>
      <TableCell>
        {feedback.isSuccess ? (
          <Badge variant="default">Success</Badge>
        ) : (
          <Badge variant="destructive">{feedback.issue || 'Error'}</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {feedback.createdAt ? formatTimeAgo(feedback.createdAt) : '-'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-50 truncate">
        <TruncatedWithTooltip text={feedback.details || '-'} />
      </TableCell>
    </TableRow>
  );
}

function UnifiedHistoryRows({
  items,
  expandedRows,
  onToggleRow,
}: {
  items: UnifiedHistoryItem[];
  expandedRows: Record<string, boolean>;
  onToggleRow: (rowId: string) => void;
}) {
  return (
    <>
      {items.flatMap((item): ReactElement[] => {
        if (item.type === 'request') {
          const usedModelId = item.linkedFeedback?.find((f) => f.isSuccess)?.modelId;
          const rows: ReactElement[] = [
            <ExpandableRequestRows
              key={item.id}
              item={item}
              isExpanded={!!expandedRows[item.id]}
              onToggle={() => onToggleRow(item.id)}
            />,
          ];

          if (item.linkedFeedback?.length) {
            rows.push(
              ...item.linkedFeedback.map((fb) => (
                <ChildFeedbackRow key={fb.id} feedback={fb} isUsed={fb.modelId === usedModelId} />
              ))
            );
          }

          return rows;
        }

        return [<FeedbackRow key={item.id} item={item} />];
      })}
    </>
  );
}

export function UnifiedHistoryTable({
  enabled,
  apiKeyId,
}: {
  enabled?: boolean;
  apiKeyId?: string | null;
}) {
  const { items, hasMore, isLoading, isFetchingMore, error, loadMore, refresh } =
    useHistory<UnifiedHistoryItem>('unified', 15, { enabled, apiKeyId });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  if (isLoading && items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Loading activity...</p>;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={() => refresh()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        No activity yet. Make API calls or report model usage to see them here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Target</TableHead>
            <TableHead>API Key</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <UnifiedHistoryRows items={items} expandedRows={expandedRows} onToggleRow={toggleRow} />
        </TableBody>
      </Table>

      <SeeMoreButton hasMore={hasMore} isFetchingMore={isFetchingMore} onLoadMore={loadMore} />
    </div>
  );
}
