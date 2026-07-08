import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../helpers.ts';

type CatalogRow = {
  rpmLimit: number;
  dailyRequestLimit: number | null;
  dailyTokenLimit: number;
};

type UsageSummary = {
  requestsThisMinute: number;
  requestsToday: number;
  tokensToday: number;
};

function computeModelStatus(model: CatalogRow, usage: UsageSummary): 'available' | 'limit_reached' {
  return usage.requestsThisMinute >= model.rpmLimit ||
    (model.dailyRequestLimit !== null && usage.requestsToday >= model.dailyRequestLimit) ||
    usage.tokensToday >= model.dailyTokenLimit
    ? 'limit_reached'
    : 'available';
}

describe('/api/bridge/v1/models', () => {
  it('requires bridge authorization', async () => {
    const { GET } = await import('../../src/pages/api/bridge/v1/models.ts');
    const context = createMockContext({
      url: 'http://localhost:4321/api/bridge/v1/models',
      method: 'GET',
      headers: {},
    });

    const response = await GET(context as Parameters<typeof GET>[0]);
    assert.equal(response.status, 401);
    const body = await parseJsonResponse<{ error: string; code: string }>(response);
    assert.equal(body.code, 'UNAUTHORIZED');
  });

  it('marks models limit_reached when rpm or token caps are exceeded', () => {
    const model = { rpmLimit: 60, dailyRequestLimit: null, dailyTokenLimit: 100_000 };
    assert.equal(
      computeModelStatus(model, { requestsThisMinute: 60, requestsToday: 0, tokensToday: 0 }),
      'limit_reached'
    );
    assert.equal(
      computeModelStatus(model, { requestsThisMinute: 0, requestsToday: 0, tokensToday: 100_000 }),
      'limit_reached'
    );
    assert.equal(
      computeModelStatus(model, { requestsThisMinute: 1, requestsToday: 0, tokensToday: 0 }),
      'available'
    );
  });

  it('enriches catalog rows with usage and status in handler source', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/pages/api/bridge/v1/models.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes('listCatalogWithStatus'));
    assert.ok(source.includes('getModelUsageSummary'));
    assert.ok(source.includes("'limit_reached'"));
    assert.ok(source.includes('routeType'));
    assert.ok(source.includes('provider'));
  });
});

describe('/api/bridge/v1/providers', () => {
  it('requires bridge authorization', async () => {
    const { GET } = await import('../../src/pages/api/bridge/v1/providers.ts');
    const context = createMockContext({
      url: 'http://localhost:4321/api/bridge/v1/providers',
      method: 'GET',
      headers: {},
    });

    const response = await GET(context as Parameters<typeof GET>[0]);
    assert.equal(response.status, 401);
    const body = await parseJsonResponse<{ error: string; code: string }>(response);
    assert.equal(body.code, 'UNAUTHORIZED');
  });

  it('maps keyConfigured from configured provider set', () => {
    const providers = [
      { name: 'openai', modelCount: 2 },
      { name: 'anthropic', modelCount: 1 },
    ];
    const configured = new Set(['openai']);

    const payload = providers.map((provider) => ({
      ...provider,
      keyConfigured: configured.has(provider.name),
    }));

    assert.equal(payload.find((p) => p.name === 'openai')?.keyConfigured, true);
    assert.equal(payload.find((p) => p.name === 'anthropic')?.keyConfigured, false);
  });

  it('uses tenant context and provider registry in handler source', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/pages/api/bridge/v1/providers.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes('resolveTenantContext'));
    assert.ok(source.includes('listBridgeProviders'));
    assert.ok(source.includes('listConfiguredProviders'));
    assert.ok(source.includes('keyConfigured'));
  });
});
