/**
 * Shared utilities for API routes.
 * Centralizes common patterns like IP extraction, rate limiting, and origin checking.
 */

/**
 * Extract client IP from Cloudflare/proxy headers.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Create a rate limiter with its own in-memory store.
 * Each call returns an independent limiter (useful for different limits per endpoint).
 *
 * Note: In-memory limiters are per-instance only (Cloudflare Workers are stateless).
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): { limited: boolean; retryAfter: number } {
      const now = Date.now();
      const entry = requests.get(key);

      if (!entry || now > entry.resetAt) {
        requests.set(key, { count: 1, resetAt: now + windowMs });
        return { limited: false, retryAfter: 0 };
      }

      entry.count += 1;
      if (entry.count > limit) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { limited: true, retryAfter };
      }

      return { limited: false, retryAfter: 0 };
    },
  };
}

/**
 * Create a cooldown tracker (single use per key within window).
 * Useful for per-email or per-user cooldowns.
 */
export function createCooldownTracker(cooldownMs: number) {
  const cooldowns = new Map<string, number>();

  return {
    check(key: string): { limited: boolean; retryAfter: number } {
      const now = Date.now();
      const cooldownUntil = cooldowns.get(key.toLowerCase());

      if (cooldownUntil && now < cooldownUntil) {
        const retryAfter = Math.ceil((cooldownUntil - now) / 1000);
        return { limited: true, retryAfter };
      }

      return { limited: false, retryAfter: 0 };
    },

    set(key: string): void {
      cooldowns.set(key.toLowerCase(), Date.now() + cooldownMs);
    },
  };
}

/**
 * Check if request origin/referer is in the allowed list.
 * Returns true if:
 * - No origin AND no referer (server-side calls, direct navigation)
 * - Origin or referer starts with an allowed origin
 */
export function isAllowedOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Allow if no origin/referer (server-side calls, direct browser navigation)
  if (!origin && !referer) return true;

  if (origin && allowedOrigins.some((allowed) => origin.startsWith(allowed))) return true;
  if (referer && allowedOrigins.some((allowed) => referer.startsWith(allowed))) return true;

  return false;
}
