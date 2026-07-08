import { and, desc, eq } from 'drizzle-orm';
import { bridgeProviders, createDb, freeModels, modelCatalogFree, type FreeModel } from '@/db';
import type { BridgeRouteType, CatalogModel, RouteFeatureRequirements } from './types';

const FREE_CATALOG_URL = 'https://freellm.net/models/?free=1';

function db(url?: string) {
  const dbUrl = url || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL || '';
  if (!dbUrl) throw new Error('Missing DATABASE_URL');
  return createDb(dbUrl);
}

function parseModelIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  const regex = /\/models\/([A-Za-z0-9._/:-]+)(?=["/?#\s])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const id = decodeURIComponent(match[1]).trim();
    if (id && id.includes('/')) ids.add(id);
  }
  return [...ids];
}

export function deriveProvider(modelId: string): string {
  return modelId.split('/')[0] || 'unknown';
}

export function deriveRouteTypes(model: FreeModel): BridgeRouteType[] {
  const outputs = model.outputModalities || [];
  const inputs = model.inputModalities || [];

  if (outputs.some((m) => m.toLowerCase().includes('embed'))) {
    return ['embeddings'];
  }

  const types: BridgeRouteType[] = [];
  if (inputs.some((m) => m.toLowerCase().includes('image'))) {
    types.push('vision');
  }
  if (outputs.some((m) => m.toLowerCase().includes('text')) || outputs.length === 0) {
    types.push('chat');
  }
  return types.length > 0 ? types : ['chat'];
}

function supportsTools(model: FreeModel): boolean {
  return (model.supportedParameters || []).some((p) => p === 'tools' || p === 'tool_choice');
}

function supportsJsonMode(model: FreeModel): boolean {
  return (model.supportedParameters || []).some(
    (p) => p === 'response_format' || p === 'structured_outputs'
  );
}

async function getProviderDefaults(providerName: string, database = db()) {
  const rows = await database
    .select()
    .from(bridgeProviders)
    .where(eq(bridgeProviders.name, providerName))
    .limit(1);
  const row = rows[0];
  return {
    rpmLimit: row?.defaultRpmLimit ?? 60,
    dailyRequestLimit: row?.defaultDailyRequestLimit ?? null,
    dailyTokenLimit: row?.defaultDailyTokenLimit ?? 100_000,
  };
}

export async function syncBridgeCatalogFromFreeModels(
  databaseUrl?: string
): Promise<{ imported: number }> {
  const database = db(databaseUrl);
  const models = await database.select().from(freeModels).where(eq(freeModels.isActive, true));
  const now = new Date();
  let imported = 0;

  for (const model of models) {
    const provider = deriveProvider(model.id);
    const defaults = await getProviderDefaults(provider, database);
    const routeTypes = deriveRouteTypes(model);

    for (const routeType of routeTypes) {
      const rowId = `bridge_${routeType}_${model.id}`;
      await database
        .insert(modelCatalogFree)
        .values({
          id: rowId,
          provider,
          modelId: model.id,
          routeType,
          supportsTools: supportsTools(model),
          supportsJsonMode: supportsJsonMode(model),
          maxContext: model.contextLength,
          maxOutput: model.maxCompletionTokens,
          rpmLimit: defaults.rpmLimit,
          dailyRequestLimit: defaults.dailyRequestLimit,
          dailyTokenLimit: defaults.dailyTokenLimit,
          sourceUrl: 'free_models',
          sourceUpdatedAt: now,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: modelCatalogFree.id,
          set: {
            provider,
            modelId: model.id,
            routeType,
            supportsTools: supportsTools(model),
            supportsJsonMode: supportsJsonMode(model),
            maxContext: model.contextLength,
            maxOutput: model.maxCompletionTokens,
            sourceUrl: 'free_models',
            sourceUpdatedAt: now,
            isActive: true,
            updatedAt: now,
          },
        });
      imported++;
    }
  }

  return { imported };
}

