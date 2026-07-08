import { useHistory, type FeedbackItem } from '@/hooks/useHistory';
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
import { TruncatedWithTooltip, SeeMoreButton } from '@/components/auth/history/HistoryShared';
import { formatTimeAgo } from '@/components/auth/history/history-utils';

export function UsageReportsTable({
  enabled,
  apiKeyId,
}: {
  enabled?: boolean;
  apiKeyId?: string | null;
}) {
  const { items, hasMore, isLoading, isFetchingMore, error, loadMore, refresh } =
    useHistory<FeedbackItem>('feedback', 15, { enabled, apiKeyId });

  if (isLoading && items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Loading usage reports...</p>;
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
        No usage reports yet. Report model successes or issues to see them here.
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
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <code className="text-sm truncate max-w-50 block">{item.modelId}</code>
              </TableCell>
              <TableCell>
                <code className="text-xs text-muted-foreground">
                  {item.apiKeyName || item.apiKeyPrefix || '-'}
                </code>
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
          ))}
        </TableBody>
      </Table>

      <SeeMoreButton hasMore={hasMore} isFetchingMore={isFetchingMore} onLoadMore={loadMore} />
    </div>
  );
}
