import { eq, and, notInArray, gte, sql, type SQL } from 'drizzle-orm';
import {
  freeModels,
  modelFeedback,
  syncMeta,
  modelAvailabilitySnapshots,
  type Database,
  getFeedbackCounts as getFeedbackCountsStats,
  getErrorTimeline as getErrorTimelineStats,
  createDb,
} from '../db';
import {
  type UseCaseType,
  type SortType,
  validateUseCases,
  validateSort,
  filterModelsByUseCase,
  sortModels,
} from '../lib/model-types';
import { type TimeRange, TIME_RANGE_MS, DEFAULT_TIME_RANGE } from '../lib/api-definitions';

// Re-export types and validation functions for backwards compatibility
export { type UseCaseType, type SortType, validateUseCases, validateSort };
export { type TimeRange };

interface OpenRouterApiModel {
  id: string;
  name: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  context_length?: number;
  description?: string;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  supported_parameters?: string[];
}

export interface SyncResult {
  totalApiModels: number;
  freeModelsFound: number;
  inserted: number;
  updated: number;
  markedInactive: number;
  error?: string;
}

function isFreeModel(model: OpenRouterApiModel): boolean {
  const promptCost = parseFloat(model.pricing?.prompt || '999');
  const completionCost = parseFloat(model.pricing?.completion || '999');
  return promptCost === 0 && completionCost === 0;
}

export async function fetchFreeModelsFromOpenRouter(): Promise<OpenRouterApiModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const allModels: OpenRouterApiModel[] = data.data || [];

  return allModels.filter(isFreeModel);
}

