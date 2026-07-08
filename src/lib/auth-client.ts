import { useEffect, useState } from 'react';
import { createAuthClient } from 'better-auth/react';
import { apiKeyClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [apiKeyClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

export type Session = typeof authClient.$Infer.Session;

type SessionCache = {
  data: Session | null | undefined;
  promise?: Promise<Session | null>;
};

const SESSION_CACHE_KEY = '__free_models_session_cache__';

function getSessionCache(): SessionCache | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const w = window as Window & { [SESSION_CACHE_KEY]?: SessionCache };
  if (!w[SESSION_CACHE_KEY]) {
    w[SESSION_CACHE_KEY] = { data: undefined };
  }
  return w[SESSION_CACHE_KEY]!;
}

async function fetchSession(cache: SessionCache): Promise<Session | null> {
  if (!cache.promise) {
    cache.promise = authClient.getSession().then((result) => {
      const session = result.data ?? null;
      cache.data = session;
      cache.promise = undefined;
      return session;
    });
  }

  return cache.promise;
}

export function useCachedSession() {
  const cache = getSessionCache();
  const initialData = cache?.data;
  const [data, setData] = useState<Session | null | undefined>(initialData);
  const [isPending, setIsPending] = useState(initialData === undefined);

  useEffect(() => {
    if (!cache || cache.data !== undefined) {
      setIsPending(false);
      return;
    }

    fetchSession(cache)
      .then((session) => {
        setData(session);
      })
      .catch(() => {
        cache.data = null;
        setData(null);
      })
      .finally(() => {
        setIsPending(false);
      });
  }, []);

  const refetch = async () => {
    if (!cache) {
      return;
    }
    cache.data = undefined;
    setIsPending(true);
    const session = await fetchSession(cache);
    setData(session);
    setIsPending(false);
  };

  return { data: data ?? null, isPending, refetch };
}

export const { signIn, signOut } = authClient;

// Wrapper for key creation that uses the server-side limit endpoint
export async function createApiKeyWithLimit(name: string): Promise<{
  key?: string;
  error?: { message: string };
}> {
  const response = await fetch('/api/auth/api-key/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, expiresIn: null }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { error: { message: data.error || 'Failed to create API key' } };
  }

  return data;
}
