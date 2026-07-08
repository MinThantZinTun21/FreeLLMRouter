import { bridgeProviders, createDb } from '@/db';

export const DEFAULT_BRIDGE_PROVIDERS = [
  {
    id: 'openrouter',
    name: 'openrouter',
    displayName: 'OpenRouter',
    directBaseUrl: 'https://openrouter.ai/api/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: null,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    directBaseUrl: 'https://api.openai.com/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'google',
    name: 'google',
    displayName: 'Google',
    directBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'meta-llama',
    name: 'meta-llama',
    displayName: 'Meta Llama',
    directBaseUrl: null,
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'mistralai',
    name: 'mistralai',
    displayName: 'Mistral AI',
    directBaseUrl: 'https://api.mistral.ai/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'qwen',
    name: 'qwen',
    displayName: 'Qwen',
    directBaseUrl: null,
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'deepseek',
    name: 'deepseek',
    displayName: 'DeepSeek',
    directBaseUrl: 'https://api.deepseek.com/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'groq',
    name: 'groq',
    displayName: 'Groq',
    directBaseUrl: 'https://api.groq.com/openai/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'together',
    name: 'together',
    displayName: 'Together AI',
    directBaseUrl: 'https://api.together.xyz/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
  {
    id: 'cohere',
    name: 'cohere',
    displayName: 'Cohere',
    directBaseUrl: 'https://api.cohere.ai/v1',
    defaultRpmLimit: 60,
    defaultDailyRequestLimit: 1000,
    defaultDailyTokenLimit: 100_000,
  },
] as const;

export async function seedBridgeProviders(dbUrl?: string): Promise<{ seeded: number }> {
  const url = dbUrl || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  const db = createDb(url);
  const now = new Date();

  for (const provider of DEFAULT_BRIDGE_PROVIDERS) {
    await db
      .insert(bridgeProviders)
      .values({
        ...provider,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: bridgeProviders.id,
        set: {
          displayName: provider.displayName,
          directBaseUrl: provider.directBaseUrl,
          defaultRpmLimit: provider.defaultRpmLimit,
          defaultDailyRequestLimit: provider.defaultDailyRequestLimit,
          defaultDailyTokenLimit: provider.defaultDailyTokenLimit,
          isActive: true,
          updatedAt: now,
        },
      });
  }

  return { seeded: DEFAULT_BRIDGE_PROVIDERS.length };
}