export async function syncModels(db: Database): Promise<SyncResult> {
  const result: SyncResult = {
    totalApiModels: 0,
    freeModelsFound: 0,
    inserted: 0,
    updated: 0,
    markedInactive: 0,
  };

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const allModels: OpenRouterApiModel[] = data.data || [];
    result.totalApiModels = allModels.length;

    const freeModelsList = allModels.filter(isFreeModel);
    result.freeModelsFound = freeModelsList.length;

    // Get existing model IDs
    const existingModels = await db.select({ id: freeModels.id }).from(freeModels);
    const existingIds = new Set(existingModels.map((m) => m.id));

    const seenIds: string[] = [];

    // Upsert each model
    for (const model of freeModelsList) {
      seenIds.push(model.id);
      const isNew = !existingIds.has(model.id);

      const modelData = {
        id: model.id,
        name: model.name,
        contextLength: model.context_length,
        maxCompletionTokens: model.top_provider?.max_completion_tokens,
        description: model.description,
        modality: model.architecture?.modality,
        inputModalities: model.architecture?.input_modalities,
        outputModalities: model.architecture?.output_modalities,
        supportedParameters: model.supported_parameters,
        isModerated: model.top_provider?.is_moderated,
        isActive: true,
        lastSeenAt: new Date(),
      };

      await db
        .insert(freeModels)
        .values(modelData)
        .onConflictDoUpdate({
          target: freeModels.id,
          set: {
            name: modelData.name,
            contextLength: modelData.contextLength,
            maxCompletionTokens: modelData.maxCompletionTokens,
            description: modelData.description,
            modality: modelData.modality,
            inputModalities: modelData.inputModalities,
            outputModalities: modelData.outputModalities,
            supportedParameters: modelData.supportedParameters,
            isModerated: modelData.isModerated,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });

      if (isNew) {
        result.inserted++;
      } else {
        result.updated++;
      }
    }

    // Mark missing models as inactive (safety: only if we got >50% of known models)
    const activeCount = existingModels.filter((m) => existingIds.has(m.id)).length;
    if (seenIds.length >= activeCount * 0.5 || activeCount === 0) {
      if (seenIds.length > 0) {
        const updateResult = await db
          .update(freeModels)
          .set({ isActive: false })
          .where(and(eq(freeModels.isActive, true), notInArray(freeModels.id, seenIds)));

        result.markedInactive = updateResult.rowCount ?? 0;
      }
    }

    // Update sync metadata
    await db
      .insert(syncMeta)
      .values({
        key: 'models_last_updated',
        value: new Date().toISOString(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: syncMeta.key,
        set: { value: new Date().toISOString(), updatedAt: new Date() },
      });

    // Record daily availability snapshot for all seen models
    try {
      await recordDailyAvailabilitySnapshot(db, seenIds);
    } catch (snapshotError) {
      console.error('[OpenRouterSync] Snapshot write failed:', snapshotError);
    }

    return result;
  } catch (error) {
    console.error('[OpenRouterSync] Sync failed:', error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

/**
 * Records a daily availability snapshot for models seen during sync.
 * Uses composite key {modelId}_{YYYY-MM-DD} to ensure one record per model per day.
 * Multiple syncs per day will update the same record.
 */
export async function recordDailyAvailabilitySnapshot(
  db: Database,
  seenModelIds: string[]
): Promise<{ recorded: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD

  let recorded = 0;

  for (const modelId of seenModelIds) {
    const snapshotId = `${modelId}_${dateString}`;

    await db
      .insert(modelAvailabilitySnapshots)
      .values({
        id: snapshotId,
        modelId,
        snapshotDate: today,
        isAvailable: true,
      })
      .onConflictDoUpdate({
        target: modelAvailabilitySnapshots.id,
        set: { isAvailable: true },
      });

    recorded++;
  }

  return { recorded };
}

export async function getLastUpdated(db: Database): Promise<Date | null> {
  const result = await db
    .select({ value: syncMeta.value, updatedAt: syncMeta.updatedAt })
    .from(syncMeta)
    .where(eq(syncMeta.key, 'models_last_updated'))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return result[0].updatedAt;
}

export async function getActiveModels(db: Database) {
  return db
    .select({
      id: freeModels.id,
      name: freeModels.name,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
      description: freeModels.description,
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      outputModalities: freeModels.outputModalities,
      supportedParameters: freeModels.supportedParameters,
      isModerated: freeModels.isModerated,
      lastSeenAt: freeModels.lastSeenAt,
      createdAt: freeModels.createdAt,
    })
    .from(freeModels)
    .where(eq(freeModels.isActive, true));
}

/**
 * Get all active models with issue counts attached.
 * Used by getFilteredModels to enable shared filtering/sorting logic.
 */
async function getActiveModelsWithFeedback(
  db: Database,
  timeRange: TimeRange = DEFAULT_TIME_RANGE,
  userId?: string,
  statsDbUrl?: string
) {
  const models = await getActiveModels(db);
  const feedbackCounts = await getRecentFeedbackCounts(db, timeRange, userId, statsDbUrl);

  // Attach issueCount to each model (same logic as frontend)
  return models.map((model) => {
    const feedback = feedbackCounts[model.id];
    const issueCount = feedback ? feedback.rateLimited + feedback.unavailable + feedback.error : 0;
    const errorRate = feedback ? feedback.errorRate : 0;
    return { ...model, issueCount, errorRate };
  });
}

/**
 * Get filtered and sorted models using shared logic from model-types.ts.
 * Single source of truth - same functions used by frontend and backend.
 * Optionally filters out models with error rate above the threshold.
 *
 * @param useCases - Use cases to filter by (chat, vision, tools, etc.)
 * @param sort - Sort order
 * @param maxErrorRate - Maximum error rate percentage (0-100). Models with higher error rate are excluded.
 * @param timeRange - Time range for calculating error rates
 */
export async function getFilteredModels(
  db: Database,
  useCases: UseCaseType[],
  sort: SortType,
  maxErrorRate?: number,
  timeRange: TimeRange = DEFAULT_TIME_RANGE,
  userId?: string,
  statsDbUrl?: string
) {
  const allModels = await getActiveModelsWithFeedback(db, timeRange, userId, statsDbUrl);
  const filtered = filterModelsByUseCase(allModels, useCases);
  const sorted = sortModels(filtered, sort);

  // Apply error rate threshold filtering if specified
  if (maxErrorRate !== undefined) {
    const feedbackCounts = await getRecentFeedbackCounts(db, timeRange, userId, statsDbUrl);
    return sorted.filter((model) => {
      const feedback = feedbackCounts[model.id];
      if (!feedback) return true; // No feedback = keep model (0% error rate)
      return feedback.errorRate <= maxErrorRate;
    });
  }

  return sorted;
}

// Staleness thresholds for model data
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour - data considered stale, headers added
const CRITICAL_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours - triggers fallback sync
const SYNC_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes - lock expiration for crashed syncs

const FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface FeedbackCounts {
  [modelId: string]: {
    rateLimited: number;
    unavailable: number;
    error: number;
    successCount: number;
    errorRate: number;
  };
}

export async function getRecentFeedbackCounts(
  db: Database,
  timeRange: TimeRange = DEFAULT_TIME_RANGE,
  userId?: string,
  statsDbUrl?: string
): Promise<FeedbackCounts> {
  const windowMs = TIME_RANGE_MS[timeRange];
  const cutoff = windowMs !== null ? new Date(Date.now() - windowMs) : new Date(0);

  if (!userId && statsDbUrl) {
    const endTs = new Date();
    const startTs = windowMs !== null ? new Date(Date.now() - windowMs) : new Date(0);
    const rows = await getFeedbackCountsStats(statsDbUrl, startTs, endTs);

    const counts: FeedbackCounts = {};
    for (const row of rows) {
      if (!counts[row.modelId]) {
        counts[row.modelId] = {
          rateLimited: 0,
          unavailable: 0,
          error: 0,
          successCount: 0,
          errorRate: 0,
        };
      }

      if (row.isSuccess) {
        counts[row.modelId].successCount += row.count;
      } else if (row.issue === 'rate_limited') {
        counts[row.modelId].rateLimited += row.count;
      } else if (row.issue === 'unavailable') {
        counts[row.modelId].unavailable += row.count;
      } else if (row.issue === 'error') {
        counts[row.modelId].error += row.count;
      }
    }

    for (const modelId in counts) {
      const c = counts[modelId];
      const errorCount = c.rateLimited + c.unavailable + c.error;
      const total = c.successCount + errorCount;
      c.errorRate = total > 0 ? Math.round((errorCount / total) * 10000) / 100 : 0;
    }

    return counts;
  }

  const whereConditions = [gte(modelFeedback.createdAt, cutoff)];
  if (userId) {
    whereConditions.push(eq(modelFeedback.source, userId));
  }

  const results = await db
    .select({
      modelId: modelFeedback.modelId,
      issue: modelFeedback.issue,
      isSuccess: modelFeedback.isSuccess,
      count: sql<number>`count(*)::int`,
    })
    .from(modelFeedback)
    .where(and(...whereConditions))
    .groupBy(modelFeedback.modelId, modelFeedback.issue, modelFeedback.isSuccess);

  const counts: FeedbackCounts = {};

  for (const row of results) {
    if (!counts[row.modelId]) {
      counts[row.modelId] = {
        rateLimited: 0,
        unavailable: 0,
        error: 0,
        successCount: 0,
        errorRate: 0,
      };
    }

    if (row.isSuccess) {
      counts[row.modelId].successCount += row.count;
    } else if (row.issue === 'rate_limited') {
      counts[row.modelId].rateLimited += row.count;
    } else if (row.issue === 'unavailable') {
      counts[row.modelId].unavailable += row.count;
    } else if (row.issue === 'error') {
      counts[row.modelId].error += row.count;
    }
  }

  // Calculate error rates
  for (const modelId in counts) {
    const c = counts[modelId];
    const errorCount = c.rateLimited + c.unavailable + c.error;
    const total = c.successCount + errorCount;
    c.errorRate = total > 0 ? Math.round((errorCount / total) * 10000) / 100 : 0;
  }

  return counts;
}

export interface IssueSummary {
  modelId: string;
  modelName: string;
  rateLimited: number;
  unavailable: number;
  error: number;
  total: number;
  successCount: number;
  errorRate: number; // percentage 0-100
  // Model metadata for filtering
  modality: string | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  supportedParameters: string[] | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
}

export interface HealthFilterOptions {
  range: TimeRange;
  userId?: string;
  statsDbUrl?: string;
  useCases?: UseCaseType[];
  sort?: SortType;
  topN?: number;
  maxErrorRate?: number;
}

export async function getFeedbackCountsByRange(
  db: Database,
  options: HealthFilterOptions
): Promise<IssueSummary[]> {
  const { range, userId, statsDbUrl, useCases, sort, topN, maxErrorRate } = options;
  const windowMs = TIME_RANGE_MS[range];

  if (!userId && statsDbUrl) {
    const endTs = new Date();
    const startTs = windowMs !== null ? new Date(Date.now() - windowMs) : new Date(0);
    const rows = await getFeedbackCountsStats(statsDbUrl, startTs, endTs);

    const statsDb = createDb(statsDbUrl);
    const modelRows = await statsDb
      .select({
        id: freeModels.id,
        name: freeModels.name,
        modality: freeModels.modality,
        inputModalities: freeModels.inputModalities,
        outputModalities: freeModels.outputModalities,
        supportedParameters: freeModels.supportedParameters,
        contextLength: freeModels.contextLength,
        maxCompletionTokens: freeModels.maxCompletionTokens,
      })
      .from(freeModels);

    const modelMap = new Map<string, (typeof modelRows)[number]>();
    for (const model of modelRows) {
      modelMap.set(model.id, model);
    }

    const summaryMap: Record<string, IssueSummary> = {};
    for (const row of rows) {
      if (!summaryMap[row.modelId]) {
        const model = modelMap.get(row.modelId);
        summaryMap[row.modelId] = {
          modelId: row.modelId,
          modelName: model?.name ?? row.modelId,
          rateLimited: 0,
          unavailable: 0,
          error: 0,
          total: 0,
          successCount: 0,
          errorRate: 0,
          modality: model?.modality ?? null,
          inputModalities: model?.inputModalities ?? null,
          outputModalities: model?.outputModalities ?? null,
          supportedParameters: model?.supportedParameters ?? null,
          contextLength: model?.contextLength ?? null,
          maxCompletionTokens: model?.maxCompletionTokens ?? null,
        };
      }

      if (row.isSuccess) {
        summaryMap[row.modelId].successCount += row.count;
      } else if (row.issue === 'rate_limited') {
        summaryMap[row.modelId].rateLimited += row.count;
        summaryMap[row.modelId].total += row.count;
      } else if (row.issue === 'unavailable') {
        summaryMap[row.modelId].unavailable += row.count;
        summaryMap[row.modelId].total += row.count;
      } else if (row.issue === 'error') {
        summaryMap[row.modelId].error += row.count;
        summaryMap[row.modelId].total += row.count;
      }
    }

    for (const modelId in summaryMap) {
      const summary = summaryMap[modelId];
      const totalReports = summary.successCount + summary.total;
      summary.errorRate =
        totalReports > 0 ? Math.round((summary.total / totalReports) * 10000) / 100 : 0;
    }

    let summaries = Object.values(summaryMap);
    if (useCases && useCases.length > 0) {
      summaries = filterModelsByUseCase(summaries, useCases);
    }
    if (maxErrorRate !== undefined) {
      summaries = summaries.filter((s) => s.errorRate <= maxErrorRate);
    }
    if (sort) {
      summaries = sortModels(summaries, sort);
    } else {
      summaries.sort((a, b) => b.total - a.total);
    }
    if (topN !== undefined && topN > 0) {
      summaries = summaries.slice(0, topN);
    }

    return summaries;
  }

  // Build where conditions
  const whereConditions: SQL[] = [];
  if (windowMs !== null) {
    whereConditions.push(gte(modelFeedback.createdAt, new Date(Date.now() - windowMs)));
  }
  if (userId) {
    whereConditions.push(eq(modelFeedback.source, userId));
  }

  const baseQuery = db
    .select({
      modelId: modelFeedback.modelId,
      modelName: freeModels.name,
      issue: modelFeedback.issue,
      isSuccess: modelFeedback.isSuccess,
      count: sql<number>`count(*)::int`,
      // Model metadata for filtering
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      outputModalities: freeModels.outputModalities,
      supportedParameters: freeModels.supportedParameters,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
    })
    .from(modelFeedback)
    .leftJoin(freeModels, eq(modelFeedback.modelId, freeModels.id))
    .groupBy(
      modelFeedback.modelId,
      freeModels.name,
      modelFeedback.issue,
      modelFeedback.isSuccess,
      freeModels.modality,
      freeModels.inputModalities,
      freeModels.outputModalities,
      freeModels.supportedParameters,
      freeModels.contextLength,
      freeModels.maxCompletionTokens
    );

  const query = whereConditions.length > 0 ? baseQuery.where(and(...whereConditions)) : baseQuery;
  const results = await query;

  // Aggregate into IssueSummary array
  const summaryMap: Record<string, IssueSummary> = {};

  for (const row of results) {
    if (!summaryMap[row.modelId]) {
      summaryMap[row.modelId] = {
        modelId: row.modelId,
        modelName: row.modelName ?? row.modelId,
        rateLimited: 0,
        unavailable: 0,
        error: 0,
        total: 0,
        successCount: 0,
        errorRate: 0,
        modality: row.modality,
        inputModalities: row.inputModalities,
        outputModalities: row.outputModalities,
        supportedParameters: row.supportedParameters,
        contextLength: row.contextLength,
        maxCompletionTokens: row.maxCompletionTokens,
      };
    }

    if (row.isSuccess) {
      summaryMap[row.modelId].successCount += row.count;
    } else if (row.issue === 'rate_limited') {
      summaryMap[row.modelId].rateLimited += row.count;
      summaryMap[row.modelId].total += row.count;
    } else if (row.issue === 'unavailable') {
      summaryMap[row.modelId].unavailable += row.count;
      summaryMap[row.modelId].total += row.count;
    } else if (row.issue === 'error') {
      summaryMap[row.modelId].error += row.count;
      summaryMap[row.modelId].total += row.count;
    }
  }

  // Calculate error rates
  for (const modelId in summaryMap) {
    const summary = summaryMap[modelId];
    const totalReports = summary.successCount + summary.total;
    summary.errorRate =
      totalReports > 0 ? Math.round((summary.total / totalReports) * 10000) / 100 : 0;
  }

  let summaries = Object.values(summaryMap);

  // Apply use case filtering (client-side since it's post-aggregation)
  if (useCases && useCases.length > 0) {
    summaries = filterModelsByUseCase(summaries, useCases);
  }

  // Apply max error rate filter
  if (maxErrorRate !== undefined) {
    summaries = summaries.filter((s) => s.errorRate <= maxErrorRate);
  }

  // Apply sorting
  if (sort) {
    summaries = sortModels(summaries, sort);
  } else {
    // Default: sort by total issues descending
    summaries.sort((a, b) => b.total - a.total);
  }

  // Apply topN limit
  if (topN !== undefined && topN > 0) {
    summaries = summaries.slice(0, topN);
  }

  return summaries;
}

export async function getModelsWithLazyRefresh(db: Database) {
  const lastUpdated = await getLastUpdated(db);

  // If no data or stale, sync first
  if (!lastUpdated || Date.now() - lastUpdated.getTime() > STALE_THRESHOLD_MS) {
    await syncModels(db);
  }

  const models = await getActiveModels(db);
  const updatedAt = await getLastUpdated(db);

  return {
    models,
    lastUpdated: updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

/**
 * Check if models data is fresh enough.
 * Returns staleness info but NEVER triggers sync - that's done by the admin endpoint or fallback.
 */
export async function checkModelsFreshness(db: Database): Promise<{
  isFresh: boolean;
  isCriticallyStale: boolean;
  lastUpdated: Date | null;
  ageMs: number;
}> {
  const lastUpdated = await getLastUpdated(db);

  if (!lastUpdated) {
    return { isFresh: false, isCriticallyStale: true, lastUpdated: null, ageMs: Infinity };
  }

  const ageMs = Date.now() - lastUpdated.getTime();
  return {
    isFresh: ageMs <= STALE_THRESHOLD_MS,
    isCriticallyStale: ageMs > CRITICAL_STALE_THRESHOLD_MS,
    lastUpdated,
    ageMs,
  };
}

/**
 * Try to acquire sync lock using sync_meta table.
 * Uses 'sync_in_progress' key with timestamp to implement distributed locking.
 */
async function tryAcquireSyncLock(db: Database): Promise<boolean> {
  const now = new Date();

  // Check if sync is already in progress
  const [lockRow] = await db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.key, 'sync_in_progress'))
    .limit(1);

  if (lockRow?.value === 'true' && lockRow.updatedAt) {
    // Check if lock has expired (stale lock from crashed sync)
    const lockAge = now.getTime() - lockRow.updatedAt.getTime();
    if (lockAge < SYNC_LOCK_DURATION_MS) {
      return false; // Lock is still valid
    }
    // Lock expired, continue to acquire
  }

  // Acquire lock
  await db
    .insert(syncMeta)
    .values({
      key: 'sync_in_progress',
      value: 'true',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { value: 'true', updatedAt: now },
    });

  return true;
}

/**
 * Release sync lock after sync completes.
 */
async function releaseSyncLock(db: Database): Promise<void> {
  await db
    .update(syncMeta)
    .set({ value: 'false', updatedAt: new Date() })
    .where(eq(syncMeta.key, 'sync_in_progress'));
}

/**
 * Sync models with distributed lock to prevent thundering herd.
 * Returns true if sync was performed, false if skipped (lock not acquired or data fresh).
 */
export async function ensureFreshModels(db: Database): Promise<boolean> {
  const freshness = await checkModelsFreshness(db);

  // Only sync if critically stale (>2 hours)
  if (!freshness.isCriticallyStale) {
    return false;
  }

  // Try to acquire lock
  const lockAcquired = await tryAcquireSyncLock(db);
  if (!lockAcquired) {
    // Another process is syncing, don't block
    return false;
  }

  try {
    await syncModels(db);
    return true;
  } finally {
    await releaseSyncLock(db);
  }
}

// Timeline data for a single model at a point in time
export interface TimelineModelData {
  errorRate: number;
  errorCount: number;
  totalCount: number;
}

// Timeline data point for charts
export interface TimelinePoint {
  date: string;
  [modelId: string]: number | string | TimelineModelData;
}

/**
 * Generate all time buckets for a given range, even if empty.
 * Uses UTC dates to match PostgreSQL date_trunc output.
 */
function generateTimeBuckets(range: TimeRange): string[] {
  const now = new Date();
  const buckets: string[] = [];

  if (range === '15m') {
    // 15 minute window (minute buckets)
    for (let i = 14; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCSeconds(0, 0);
      d.setUTCMinutes(d.getUTCMinutes() - i);
      buckets.push(d.toISOString().replace('T', ' ').slice(0, 19));
    }
  } else if (range === '1h') {
    // 60 minute window (minute buckets)
    for (let i = 59; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCSeconds(0, 0);
      d.setUTCMinutes(d.getUTCMinutes() - i);
      buckets.push(d.toISOString().replace('T', ' ').slice(0, 19));
    }
  } else if (range === '6h') {
    // 6 hourly buckets
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() - i);
      buckets.push(d.toISOString().replace('T', ' ').slice(0, 19));
    }
  } else if (range === '24h') {
    // 24 hourly buckets
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() - i);
      buckets.push(d.toISOString().replace('T', ' ').slice(0, 19));
    }
  } else if (range === '7d') {
    // 7 daily buckets
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      buckets.push(d.toISOString().replace('T', ' ').slice(0, 19));
    }
  } else {
    // 30d - 30 daily buckets
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      buckets.push(d.toISOString().replace('T', ' ').slice(0, 19));
    }
  }

  return buckets;
}

