import type { ApiKeyPreferences } from '@/lib/api-definitions';

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse api_keys.metadata values that may come back as either:
 * - stringified JSON (text columns)
 * - already-parsed objects (json/jsonb columns)
 */
export function parseApiKeyMetadata(raw: unknown): JsonRecord {
  if (!raw) return {};

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return isJsonRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isJsonRecord(raw) ? raw : {};
}

export function extractApiKeyPreferences(rawMetadata: unknown): ApiKeyPreferences {
  const metadata = parseApiKeyMetadata(rawMetadata);
  const preferences = metadata.preferences;
  return isJsonRecord(preferences) ? (preferences as ApiKeyPreferences) : {};
}
