import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const PROVIDER_OPTIONS = [
  'openrouter',
  'openai',
  'google',
  'meta-llama',
  'mistralai',
  'qwen',
  'deepseek',
  'groq',
  'together',
  'cohere',
];

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  rpmLimitChat: number;
  rpmLimitVision: number;
  rpmLimitEmbeddings: number;
  dailyLimitChat: number;
  dailyLimitVision: number;
  dailyLimitEmbeddings: number;
}

interface BridgeKey {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
}

interface ProviderKeyRow {
  id: string;
  tenantId?: string | null;
  provider: string;
  name: string;
  keyLast4: string;
  isSystem: boolean;
  isActive: boolean;
  lastUsedAt?: string | null;
}

interface CatalogRow {
  id: string;
  provider: string;
  modelId: string;
  routeType: string;
  rpmLimit: number;
  dailyRequestLimit: number | null;
  dailyTokenLimit: number;
  usage: {
    requestsThisMinute: number;
    requestsToday: number;
    tokensToday: number;
  };
  status: string;
}

interface RuntimeState {
  id: string;
  provider: string;
  modelId: string;
  score: number;
  status: string;
  consecutiveFailures: number;
  inCooldown: boolean;
  inQuotaReset: boolean;
  lastErrorCode?: string | null;
}

interface UsageRow {
  dateKey: string;
  routeType: string;
  provider: string;
  modelId: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
}