/**
 * Get feedback counts grouped by time bucket and model for charting.
 * Returns array of { date, modelId1: count, modelId2: count, ... }
 * Includes all time buckets even if empty.
 * @param modelIds - Optional filter to only include specific model IDs in the timeline
 */
export async function getFeedbackTimeline(
  db: Database,
  range: TimeRange,
  userId?: string,
  statsDbUrl?: string,
  modelIds?: string[]
): Promise<TimelinePoint[]> {
  const windowMs = TIME_RANGE_MS[range];
  // Use hourly buckets for 24h, daily for 7d/30d
  const truncUnit =
    range === '15m' || range === '1h'
      ? 'minute'
      : range === '6h' || range === '24h'
        ? 'hour'
        : 'day';
  const dateTrunc = sql.raw(`date_trunc('${truncUnit}', ${modelFeedback.createdAt.name})`);

  const normalizeModelId = (modelId: string) => modelId.replace(/:free$/, '');
  const modelIdMap = modelIds ? new Map(modelIds.map((id) => [normalizeModelId(id), id])) : null;
  const normalizeBucket = (bucket: string) =>
    bucket
      .replace('T', ' ')
      .replace(/([+-].*|Z)$/, '')
      .slice(0, 19);

  const bucketForRange = (bucket: string): string => {
    const d = new Date(bucket);
    if (range === '15m' || range === '1h') {
      d.setUTCSeconds(0, 0);
    } else if (range === '6h' || range === '24h') {
      d.setUTCMinutes(0, 0, 0);
    } else {
      // 7d, 30d
      d.setUTCHours(0, 0, 0, 0);
    }
    return d.toISOString().replace('T', ' ').slice(0, 19);
  };

  if (!userId && statsDbUrl) {
    const endTs = new Date();
    const startTs = windowMs !== null ? new Date(Date.now() - windowMs) : new Date(0);
    const rows = await getErrorTimelineStats(statsDbUrl, startTs, endTs);

    const dataMap: Record<string, Record<string, { errorCount: number; totalCount: number }>> = {};
    for (const row of rows) {
      // Skip if modelIds filter is provided and this model is not in the list
      const normalizedId = normalizeModelId(row.modelId);
      const targetModelId = modelIdMap?.get(normalizedId) ?? row.modelId;
      if (modelIdMap && !modelIdMap.has(normalizedId)) continue;

      const bucket = bucketForRange(row.bucket);
      if (!dataMap[bucket]) {
        dataMap[bucket] = {};
      }
      if (!dataMap[bucket][targetModelId]) {
        dataMap[bucket][targetModelId] = { errorCount: 0, totalCount: 0 };
      }
      dataMap[bucket][targetModelId].errorCount += row.errorCount;
      dataMap[bucket][targetModelId].totalCount += row.totalCount;
    }

    // Build timeline with computed error rates per bucket/model
    const allBuckets = Object.keys(dataMap).sort();
    return allBuckets.map((bucket) => {
      const point: Record<string, string | number | TimelineModelData> = { date: bucket };
      const bucketData = dataMap[bucket];
      for (const modelId in bucketData) {
        const { errorCount, totalCount } = bucketData[modelId];
        const errorRate = totalCount > 0 ? Math.round((errorCount / totalCount) * 10000) / 100 : 0;
        const obj = { errorRate, errorCount, totalCount };
        point[modelId] = obj;
        point[`${modelId}_meta`] = obj;
      }
      return point as TimelinePoint;
    });
  }

  const conditions: SQL<unknown>[] = [
    windowMs !== null ? gte(modelFeedback.createdAt, new Date(Date.now() - windowMs)) : undefined,
    userId ? eq(modelFeedback.source, userId) : undefined,
  ].filter((c): c is SQL<unknown> => Boolean(c));

  const results = await db
    .select({
      bucket: sql<string>`${dateTrunc}::text`,
      modelId: modelFeedback.modelId,
      errorCount: sql<number>`count(*) filter (where ${modelFeedback.isSuccess} = false)::int`,
      totalCount: sql<number>`count(*)::int`,
    })
    .from(modelFeedback)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(dateTrunc, modelFeedback.modelId)
    .orderBy(dateTrunc);

  // Build map of actual data - store counts, compute rate later
  const dataMap: Record<string, Record<string, { errorCount: number; totalCount: number }>> = {};
  for (const row of results) {
    // Skip if modelIds filter is provided and this model is not in the list
    const normalizedId = normalizeModelId(row.modelId);
    const targetModelId = modelIdMap?.get(normalizedId) ?? row.modelId;
    if (modelIdMap && !modelIdMap.has(normalizedId)) continue;

    if (!dataMap[row.bucket]) {
      dataMap[row.bucket] = {};
    }
    if (!dataMap[row.bucket][targetModelId]) {
      dataMap[row.bucket][targetModelId] = { errorCount: 0, totalCount: 0 };
    }
    dataMap[row.bucket][targetModelId].errorCount += row.errorCount;
    dataMap[row.bucket][targetModelId].totalCount += row.totalCount;
  }

  // Generate all buckets and fill with data (or empty)
  const allBuckets = generateTimeBuckets(range);
  const timeline: TimelinePoint[] = [];

  for (const bucket of allBuckets) {
    const point: TimelinePoint = { date: bucket };
    const bucketData = dataMap[bucket];
    if (bucketData) {
      for (const modelId in bucketData) {
        const { errorCount, totalCount } = bucketData[modelId];
        const errorRate = totalCount > 0 ? Math.round((errorCount / totalCount) * 10000) / 100 : 0;
        const obj = { errorRate, errorCount, totalCount };
        (point as Record<string, string | number | TimelineModelData>)[modelId] = obj;
        (point as Record<string, string | number | TimelineModelData>)[`${modelId}_meta`] = obj;
      }
    }
    timeline.push(point);
  }

  return timeline;
}

