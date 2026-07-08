import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient, createApiKeyWithLimit } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Copy, Check, Trash2, Key, Settings } from 'lucide-react';
import type { ApiKeyPreferences } from '@/lib/api-definitions';
import { DEFAULT_SORT, DEFAULT_TIME_RANGE } from '@/lib/api-definitions';
import { fetchJsonOrThrow, NO_STORE_REQUEST_INIT } from '@/lib/client-api';
import { STRICT_QUERY_OPTIONS } from '@/lib/query-defaults';

interface ApiKey {
  id: string;
  name: string;
  start: string | null;
  prefix: string | null;
  createdAt: Date;
  requestCount?: number | null;
  enabled: boolean;
}

interface ApiKeysTabProps {
  userRateLimit: {
    remaining: number;
    limit: number;
    requestCount: number;
  } | null;
  onRefreshRateLimit: () => void;
}

interface PreferenceSummaryItem {
  label: string;
  value: string;
}

type PreferenceSummaryState =
  | { ok: true; preferences: ApiKeyPreferences }
  | { ok: false; error: string };

async function fetchApiKeys(): Promise<ApiKey[]> {
  const response = await authClient.apiKey.list();
  return (response.data as ApiKey[]) || [];
}

async function fetchPreferences(apiKeyId: string): Promise<ApiKeyPreferences> {
  const data = await fetchJsonOrThrow<{ preferences?: ApiKeyPreferences }>(
    `/api/auth/preferences?apiKeyId=${encodeURIComponent(apiKeyId)}`,
    {
      credentials: 'include',
      ...NO_STORE_REQUEST_INIT,
    },
    'Could not load saved preferences'
  );
  return data.preferences || {};
}

const MAX_KEYS = 10;

function summarizePreferences(preferences: ApiKeyPreferences): PreferenceSummaryItem[] {
  const useCases =
    preferences.useCases && preferences.useCases.length > 0
      ? preferences.useCases.join(', ')
      : 'All';

  const health =
    preferences.maxErrorRate !== undefined
      ? `On (${preferences.maxErrorRate}% / ${preferences.timeRange || DEFAULT_TIME_RANGE})`
      : 'Off';

  return [
    { label: 'Use case', value: useCases },
    { label: 'Sort', value: preferences.sort || DEFAULT_SORT },
    { label: 'Top N', value: preferences.topN !== undefined ? String(preferences.topN) : 'Off' },
    { label: 'Health filter', value: health },
    {
      label: 'Reports',
      value: preferences.myReports ? 'My Reports Only' : 'All Community Reports',
    },
    {
      label: 'Excluded',
      value:
        preferences.excludeModelIds && preferences.excludeModelIds.length > 0
          ? `${preferences.excludeModelIds.length} models`
          : 'Off',
    },
  ];
}

