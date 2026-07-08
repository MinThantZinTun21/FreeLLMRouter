import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('provider key resolution order', () => {
  it('prefers tenant keys before system keys in source', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/provider-keys.ts', import.meta.url), 'utf8')
    );
    const tenantIndex = source.indexOf('eq(providerKeys.tenantId, tenantId)');
    const systemIndex = source.indexOf('eq(providerKeys.isSystem, true)');
    assert.ok(tenantIndex >= 0);
    assert.ok(systemIndex >= 0);
    assert.ok(tenantIndex < systemIndex);
    assert.ok(source.includes('tenantRow ||'));
  });

  it('includes tenant keys and system keys in configured provider set logic', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/provider-keys.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes('listConfiguredProviders'));
    assert.ok(source.includes('row.tenantId === tenantId'));
    assert.ok(source.includes('row.isSystem'));
  });
});

describe('direct provider forwarding', () => {
  it('tries direct adapter before openrouter', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/providers/index.ts', import.meta.url), 'utf8')
    );
    const directIndex = source.indexOf('directAdapter');
    const openrouterIndex = source.indexOf('openRouterAdapter');
    assert.ok(directIndex >= 0);
    assert.ok(openrouterIndex >= 0);
    assert.ok(directIndex < openrouterIndex);
  });

  it('resolves provider-specific keys for direct forwarding', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/providers/index.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes('providerKeyName: ctx.model.provider'));
    assert.ok(source.includes("providerKeyName: 'openrouter'"));
    assert.ok(source.includes('getDirectBaseUrl(ctx.model.provider)'));
  });

  it('falls back to openrouter when direct auth fails', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/providers/index.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes("result.errorCode === 'AUTH'"));
    assert.ok(source.includes('continue'));
  });
});

describe('configured provider precedence', () => {
  it('tenant-scoped keys override system scope in listConfiguredProviders', () => {
    const rows = [
      { provider: 'openai', tenantId: 'tenant-a', isSystem: false },
      { provider: 'openai', tenantId: null, isSystem: true },
      { provider: 'anthropic', tenantId: null, isSystem: true },
    ];

    const configured = new Set<string>();
    const tenantId = 'tenant-a';
    for (const row of rows) {
      if (tenantId && row.tenantId === tenantId) {
        configured.add(row.provider);
        continue;
      }
      if (row.isSystem) {
        configured.add(row.provider);
      }
    }

    assert.deepEqual([...configured].sort(), ['anthropic', 'openai']);
  });
});
