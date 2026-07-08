import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../helpers.ts';

describe('/api/demo/models', () => {
  it('returns 403 for disallowed origin', async () => {
    const { GET } = await import('../../src/pages/api/demo/models.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/demo/models',
      headers: {
        origin: 'https://malicious-site.com',
      },
    });

    const response = await GET(context as Parameters<typeof GET>[0]);

    assert.strictEqual(response.status, 403);
    const body = await parseJsonResponse<{ error: string; requestId?: string }>(response);
    assert.strictEqual(body.error, 'Forbidden');
    assert.ok(body.requestId);
    assert.ok(response.headers.get('X-Request-Id'));
  });

  it('allows requests from localhost origin (with DEMO_API_KEY)', async () => {
    const { GET } = await import('../../src/pages/api/demo/models.ts');

    // Mock fetch globally before the test
    const originalFetch = globalThis.fetch;
    let calledUrl = '';
    globalThis.fetch = async (input) => {
      calledUrl = String(input);
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    };

    try {
      const context = createMockContext({
        url: 'http://localhost:4321/api/demo/models',
        headers: {
          origin: 'http://localhost:4321',
        },
        locals: {
          runtime: {
            env: {
              DEMO_API_KEY: 'test-key',
              BETTER_AUTH_URL: 'http://localhost:4321',
            },
          },
        },
      });

      const response = await GET(context as Parameters<typeof GET>[0]);

      assert.strictEqual(response.status, 200);
      assert.ok(calledUrl.includes('_clearExcludedModels=true'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('allows requests with no origin (server-side calls)', async () => {
    const { GET } = await import('../../src/pages/api/demo/models.ts');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    };

    try {
      const context = createMockContext({
        url: 'http://localhost:4321/api/demo/models',
        // No origin header
        locals: {
          runtime: {
            env: {
              DEMO_API_KEY: 'test-key',
              BETTER_AUTH_URL: 'http://localhost:4321',
            },
          },
        },
      });

      const response = await GET(context as Parameters<typeof GET>[0]);

      assert.strictEqual(response.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('blocks requests from production origin when called from other sites', async () => {
    const { GET } = await import('../../src/pages/api/demo/models.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/demo/models',
      headers: {
        origin: 'https://attacker.com',
        referer: 'https://attacker.com/scraper',
      },
    });

    const response = await GET(context as Parameters<typeof GET>[0]);

    assert.strictEqual(response.status, 403);
  });
});
