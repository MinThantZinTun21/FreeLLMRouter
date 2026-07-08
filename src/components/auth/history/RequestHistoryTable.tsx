import { useState } from 'react';
import { useHistory, type ApiRequestLog } from '@/hooks/useHistory';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { ExpandableRequestRows } from '@/components/auth/history/ExpandableRequestRows';
import { SeeMoreButton } from '@/components/auth/history/HistoryShared';

export function RequestHistoryTable({
  enabled,
  apiKeyId,
}: {
  enabled?: boolean;
  apiKeyId?: string | null;
}) {
  const { items, hasMore, isLoading, isFetchingMore, error, loadMore, refresh } =
    useHistory<ApiRequestLog>('requests', 15, { enabled, apiKeyId });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (rowId: string) => {
    setExpandedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  if (isLoading && items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Loading request history...</p>;
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
        No API requests yet. Make your first API call to see it here.
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
            <ExpandableRequestRows
              key={item.id}
              item={item}
              isExpanded={!!expandedRows[item.id]}
              onToggle={() => toggleRow(item.id)}
            />
          ))}
        </TableBody>
      </Table>

      <SeeMoreButton hasMore={hasMore} isFetchingMore={isFetchingMore} onLoadMore={loadMore} />
    </div>
  );
}
