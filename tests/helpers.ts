/**
 * Test helpers for mocking Astro API context
 */

export interface MockContextOptions {
  url?: string;
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
  locals?: Record<string, unknown>;
}

/**
 * Create a mock Request object
 */
export function createMockRequest(options: MockContextOptions = {}): Request {
  const url = options.url || 'http://localhost:4321/api/test';
  const headers = new Headers(options.headers || {});
  const method = options.method || 'GET';

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.body && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(options.body);
    headers.set('Content-Type', 'application/json');
  }

  return new Request(url, init);
}

/**
 * Create a mock Astro APIContext
 * Cast through unknown to satisfy TypeScript when passing to route handlers
 */
export function createMockContext(options: MockContextOptions = {}) {
  const request = createMockRequest(options);
  const url = new URL(request.url);

  return {
    request,
    url,
    locals: options.locals || {},
    params: {},
    props: {},
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
    rewrite: () => Promise.resolve(new Response()),
    cookies: {
      get: () => undefined,
      has: () => false,
      set: () => {},
      delete: () => {},
      headers: () => [],
    },
    site: new URL('http://localhost:4321'),
    generator: 'test',
    clientAddress: '127.0.0.1',
    preferredLocale: undefined,
    preferredLocaleList: [],
    currentLocale: undefined,
    routePattern: '/api/test',
    // Astro 5 additions
    originPathname: url.pathname,
    getActionResult: () => undefined,
    callAction: async () => ({}),
    isPrerendered: false,
    csp: { nonce: '' },
  } as unknown;
}

/**
 * Parse JSON response body
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}
