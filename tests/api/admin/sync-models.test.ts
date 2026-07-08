import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../../helpers.ts';

describe('/api/admin/sync-models', () => {
  it('returns 401 when X-Admin-Secret header is missing', async () => {
    const { POST } = await import('../../../src/pages/api/admin/sync-models.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/sync-models',
      method: 'POST',
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgres://fake',
            DATABASE_URL_ADMIN: 'postgres://fake-admin',
            ADMIN_SECRET: 'test-admin-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 401);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('Unauthorized'));
  });

  it('returns 401 when X-Admin-Secret is incorrect', async () => {
    const { POST } = await import('../../../src/pages/api/admin/sync-models.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/sync-models',
      method: 'POST',
      headers: {
        'X-Admin-Secret': 'wrong-secret',
      },
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgres://fake',
            DATABASE_URL_ADMIN: 'postgres://fake-admin',
            ADMIN_SECRET: 'correct-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 401);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('Unauthorized'));
  });
});