export function ApiKeysTab({ userRateLimit }: ApiKeysTabProps) {
  const queryClient = useQueryClient();

  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: apiKeys = [], isLoading: isLoadingKeys } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: fetchApiKeys,
    ...STRICT_QUERY_OPTIONS,
  });

  const { data: preferenceByKeyId = {}, isLoading: isLoadingPreferenceSummaries } = useQuery({
    queryKey: ['apiKeyPreferenceSummaries', apiKeys.map((key) => key.id).join(',')],
    enabled: apiKeys.length > 0,
    queryFn: async () => {
      const entries: Array<readonly [string, PreferenceSummaryState]> = [];
      for (const key of apiKeys) {
        try {
          const preferences = await fetchPreferences(key.id);
          entries.push([key.id, { ok: true, preferences }] as const);
        } catch (error) {
          entries.push([
            key.id,
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Could not load saved preferences',
            },
          ] as const);
        }
      }
      return Object.fromEntries(entries) as Record<string, PreferenceSummaryState>;
    },
    staleTime: 60 * 1000,
    ...STRICT_QUERY_OPTIONS,
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) => createApiKeyWithLimit(name),
    onSuccess: (response) => {
      if (response.key) {
        setNewKey(response.key);
        setKeyName('');
        queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      } else if (response.error) {
        setError(response.error.message || 'Failed to create API key');
      }
    },
    onError: () => {
      setError('Failed to create API key');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: string) => authClient.apiKey.delete({ keyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      setKeyToDelete(null);
    },
  });

  const canCreateKey = apiKeys.length < MAX_KEYS;

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    if (!canCreateKey) {
      setError(`Maximum ${MAX_KEYS} API keys allowed. Delete an existing key to create a new one.`);
      return;
    }

    setError(null);
    createKeyMutation.mutate(keyName.trim());
  };

  const handleCopyKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Key className="h-5 w-5" />
            API Usage (Shared Across All Keys)
          </CardTitle>
          <CardDescription className="text-blue-600 dark:text-blue-500">
            Your usage resets 24 hours after your last request
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userRateLimit ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{userRateLimit.remaining}</span>
                <span className="text-muted-foreground">
                  / {userRateLimit.limit} requests remaining
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {userRateLimit.requestCount > 0 ? (
                  <>
                    Used {userRateLimit.requestCount} request
                    {userRateLimit.requestCount === 1 ? '' : 's'} today
                  </>
                ) : (
                  'No requests made yet'
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Loading usage data...</p>
          )}
        </CardContent>
      </Card>

      {newKey && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Key className="h-5 w-5" />
              API Key Created
            </CardTitle>
            <CardDescription className="text-green-600 dark:text-green-500">
              Copy this key now. You won&apos;t be able to see it again!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-green-100 px-3 py-2 font-mono text-sm dark:bg-green-900/30">
                {newKey}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopyKey}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setNewKey(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Manage your keys ({apiKeys.length}/{MAX_KEYS}). All keys share your account&apos;s rate
            limit of {userRateLimit?.limit ?? 200} requests per day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateKey} className="flex gap-2">
            <Input
              placeholder="Key name (e.g., 'My App')"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              disabled={createKeyMutation.isPending}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={createKeyMutation.isPending || !keyName.trim() || !canCreateKey}
            >
              {createKeyMutation.isPending
                ? 'Creating...'
                : canCreateKey
                  ? 'Create Key'
                  : `Limit Reached (${MAX_KEYS})`}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

          <div className="mt-6">
            {isLoadingKeys ? (
              <p className="text-center text-muted-foreground py-4">Loading keys...</p>
            ) : apiKeys.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No API keys yet. Create one above to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((key) => {
                    const preferenceState = preferenceByKeyId[key.id];
                    const preferenceSummary =
                      preferenceState && preferenceState.ok
                        ? summarizePreferences(preferenceState.preferences)
                        : [];

                    return [
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                            {key.prefix || key.start || 'fma_'}...
                          </code>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {key.requestCount ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.enabled ? 'default' : 'secondary'}>
                            {key.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setKeyToDelete(key.id)}
                            disabled={
                              deleteKeyMutation.isPending && deleteKeyMutation.variables === key.id
                            }
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            title="Delete API key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>,
                      <TableRow key={`${key.id}-prefs`} className="hover:bg-transparent">
                        <TableCell colSpan={6}>
                          {isLoadingPreferenceSummaries ? (
                            <span className="text-xs text-muted-foreground">
                              Loading parameters...
                            </span>
                          ) : (
                            <div className="flex items-center justify-between gap-3 rounded-md p-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {preferenceState && !preferenceState.ok ? (
                                  <Badge variant="destructive">{preferenceState.error}</Badge>
                                ) : (
                                  preferenceSummary.map((item) => (
                                    <Badge key={`${key.id}-${item.label}`} variant="secondary">
                                      <span className="mr-1 text-muted-foreground">
                                        {item.label}:
                                      </span>
                                      {item.value}
                                    </Badge>
                                  ))
                                )}
                              </div>
                              <Button asChild variant="ghost" size="sm" className="h-8 shrink-0">
                                <a href="/dashboard?tab=configure">
                                  <Settings className="mr-1 h-4 w-4" />
                                  Configure
                                </a>
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>,
                    ];
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this API key? This action cannot be undone and will
              immediately invalidate the key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => keyToDelete && deleteKeyMutation.mutate(keyToDelete)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