// ============================================================================
// Model Availability Functions
// ============================================================================

export interface AvailabilityData {
  modelId: string;
  modelName: string;
  isActive: boolean | null;
  modality: string | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  supportedParameters: string[] | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  availability: Record<string, boolean>; // { "2026-01-31": true, "2026-01-30": false, ... }
}

export interface AvailabilityFilterOptions {
  days?: number; // Default 90, max 90
  useCases?: UseCaseType[];
  sort?: SortType;
}

/**
 * Get model availability history over a date range.
 * Returns models with their daily availability status and all dates in range.
 */
export async function getModelAvailability(
  db: Database,
  options: AvailabilityFilterOptions = {}
): Promise<{ models: AvailabilityData[]; dates: string[] }> {
  const days = Math.min(options.days ?? 90, 90);
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days);
  cutoffDate.setUTCHours(0, 0, 0, 0);

  // Get all snapshots within range
  const snapshots = await db
    .select({
      modelId: modelAvailabilitySnapshots.modelId,
      snapshotDate: modelAvailabilitySnapshots.snapshotDate,
      isAvailable: modelAvailabilitySnapshots.isAvailable,
    })
    .from(modelAvailabilitySnapshots)
    .where(gte(modelAvailabilitySnapshots.snapshotDate, cutoffDate));

  // Get model metadata (all models, not just active, to show historical data)
  const models = await db
    .select({
      id: freeModels.id,
      name: freeModels.name,
      isActive: freeModels.isActive,
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      outputModalities: freeModels.outputModalities,
      supportedParameters: freeModels.supportedParameters,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
    })
    .from(freeModels);

  // Build availability map: { modelId: { "2026-01-31": true, ... } }
  const availabilityMap: Record<string, Record<string, boolean>> = {};

  for (const snapshot of snapshots) {
    const dateStr = snapshot.snapshotDate.toISOString().split('T')[0];

    if (!availabilityMap[snapshot.modelId]) {
      availabilityMap[snapshot.modelId] = {};
    }
    availabilityMap[snapshot.modelId][dateStr] = snapshot.isAvailable;
  }

  // Generate all dates in range (oldest first)
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Only include models that have at least one availability record
  const modelsWithAvailability = models.filter((model) => availabilityMap[model.id]);

  // Combine model data with availability
  let result: AvailabilityData[] = modelsWithAvailability.map((model) => ({
    modelId: model.id,
    modelName: model.name,
    isActive: model.isActive,
    modality: model.modality,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    supportedParameters: model.supportedParameters,
    contextLength: model.contextLength,
    maxCompletionTokens: model.maxCompletionTokens,
    availability: availabilityMap[model.id] ?? {},
  }));

  // Apply use case filtering
  if (options.useCases && options.useCases.length > 0) {
    result = filterModelsByUseCase(result, options.useCases);
  }

  // Apply sorting
  if (options.sort) {
    result = sortModels(result, options.sort);
  }

  return { models: result, dates };
}

