import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../helpers.ts';

describe('/api/v1/models/feedback', () => {
  it('returns 401 without Authorization header', async () => {
    const { POST } = await import('../../src/pages/api/v1/models/feedback.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/v1/models/feedback',
      method: 'POST',
      body: {
        modelId: 'test-model',
        issue: 'rate_limited',
      },
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgresql://user:password@host.example.com/db',
            BETTER_AUTH_URL: 'http://localhost:4321',
            BETTER_AUTH_SECRET: 'test-secret',
            GITHUB_CLIENT_ID: 'test-client-id',
            GITHUB_CLIENT_SECRET: 'test-client-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 401);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('Missing Authorization header'));
  });

  it('returns 401 with invalid Authorization format', async () => {
    const { POST } = await import('../../src/pages/api/v1/models/feedback.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/v1/models/feedback',
      method: 'POST',
      headers: {
        Authorization: 'Basic invalidformat',
      },
      body: {
        modelId: 'test-model',
        issue: 'rate_limited',
      },
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgresql://user:password@host.example.com/db',
            BETTER_AUTH_URL: 'http://localhost:4321',
            BETTER_AUTH_SECRET: 'test-secret',
            GITHUB_CLIENT_ID: 'test-client-id',
            GITHUB_CLIENT_SECRET: 'test-client-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 401);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('Invalid Authorization format'));
  });

  it('returns 401 with malformed Bearer token', async () => {
    const { POST } = await import('../../src/pages/api/v1/models/feedback.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/v1/models/feedback',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ',
      },
      body: {
        modelId: 'test-model',
        issue: 'rate_limited',
      },
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgresql://user:password@host.example.com/db',
            BETTER_AUTH_URL: 'http://localhost:4321',
            BETTER_AUTH_SECRET: 'test-secret',
            GITHUB_CLIENT_ID: 'test-client-id',
            GITHUB_CLIENT_SECRET: 'test-client-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 401);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('Invalid Authorization format'));
  });

  it('includes CORS headers on error responses', async () => {
    const { POST } = await import('../../src/pages/api/v1/models/feedback.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/v1/models/feedback',
      method: 'POST',
      body: {
        modelId: 'test-model',
        issue: 'rate_limited',
      },
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgresql://user:password@host.example.com/db',
            BETTER_AUTH_URL: 'http://localhost:4321',
            BETTER_AUTH_SECRET: 'test-secret',
            GITHUB_CLIENT_ID: 'test-client-id',
            GITHUB_CLIENT_SECRET: 'test-client-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
  });

  it('returns 204 for OPTIONS request (CORS preflight)', async () => {
    const { OPTIONS } = await import('../../src/pages/api/v1/models/feedback.ts');

    const response = await OPTIONS({} as Parameters<typeof OPTIONS>[0]);

    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
  });
});
