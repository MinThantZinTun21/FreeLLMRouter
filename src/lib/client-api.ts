export interface ApiErrorPayload {
  error?: string;
  code?: string;
  requestId?: string;
}

export const NO_STORE_REQUEST_INIT = {
  cache: 'no-store' as RequestCache,
};

export async function parseApiError(response: Response, fallback: string): Promise<string> {
  const requestId = response.headers.get('X-Request-Id');
  const suffix = requestId ? ` (request ${requestId})` : '';
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const data = (await response.json()) as ApiErrorPayload;
      return `${data.error || fallback}${suffix}`;
    } catch {
      return `${fallback}${suffix}`;
    }
  }

  return `${fallback}${suffix}`;
}

export async function fetchJsonOrThrow<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await parseApiError(response, fallbackMessage));
  }
  return (await response.json()) as T;
}
