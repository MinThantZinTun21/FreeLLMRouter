import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext } from '../../helpers.ts';

describe('/api/auth/[...all]', () => {
  // Note: The auth catch-all route delegates to Better Auth handler.
  // Testing missing env vars is difficult because the code uses `||` fallback
  // to import.meta.env which is undefined in Node.js.
  //
  // This test verifies the endpoint is reachable and returns a valid response.

  it('returns a valid HTTP response', async () => {
    const { ALL } = await import('../../../src/pages/api/auth/[...all].ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/auth/session',
      method: 'GET',
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgresql://user:password@host.example.com/db',
            DATABASE_URL_ADMIN: 'postgresql://user:password@host.example.com/db',
            BETTER_AUTH_URL: 'http://localhost:4321',
            BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-auth',
            GITHUB_CLIENT_ID: 'test-client-id',
            GITHUB_CLIENT_SECRET: 'test-client-secret',
          },
        },
      },
    });

    const response = await ALL(context as Parameters<typeof ALL>[0]);

    // The handler should return a Response object
    assert.ok(response instanceof Response, 'Should return a Response object');
    assert.ok(typeof response.status === 'number', 'Response should have a status code');
  });
});
