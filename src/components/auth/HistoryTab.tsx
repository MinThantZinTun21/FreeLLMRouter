import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, FileText, Key } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UnifiedHistoryTable } from '@/components/auth/history/UnifiedHistoryTable';
import { RequestHistoryTable } from '@/components/auth/history/RequestHistoryTable';
import { UsageReportsTable } from '@/components/auth/history/UsageReportsTable';

export function HistoryTab({ isSessionReady }: { isSessionReady?: boolean }) {
  const [filter, setFilter] = useState<'unified' | 'requests' | 'feedback'>('unified');
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string }[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(null);

  useEffect(() => {
    if (isSessionReady) {
      authClient.apiKey.list().then((res) => {
        if (res.data) {
          setApiKeys(res.data.map((k) => ({ id: k.id, name: k.name || 'Unnamed' })));
        }
      });
    }
  }, [isSessionReady]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>View your API request history and usage reports</CardDescription>
        <div className="flex items-center gap-2 pt-2">
          <Button
            variant={filter === 'unified' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unified')}
          >
            All Activity
          </Button>
          <Button
            variant={filter === 'requests' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('requests')}
          >
            <Clock className="h-4 w-4 mr-2" />
            Requests
          </Button>
          <Button
            variant={filter === 'feedback' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('feedback')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Feedback
          </Button>
          <div className="flex-1" />
          <Select
            value={selectedApiKeyId || 'all'}
            onValueChange={(v) => setSelectedApiKeyId(v === 'all' ? null : v)}
          >
            <SelectTrigger size="sm" className="w-45">
              <Key className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All API Keys" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All API Keys</SelectItem>
              {apiKeys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  {key.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filter === 'unified' && (
          <UnifiedHistoryTable enabled={isSessionReady} apiKeyId={selectedApiKeyId} />
        )}
        {filter === 'requests' && (
          <RequestHistoryTable enabled={isSessionReady} apiKeyId={selectedApiKeyId} />
        )}
        {filter === 'feedback' && (
          <UsageReportsTable enabled={isSessionReady} apiKeyId={selectedApiKeyId} />
        )}
      </CardContent>
    </Card>
  );
}