// ---------------------------------------------------------------------------
// Model detail page helpers
// ---------------------------------------------------------------------------

/**
 * Return availability snapshots for a single model over the last `days` days.
 * Returns `{ dates: string[], availability: Record<string, boolean> }`.
 */
export async function getModelAvailabilityById(
  db: Database,
  modelId: string,
  days = 90
): Promise<{ dates: string[]; availability: Record<string, boolean> }> {
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days);
  cutoffDate.setUTCHours(0, 0, 0, 0);

  const snapshots = await db
    .select({
      snapshotDate: modelAvailabilitySnapshots.snapshotDate,
      isAvailable: modelAvailabilitySnapshots.isAvailable,
    })
    .from(modelAvailabilitySnapshots)
    .where(
      and(
        eq(modelAvailabilitySnapshots.modelId, modelId),
        gte(modelAvailabilitySnapshots.snapshotDate, cutoffDate)
      )
    );

  const availability: Record<string, boolean> = {};
  for (const s of snapshots) {
    availability[s.snapshotDate.toISOString().split('T')[0]] = s.isAvailable;
  }

  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return { dates, availability };
}

export interface ModelFeedbackSummary {
  errorRate: number;
  successCount: number;
  rateLimited: number;
  unavailable: number;
  error: number;
}

/** Fetch a single model by ID (active or inactive). Returns null when not found. */
export async function getModelById(db: Database, modelId: string) {
  const rows = await db.select().from(freeModels).where(eq(freeModels.id, modelId)).limit(1);

  return rows[0] ?? null;
}

