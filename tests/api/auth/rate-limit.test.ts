import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../../helpers.ts';

describe('/api/auth/rate-limit', () => {
  it('returns 500 when required env vars are empty', async () => {
    const { GET } = await import('../../../src/pages/api/auth/rate-limit.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/auth/rate-limit',
      method: 'GET',
      locals: {
        runtime: {
          env: {
            DATABASE_URL: '', // Empty to trigger config error
            DATABASE_URL_ADMIN: '',
            BETTER_AUTH_URL: '',
            BETTER_AUTH_SECRET: '',
            GITHUB_CLIENT_ID: '',
            GITHUB_CLIENT_SECRET: '',
          },
        },
      },
    });

    const response = await GET(context as Parameters<typeof GET>[0]);

    assert.strictEqual(response.status, 500);
    const body = await parseJsonResponse<{ error: string; requestId?: string }>(response);
    assert.ok(body.error.includes('configuration') || body.error.includes('error'));
    assert.ok(body.requestId);
    assert.ok(response.headers.get('X-Request-Id'));
  });
});