export function BridgeAdminTab() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [keys, setKeys] = useState<BridgeKey[]>([]);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyRow[]>([]);
  const [catalogRows, setCatalogRows] = useState<CatalogRow[]>([]);
  const [runtimeStates, setRuntimeStates] = useState<RuntimeState[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [usageTotals, setUsageTotals] = useState({
    requests: 0,
    successes: 0,
    failures: 0,
    tokens: 0,
  });
  const [activeTenantId, setActiveTenantId] = useState<string>('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [newBridgeKeyName, setNewBridgeKeyName] = useState('Default Bridge Key');
  const [latestPlainKey, setLatestPlainKey] = useState<string | null>(null);
  const [provider, setProvider] = useState('openrouter');
  const [providerKeyName, setProviderKeyName] = useState('OpenRouter System Key');
  const [providerRawKey, setProviderRawKey] = useState('');
  const [providerKeyIsSystem, setProviderKeyIsSystem] = useState(true);
  const [catalogProviderFilter, setCatalogProviderFilter] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const activeTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === activeTenantId) || null,
    [tenants, activeTenantId]
  );

  const [limitsDraft, setLimitsDraft] = useState({
    rpmLimitChat: 120,
    rpmLimitVision: 60,
    rpmLimitEmbeddings: 240,
    dailyLimitChat: 5000,
    dailyLimitVision: 2000,
    dailyLimitEmbeddings: 10000,
  });

  const refreshTenants = async () => {
    const response = await fetch('/api/bridge/admin/tenants', { credentials: 'include' });
    const data = await response.json();
    setTenants(data.tenants || []);
  };

  const refreshKeys = async (tenantId: string) => {
    if (!tenantId) return;
    const response = await fetch(
      `/api/bridge/admin/api-keys?tenantId=${encodeURIComponent(tenantId)}`,
      {
        credentials: 'include',
      }
    );
    const data = await response.json();
    setKeys(data.keys || []);
  };

  const refreshProviderKeys = async () => {
    const response = await fetch('/api/bridge/admin/provider-keys', { credentials: 'include' });
    const data = await response.json();
    setProviderKeys(data.keys || []);
  };

  const refreshCatalog = async () => {
    const query = catalogProviderFilter
      ? `?provider=${encodeURIComponent(catalogProviderFilter)}`
      : '';
    const response = await fetch(`/api/bridge/admin/catalog${query}`, { credentials: 'include' });
    const data = await response.json();
    setCatalogRows(data.models || []);
  };

  const refreshRuntimeState = async () => {
    const response = await fetch('/api/bridge/admin/runtime-state?limit=50', {
      credentials: 'include',
    });
    const data = await response.json();
    setRuntimeStates(data.states || []);
  };

  const refreshUsage = async (tenantId: string) => {
    const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}&days=7` : '?days=7';
    const response = await fetch(`/api/bridge/admin/usage${query}`, { credentials: 'include' });
    const data = await response.json();
    setUsageRows(data.usage || []);
    setUsageTotals(data.totals || { requests: 0, successes: 0, failures: 0, tokens: 0 });
  };

  useEffect(() => {
    void refreshTenants();
    void refreshRuntimeState();
    void refreshProviderKeys();
    void refreshCatalog();
  }, []);

  useEffect(() => {
    if (!activeTenantId && tenants[0]?.id) {
      setActiveTenantId(tenants[0].id);
    }
  }, [tenants, activeTenantId]);

  useEffect(() => {
    if (activeTenantId) {
      void refreshKeys(activeTenantId);
      void refreshUsage(activeTenantId);
    }
  }, [activeTenantId]);

  useEffect(() => {
    void refreshCatalog();
  }, [catalogProviderFilter]);

  useEffect(() => {
    if (!activeTenant) return;
    setLimitsDraft({
      rpmLimitChat: activeTenant.rpmLimitChat,
      rpmLimitVision: activeTenant.rpmLimitVision,
      rpmLimitEmbeddings: activeTenant.rpmLimitEmbeddings,
      dailyLimitChat: activeTenant.dailyLimitChat,
      dailyLimitVision: activeTenant.dailyLimitVision,
      dailyLimitEmbeddings: activeTenant.dailyLimitEmbeddings,
    });
  }, [activeTenant]);

  const catalogByProvider = useMemo(() => {
    const grouped = new Map<string, CatalogRow[]>();
    for (const row of catalogRows) {
      const list = grouped.get(row.provider) || [];
      list.push(row);
      grouped.set(row.provider, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalogRows]);

  const createTenant = async () => {
    setStatus(null);
    const response = await fetch('/api/bridge/admin/tenants', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tenantName, slug: tenantSlug }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to create tenant');
      return;
    }
    setTenantName('');
    setTenantSlug('');
    setStatus('Tenant created');
    await refreshTenants();
  };

  const saveLimits = async () => {
    if (!activeTenantId) return;
    setStatus(null);
    const response = await fetch('/api/bridge/admin/tenants', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeTenantId, ...limitsDraft }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to save limits');
      return;
    }
    setStatus('Tenant limits updated');
    await refreshTenants();
  };

  const createBridgeKey = async () => {
    if (!activeTenantId) return;
    setStatus(null);
    const response = await fetch('/api/bridge/admin/api-keys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: activeTenantId, name: newBridgeKeyName }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to create bridge key');
      return;
    }
    setLatestPlainKey(data.key || null);
    setStatus('Bridge API key created');
    await refreshKeys(activeTenantId);
  };

  const saveProviderKey = async () => {
    setStatus(null);
    const response = await fetch('/api/bridge/admin/provider-keys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        name: providerKeyName,
        rawKey: providerRawKey,
        isSystem: providerKeyIsSystem,
        tenantId: providerKeyIsSystem ? undefined : activeTenantId,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to save provider key');
      return;
    }
    setProviderRawKey('');
    setStatus(`Saved provider key (${data.keyLast4})`);
    await refreshProviderKeys();
  };

  const revokeProviderKey = async (id: string) => {
    setStatus(null);
    const response = await fetch('/api/bridge/admin/provider-keys?action=revoke', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to revoke provider key');
      return;
    }
    setStatus('Provider key revoked');
    await refreshProviderKeys();
  };

  const saveCatalogLimits = async (row: CatalogRow) => {
    const response = await fetch('/api/bridge/admin/catalog', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: row.id,
        rpmLimit: row.rpmLimit,
        dailyRequestLimit: row.dailyRequestLimit,
        dailyTokenLimit: row.dailyTokenLimit,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to save model limits');
      return;
    }
    setStatus(`Updated limits for ${row.modelId}`);
    await refreshCatalog();
  };

  const syncCatalog = async () => {
    setStatus(null);
    const response = await fetch('/api/bridge/admin/sync-catalog', {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Catalog sync failed');
      return;
    }
    setStatus(`Catalog sync done (${data.source}): ${data.imported} models`);
    await refreshCatalog();
  };

  const runMaintenance = async () => {
    setStatus(null);
    const response = await fetch('/api/bridge/admin/maintenance', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestLogDays: 30, aggregateDays: 180 }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Maintenance failed');
      return;
    }
    setStatus(
      `Maintenance done: ${data.pruned?.requestHops || 0} hops, ${data.pruned?.usageAggregates || 0} aggregates pruned`
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bridge Tenants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              placeholder="Tenant name"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
            />
            <Input
              placeholder="tenant-slug"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
            />
            <Button onClick={createTenant}>Create Tenant</Button>
          </div>
          <div className="space-y-1">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => setActiveTenantId(tenant.id)}
                className={`block w-full rounded border px-3 py-2 text-left text-sm ${
                  activeTenantId === tenant.id ? 'border-primary bg-muted' : 'border-border'
                }`}
              >
                {tenant.name} ({tenant.slug}) {tenant.isActive ? '' : '· inactive'}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ['rpmLimitChat', 'Chat RPM'],
                ['rpmLimitVision', 'Vision RPM'],
                ['rpmLimitEmbeddings', 'Embeddings RPM'],
                ['dailyLimitChat', 'Chat daily'],
                ['dailyLimitVision', 'Vision daily'],
                ['dailyLimitEmbeddings', 'Embeddings daily'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <Input
                  type="number"
                  min={0}
                  value={limitsDraft[key]}
                  onChange={(e) =>
                    setLimitsDraft((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <Button onClick={saveLimits} disabled={!activeTenantId}>
            Save Limits
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bridge API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input value={newBridgeKeyName} onChange={(e) => setNewBridgeKeyName(e.target.value)} />
            <Button onClick={createBridgeKey} disabled={!activeTenantId}>
              Create API Key
            </Button>
          </div>
          {latestPlainKey && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Save this key now: <code>{latestPlainKey}</code>
            </div>
          )}
          <div className="space-y-1">
            {keys.map((key) => (
              <div key={key.id} className="rounded border px-3 py-2 text-sm">
                {key.name} - {key.prefix}... ({key.isActive ? 'active' : 'revoked'})
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider Official API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Provider</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {PROVIDER_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              value={providerKeyName}
              onChange={(e) => setProviderKeyName(e.target.value)}
              placeholder="key name"
            />
            <Input
              value={providerRawKey}
              onChange={(e) => setProviderRawKey(e.target.value)}
              placeholder="official provider API key"
              type="password"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={providerKeyIsSystem}
                onChange={(e) => setProviderKeyIsSystem(e.target.checked)}
              />
              System-wide key (unchecked = active tenant only)
            </label>
          </div>
          <Button onClick={saveProviderKey}>Save Provider Key</Button>
          <div className="space-y-1">
            {providerKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider keys saved yet.</p>
            ) : (
              providerKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {key.provider} · {key.name} · ...{key.keyLast4}
                    </div>
                    <div className="text-muted-foreground">
                      {key.isSystem ? 'system' : 'tenant'} · {key.isActive ? 'active' : 'revoked'}
                      {key.lastUsedAt
                        ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}`
                        : ''}
                    </div>
                  </div>
                  {key.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void revokeProviderKey(key.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free Model Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Input
              value={catalogProviderFilter}
              onChange={(e) => setCatalogProviderFilter(e.target.value)}
              placeholder="Filter provider"
              className="max-w-xs"
            />
            <Button variant="outline" onClick={syncCatalog}>
              Sync from free_models
            </Button>
            <Button variant="outline" onClick={() => void refreshCatalog()}>
              Refresh catalog
            </Button>
            <Button variant="outline" onClick={runMaintenance}>
              Run maintenance
            </Button>
            <Button variant="outline" onClick={() => void refreshRuntimeState()}>
              Refresh health
            </Button>
          </div>
          {catalogByProvider.length === 0 ? (
            <p className="text-sm text-muted-foreground">No catalog models yet. Run sync.</p>
          ) : (
            catalogByProvider.map(([providerName, rows]) => (
              <div key={providerName} className="space-y-2">
                <h3 className="text-sm font-semibold">{providerName}</h3>
                {rows.map((row) => (
                  <div key={row.id} className="rounded border px-3 py-2 text-sm space-y-2">
                    <div className="font-medium">
                      {row.modelId} · {row.routeType} ·{' '}
                      <span
                        className={
                          row.status === 'limit_reached' ? 'text-amber-600' : 'text-emerald-600'
                        }
                      >
                        {row.status}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {row.usage.requestsThisMinute} rpm · {row.usage.requestsToday} req/day ·{' '}
                      {row.usage.tokensToday} tokens/day
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <Input
                        type="number"
                        value={row.rpmLimit}
                        onChange={(e) =>
                          setCatalogRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, rpmLimit: Number(e.target.value) }
                                : item
                            )
                          )
                        }
                        placeholder="RPM"
                      />
                      <Input
                        type="number"
                        value={row.dailyRequestLimit ?? ''}
                        onChange={(e) =>
                          setCatalogRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    dailyRequestLimit:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  }
                                : item
                            )
                          )
                        }
                        placeholder="Daily requests"
                      />
                      <Input
                        type="number"
                        value={row.dailyTokenLimit}
                        onChange={(e) =>
                          setCatalogRows((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, dailyTokenLimit: Number(e.target.value) }
                                : item
                            )
                          )
                        }
                        placeholder="Daily tokens"
                      />
                      <Button variant="outline" onClick={() => void saveCatalogLimits(row)}>
                        Save limits
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Runtime Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runtimeStates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runtime state yet.</p>
          ) : (
            runtimeStates.map((state) => (
              <div key={state.id} className="rounded border px-3 py-2 text-sm">
                <div className="font-medium">{state.modelId}</div>
                <div className="text-muted-foreground">
                  score {state.score} · {state.status}
                  {state.inCooldown ? ' · cooldown' : ''}
                  {state.inQuotaReset ? ' · quota reset pending' : ''}
                  {state.lastErrorCode ? ` · ${state.lastErrorCode}` : ''}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage (7 days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {usageTotals.requests} requests · {usageTotals.successes} ok · {usageTotals.failures}{' '}
            failed · {usageTotals.tokens} tokens
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {usageRows.map((row) => (
              <div
                key={`${row.dateKey}-${row.modelId}-${row.routeType}`}
                className="rounded border px-3 py-2 text-sm"
              >
                {row.dateKey} · {row.routeType} · {row.modelId}: {row.requestCount} req (
                {row.successCount} ok)
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