/**
 * Return up to `limit` related models from the same provider, excluding the
 * given model. Falls back to an empty array when there are none.
 */
export async function getRelatedModels(db: Database, model: { id: string }, limit = 5) {
  const provider = model.id.split('/')[0];
  if (!provider) return [];

  const likePattern = `${provider}/%`;

  return db
    .select({
      id: freeModels.id,
      name: freeModels.name,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      supportedParameters: freeModels.supportedParameters,
    })
    .from(freeModels)
    .where(
      and(
        eq(freeModels.isActive, true),
        sql`${freeModels.id} LIKE ${likePattern}`,
        sql`${freeModels.id} != ${model.id}`
      )
    )
    .limit(limit);
}

/**
 * Return up to `limit` models with similar capabilities (vision, tools,
 * reasoning, long context) from different providers.
 */
export async function getSimilarModels(
  db: Database,
  model: {
    id: string;
    inputModalities?: string[] | null;
    supportedParameters?: string[] | null;
    contextLength?: number | null;
  },
  limit = 5
) {
  const provider = model.id.split('/')[0];

  // Build capability conditions to match
  const conditions: SQL<unknown>[] = [
    eq(freeModels.isActive, true),
    sql`${freeModels.id} != ${model.id}`,
  ];

  // Exclude same provider so this doesn't overlap with "More from {provider}"
  if (provider) {
    conditions.push(sql`${freeModels.id} NOT LIKE ${`${provider}/%`}`);
  }

  // Score: count how many capabilities match
  const scoreParts: string[] = [];

  if (model.inputModalities?.includes('image')) {
    scoreParts.push(
      `CASE WHEN 'image' = ANY(${freeModels.inputModalities.name}) THEN 1 ELSE 0 END`
    );
  }
  if (model.supportedParameters?.includes('tools')) {
    scoreParts.push(
      `CASE WHEN 'tools' = ANY(${freeModels.supportedParameters.name}) THEN 1 ELSE 0 END`
    );
  }
  if (
    model.supportedParameters?.includes('reasoning') ||
    model.supportedParameters?.includes('include_reasoning')
  ) {
    scoreParts.push(
      `CASE WHEN 'reasoning' = ANY(${freeModels.supportedParameters.name}) OR 'include_reasoning' = ANY(${freeModels.supportedParameters.name}) THEN 1 ELSE 0 END`
    );
  }
  if ((model.contextLength ?? 0) >= 100000) {
    scoreParts.push(`CASE WHEN ${freeModels.contextLength.name} >= 100000 THEN 1 ELSE 0 END`);
  }

  // If the model has no notable capabilities, just return empty
  if (scoreParts.length === 0) return [];

  const scoreExpr = sql.raw(`(${scoreParts.join(' + ')})`);

  return db
    .select({
      id: freeModels.id,
      name: freeModels.name,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      supportedParameters: freeModels.supportedParameters,
    })
    .from(freeModels)
    .where(and(...conditions))
    .orderBy(sql`${scoreExpr} DESC`)
    .limit(limit);
}