export async function refreshCatalogFromFreellm(): Promise<{ imported: number }> {
  const database = db();
  const response = await fetch(FREE_CATALOG_URL, { headers: { Accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(`freellm fetch failed (${response.status})`);
  }
  const html = await response.text();
  const modelIds = parseModelIdsFromHtml(html);
  if (modelIds.length === 0) {
    throw new Error('No model IDs parsed from freellm catalog');
  }

  const now = new Date();
  for (const modelId of modelIds) {
    const provider = deriveProvider(modelId);
    const defaults = await getProviderDefaults(provider, database);
    const rowId = `freellm_chat_${modelId}`;
    await database
      .insert(modelCatalogFree)
      .values({
        id: rowId,
        provider,
        modelId,
        routeType: 'chat',
        rpmLimit: defaults.rpmLimit,
        dailyRequestLimit: defaults.dailyRequestLimit,
        dailyTokenLimit: defaults.dailyTokenLimit,
        sourceUrl: FREE_CATALOG_URL,
        sourceUpdatedAt: now,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: modelCatalogFree.id,
        set: {
          provider,
          modelId,
          sourceUpdatedAt: now,
          isActive: true,
          updatedAt: now,
        },
      });
  }

  return { imported: modelIds.length };
}

export async function refreshBridgeCatalog(): Promise<{ imported: number; source: string }> {
  if (process.env.BRIDGE_CATALOG_SCRAPE_FALLBACK === '1') {
    const result = await refreshCatalogFromFreellm();
    return { ...result, source: 'freellm-scrape' };
  }
  const result = await syncBridgeCatalogFromFreeModels();
  return { ...result, source: 'free_models' };
}

export async function getCandidateModels(
  routeType: BridgeRouteType,
  requirements: RouteFeatureRequirements
): Promise<CatalogModel[]> {
  const database = db(process.env.DATABASE_URL);

  const rows = await database
    .select()
    .from(modelCatalogFree)
    .where(and(eq(modelCatalogFree.routeType, routeType), eq(modelCatalogFree.isActive, true)))
    .orderBy(desc(modelCatalogFree.updatedAt));

  return rows
    .filter((row) => {
      if (requirements.tools && !row.supportsTools) return false;
      if (requirements.jsonMode && !row.supportsJsonMode) return false;
      if (requirements.minContext && (row.maxContext || 0) < requirements.minContext) return false;
      if (requirements.minOutput && (row.maxOutput || 0) < requirements.minOutput) return false;
      return true;
    })
    .map((row) => ({
      catalogId: row.id,
      provider: row.provider,
      modelId: row.modelId,
      routeType: row.routeType as BridgeRouteType,
      supportsTools: row.supportsTools,
      supportsJsonMode: row.supportsJsonMode,
      maxContext: row.maxContext ?? null,
      maxOutput: row.maxOutput ?? null,
      rpmLimit: row.rpmLimit,
      dailyRequestLimit: row.dailyRequestLimit,
      dailyTokenLimit: row.dailyTokenLimit,
    }));
}

export async function getCatalogModelById(
  modelId: string,
  routeType: BridgeRouteType
): Promise<CatalogModel | null> {
  const database = db(process.env.DATABASE_URL);
  const rows = await database
    .select()
    .from(modelCatalogFree)
    .where(
      and(
        eq(modelCatalogFree.modelId, modelId),
        eq(modelCatalogFree.routeType, routeType),
        eq(modelCatalogFree.isActive, true)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    catalogId: row.id,
    provider: row.provider,
    modelId: row.modelId,
    routeType: row.routeType as BridgeRouteType,
    supportsTools: row.supportsTools,
    supportsJsonMode: row.supportsJsonMode,
    maxContext: row.maxContext ?? null,
    maxOutput: row.maxOutput ?? null,
    rpmLimit: row.rpmLimit,
    dailyRequestLimit: row.dailyRequestLimit,
    dailyTokenLimit: row.dailyTokenLimit,
  };
}

export async function listCatalogWithStatus(filters?: { routeType?: string; provider?: string }) {
  const database = db(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL);
  const rows = await database
    .select()
    .from(modelCatalogFree)
    .orderBy(desc(modelCatalogFree.updatedAt));

  return rows
    .filter((row) => {
      if (filters?.routeType && row.routeType !== filters.routeType) return false;
      if (filters?.provider && row.provider !== filters.provider) return false;
      return true;
    })
    .map((row) => ({
      id: row.id,
      provider: row.provider,
      modelId: row.modelId,
      routeType: row.routeType,
      supportsTools: row.supportsTools,
      supportsJsonMode: row.supportsJsonMode,
      maxContext: row.maxContext,
      maxOutput: row.maxOutput,
      rpmLimit: row.rpmLimit,
      dailyRequestLimit: row.dailyRequestLimit,
      dailyTokenLimit: row.dailyTokenLimit,
      isActive: row.isActive,
      updatedAt: row.updatedAt,
    }));
}

export async function updateCatalogLimits(
  id: string,
  limits: { rpmLimit?: number; dailyRequestLimit?: number | null; dailyTokenLimit?: number }
) {
  const database = db(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL);
  await database
    .update(modelCatalogFree)
    .set({
      ...(limits.rpmLimit !== undefined ? { rpmLimit: limits.rpmLimit } : {}),
      ...(limits.dailyRequestLimit !== undefined
        ? { dailyRequestLimit: limits.dailyRequestLimit }
        : {}),
      ...(limits.dailyTokenLimit !== undefined ? { dailyTokenLimit: limits.dailyTokenLimit } : {}),
      updatedAt: new Date(),
    })
    .where(eq(modelCatalogFree.id, id));
}

export async function listBridgeProviders() {
  const database = db(process.env.DATABASE_URL);
  const providers = await database
    .select()
    .from(bridgeProviders)
    .where(eq(bridgeProviders.isActive, true));
  const catalog = await database
    .select()
    .from(modelCatalogFree)
    .where(eq(modelCatalogFree.isActive, true));

  const counts = new Map<string, number>();
  for (const row of catalog) {
    counts.set(row.provider, (counts.get(row.provider) || 0) + 1);
  }

  return providers.map((provider) => ({
    name: provider.name,
    displayName: provider.displayName,
    directBaseUrl: provider.directBaseUrl,
    modelCount: counts.get(provider.name) || 0,
    defaultRpmLimit: provider.defaultRpmLimit,
    defaultDailyRequestLimit: provider.defaultDailyRequestLimit,
    defaultDailyTokenLimit: provider.defaultDailyTokenLimit,
  }));
}
