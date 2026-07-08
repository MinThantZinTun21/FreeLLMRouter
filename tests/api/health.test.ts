import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext } from '../helpers.ts';

describe('/api/health', () => {
  it('returns JSON content type', async () => {
    const { GET } = await import('../../src/pages/api/health.ts');

    // Mock fetch for any external calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const context = createMockContext({
        url: 'http://localhost:4321/api/health',
        method: 'GET',
        locals: {
          runtime: {
            env: {
              // Intentionally omit DB URLs to avoid external calls in tests.
            },
          },
        },
      });

      const response = await GET(context as Parameters<typeof GET>[0]);

      // The response should have JSON content type (even if DB fails)
      assert.ok(
        response.headers.get('Content-Type')?.includes('application/json'),
        'Response should have JSON content type'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