/**
 * Aggregate feedback for a single model over a given time window.
 * Defaults to 7 days. Returns null when there is no feedback data at all.
 */
export async function getModelFeedbackById(
  db: Database,
  modelId: string,
  windowMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<ModelFeedbackSummary | null> {
  const cutoff = new Date(Date.now() - windowMs);

  const results = await db
    .select({
      issue: modelFeedback.issue,
      isSuccess: modelFeedback.isSuccess,
      count: sql<number>`count(*)::int`,
    })
    .from(modelFeedback)
    .where(and(eq(modelFeedback.modelId, modelId), gte(modelFeedback.createdAt, cutoff)))
    .groupBy(modelFeedback.issue, modelFeedback.isSuccess);

  if (results.length === 0) return null;

  const summary: ModelFeedbackSummary = {
    errorRate: 0,
    successCount: 0,
    rateLimited: 0,
    unavailable: 0,
    error: 0,
  };

  for (const row of results) {
    if (row.isSuccess) {
      summary.successCount += row.count;
    } else if (row.issue === 'rate_limited') {
      summary.rateLimited += row.count;
    } else if (row.issue === 'unavailable') {
      summary.unavailable += row.count;
    } else if (row.issue === 'error') {
      summary.error += row.count;
    }
  }

  const errorCount = summary.rateLimited + summary.unavailable + summary.error;
  const total = summary.successCount + errorCount;
  summary.errorRate = total > 0 ? Math.round((errorCount / total) * 10000) / 100 : 0;

  return summary;
}

// ---------------------------------------------------------------------------
// Provider page helpers
// ---------------------------------------------------------------------------

/** Fetch all active models belonging to a given provider. */
export async function getModelsByProvider(db: Database, provider: string) {
  const likePattern = `${provider}/%`;
  return db
    .select({
      id: freeModels.id,
      name: freeModels.name,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
      description: freeModels.description,
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      outputModalities: freeModels.outputModalities,
      supportedParameters: freeModels.supportedParameters,
      isModerated: freeModels.isModerated,
      createdAt: freeModels.createdAt,
    })
    .from(freeModels)
    .where(and(eq(freeModels.isActive, true), sql`${freeModels.id} LIKE ${likePattern}`));
}

/**
 * Get availability data for all models of a provider.
 * Returns the same shape as getModelAvailability but scoped to one provider.
 */
export async function getProviderAvailability(db: Database, provider: string, days = 90) {
  const likePattern = `${provider}/%`;
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days);
  cutoffDate.setUTCHours(0, 0, 0, 0);

  const snapshots = await db
    .select({
      modelId: modelAvailabilitySnapshots.modelId,
      snapshotDate: modelAvailabilitySnapshots.snapshotDate,
      isAvailable: modelAvailabilitySnapshots.isAvailable,
    })
    .from(modelAvailabilitySnapshots)
    .where(
      and(
        sql`${modelAvailabilitySnapshots.modelId} LIKE ${likePattern}`,
        gte(modelAvailabilitySnapshots.snapshotDate, cutoffDate)
      )
    );

  const models = await db
    .select({
      id: freeModels.id,
      name: freeModels.name,
      modality: freeModels.modality,
      inputModalities: freeModels.inputModalities,
      outputModalities: freeModels.outputModalities,
      supportedParameters: freeModels.supportedParameters,
      isActive: freeModels.isActive,
      contextLength: freeModels.contextLength,
      maxCompletionTokens: freeModels.maxCompletionTokens,
    })
    .from(freeModels)
    .where(sql`${freeModels.id} LIKE ${likePattern}`);

  const availabilityMap: Record<string, Record<string, boolean>> = {};
  for (const s of snapshots) {
    const dateStr = s.snapshotDate.toISOString().split('T')[0];
    if (!availabilityMap[s.modelId]) availabilityMap[s.modelId] = {};
    availabilityMap[s.modelId][dateStr] = s.isAvailable;
  }

  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const modelMap = new Map(models.map((m) => [m.id, m]));
  const result = Object.entries(availabilityMap)
    .filter(([modelId]) => modelMap.has(modelId))
    .map(([modelId, availability]) => {
      const m = modelMap.get(modelId)!;
      return {
        modelId: m.id,
        modelName: m.name,
        modality: m.modality,
        inputModalities: m.inputModalities,
        outputModalities: m.outputModalities,
        supportedParameters: m.supportedParameters,
        isActive: m.isActive,
        contextLength: m.contextLength,
        maxCompletionTokens: m.maxCompletionTokens,
        availability,
      };
    });

  return { models: result, dates };
}

/** Return a sorted list of distinct provider names from active models. */
export async function getDistinctProviders(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({
      id: freeModels.id,
    })
    .from(freeModels)
    .where(eq(freeModels.isActive, true));

  const providers = new Set<string>();
  for (const row of rows) {
    const p = row.id.split('/')[0];
    if (p) providers.add(p);
  }

  return [...providers].sort();
}
