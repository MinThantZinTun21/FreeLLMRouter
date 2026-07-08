import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext } from '../../helpers.ts';

describe('/api/auth/api-key/create', () => {
  it('returns 204 for OPTIONS request (CORS preflight)', async () => {
    const { OPTIONS } = await import('../../../src/pages/api/auth/api-key/create.ts');

    const response = await OPTIONS({} as Parameters<typeof OPTIONS>[0]);

    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.ok(response.headers.get('Access-Control-Allow-Methods')?.includes('POST'));
  });

  it('includes CORS headers on POST responses', async () => {
    const { POST } = await import('../../../src/pages/api/auth/api-key/create.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/auth/api-key/create',
      method: 'POST',
      body: { name: 'test-key', expiresIn: 86400 },
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

    const response = await POST(context as Parameters<typeof POST>[0]);

    // Response should include CORS headers regardless of auth status
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
  });
});
