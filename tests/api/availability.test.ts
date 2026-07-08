import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../helpers.ts';

describe('/api/availability', () => {
  it('returns requestId and header on configuration error', async () => {
    const { GET } = await import('../../src/pages/api/availability.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/availability?days=90',
      method: 'GET',
      locals: {
        runtime: {
          env: {
            DATABASE_URL: '',
          },
        },
      },
    });

    const response = await GET(context as Parameters<typeof GET>[0]);
    assert.strictEqual(response.status, 500);

    const body = await parseJsonResponse<{ error: string; requestId?: string }>(response);
    assert.ok(body.error);
    assert.ok(body.requestId);
    assert.ok(response.headers.get('X-Request-Id'));
  });
});
