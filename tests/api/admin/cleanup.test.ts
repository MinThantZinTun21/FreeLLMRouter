import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext, parseJsonResponse } from '../../helpers.ts';

describe('/api/admin/cleanup', () => {
  it('returns 401 when X-Admin-Secret header is missing', async () => {
    const { POST } = await import('../../../src/pages/api/admin/cleanup.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/cleanup',
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
    const { POST } = await import('../../../src/pages/api/admin/cleanup.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/cleanup',
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

  it('returns 500 when ADMIN_SECRET is not configured', async () => {
    const { POST } = await import('../../../src/pages/api/admin/cleanup.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/cleanup',
      method: 'POST',
      locals: {
        runtime: {
          env: {
            DATABASE_URL: 'postgres://fake',
            DATABASE_URL_ADMIN: 'postgres://fake-admin',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 500);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('ADMIN_SECRET'));
  });

  it('returns 500 when database is not configured', async () => {
    const { POST } = await import('../../../src/pages/api/admin/cleanup.ts');

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/cleanup',
      method: 'POST',
      headers: {
        'X-Admin-Secret': 'correct-secret',
      },
      locals: {
        runtime: {
          env: {
            ADMIN_SECRET: 'correct-secret',
          },
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 500);
    const body = await parseJsonResponse<{ error: string }>(response);
    assert.ok(body.error.includes('Database'));
  });

  it('returns cleanup results with cutoff dates on success', async () => {
    const { POST } = await import('../../../src/pages/api/admin/cleanup.ts');

    let deleteCall = 0;
    const fixedNow = new Date('2025-01-15T12:00:00.000Z');
    const expectedFeedbackCutoff = new Date(
      fixedNow.getTime() - 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    const expectedLogsCutoff = new Date(
      fixedNow.getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/cleanup',
      method: 'POST',
      headers: {
        'X-Admin-Secret': 'correct-secret',
      },
      locals: {
        runtime: {
          env: {
            ADMIN_SECRET: 'correct-secret',
            DATABASE_URL: 'postgres://fake',
          },
        },
        cleanupDeps: {
          now: () => fixedNow,
          createDb: () => ({
            delete: () => ({
              where: async () => {
                deleteCall += 1;
                return { rowCount: deleteCall === 1 ? 3 : 7 };
              },
            }),
          }),
        },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    assert.strictEqual(response.status, 200);
    const body = await parseJsonResponse<{
      success: boolean;
      deleted: {
        modelFeedback: number;
        apiRequestLogs: number;
        availabilitySnapshots: number;
      };
      cutoffs: {
        modelFeedback: string;
        apiRequestLogs: string;
        availabilitySnapshots: string;
      };
    }>(response);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.deleted.modelFeedback, 3);
    assert.strictEqual(body.deleted.apiRequestLogs, 7);
    assert.ok(body.deleted.availabilitySnapshots !== undefined);
    assert.strictEqual(body.cutoffs.modelFeedback, expectedFeedbackCutoff);
    assert.strictEqual(body.cutoffs.apiRequestLogs, expectedLogsCutoff);
    assert.ok(body.cutoffs.availabilitySnapshots !== undefined);
  });

  it('returns 500 when cleanup fails', async () => {
    const { POST } = await import('../../../src/pages/api/admin/cleanup.ts');

    const originalError = console.error;
    console.error = () => {};
    const context = createMockContext({
      url: 'http://localhost:4321/api/admin/cleanup',
      method: 'POST',
      headers: {
        'X-Admin-Secret': 'correct-secret',
      },
      locals: {
        runtime: {
          env: {
            ADMIN_SECRET: 'correct-secret',
            DATABASE_URL: 'postgres://fake',
          },
        },
        cleanupDeps: {
          createDb: () => ({
            delete: () => ({
              where: async () => {
                throw new Error('boom');
              },
            }),
          }),
        },
      },
    });

    try {
      const response = await POST(context as Parameters<typeof POST>[0]);

      assert.strictEqual(response.status, 500);
      const body = await parseJsonResponse<{ error: string }>(response);
      assert.ok(body.error.includes('Cleanup failed'));
    } finally {
      console.error = originalError;
    }
  });
});
