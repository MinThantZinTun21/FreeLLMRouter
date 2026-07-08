import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  formatTimeAgo,
  getStatusBadgeVariant,
  parseResponseData,
} from '@/components/auth/history/history-utils';
import { RequestDetailsPanel } from '@/components/auth/history/RequestDetailsPanel';

export interface ExpandableRequestItem {
  id: string;
  endpoint: string | null;
  method: string | null;
  statusCode: number | null;
  createdAt: string;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  responseData: string | null;
}

export function ExpandableRequestRows({
  item,
  isExpanded,
  onToggle,
}: {
  item: ExpandableRequestItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const responseData = parseResponseData(item.responseData);

  return (
    <>
      <TableRow
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
            <Badge variant="outline" className="font-mono text-xs">
              {item.method || '-'}
            </Badge>
            <code className="text-sm truncate max-w-50">{item.endpoint || '-'}</code>
          </div>
        </TableCell>
        <TableCell>
          <code className="text-xs text-muted-foreground">
            {item.apiKeyName || item.apiKeyPrefix || 'Deleted'}
          </code>
        </TableCell>
        <TableCell>
          <Badge variant={getStatusBadgeVariant(item.statusCode ?? 0)}>
            {item.statusCode ?? '-'}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {formatTimeAgo(item.createdAt)}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">View</TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={5} className="whitespace-normal">
            <RequestDetailsPanel responseData={responseData} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
