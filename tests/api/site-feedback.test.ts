import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createMockContext } from '../helpers.ts';

describe('/api/site-feedback', () => {
  // Note: These tests focus on CORS and basic request handling
  // Full validation tests require mocking import.meta.env which isn't feasible
  // in module-cached code. Integration tests would cover validation paths.

  it('returns 204 for OPTIONS request (CORS preflight)', async () => {
    const { OPTIONS } = await import('../../src/pages/api/site-feedback.ts');

    const response = await OPTIONS({} as Parameters<typeof OPTIONS>[0]);

    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.strictEqual(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
  });

  it('includes CORS headers on error responses', async () => {
    const { POST } = await import('../../src/pages/api/site-feedback.ts');

    // This will fail at some point (IP rate limit, DB missing, validation, etc.)
    // but should always have CORS headers
    const context = createMockContext({
      url: 'http://localhost:4321/api/site-feedback',
      method: 'POST',
      body: {},
      headers: {
        'cf-connecting-ip': 'cors-test-ip', // Use unique IP to avoid rate limit
      },
      locals: {
        runtime: { env: {} },
      },
    });

    const response = await POST(context as Parameters<typeof POST>[0]);

    // Should have CORS headers regardless of error type
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), '*');
  });
});
