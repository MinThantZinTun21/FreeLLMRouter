import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

// Re-export auth schema
export * from './auth-schema';

export const freeModels = pgTable('free_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contextLength: integer('context_length'),
  maxCompletionTokens: integer('max_completion_tokens'),
  description: text('description'),
  modality: text('modality'), // e.g., "text->text", "text+image->text"
  inputModalities: text('input_modalities').array(), // e.g., ["text", "image"]
  outputModalities: text('output_modalities').array(), // e.g., ["text"]
  supportedParameters: text('supported_parameters').array(), // e.g., ["tools", "reasoning"]
  isModerated: boolean('is_moderated'),
  priority: integer('priority').default(100),
  isActive: boolean('is_active').default(true),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const modelFeedback = pgTable('model_feedback', {
  id: text('id').primaryKey(),
  modelId: text('model_id').notNull(),
  requestId: text('request_id'), // Optional link to api_request_logs.id for correlation
  apiKeyId: text('api_key_id'), // Optional link to apiKeys.id for tracking which key was used
  isSuccess: boolean('is_success').notNull().default(false), // true for success reports, false for issues
  issue: text('issue'), // 'rate_limited' | 'unavailable' | 'error' (nullable for success reports)
  details: text('details'),
  source: text('source'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const syncMeta = pgTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type FreeModel = typeof freeModels.$inferSelect;
export type NewFreeModel = typeof freeModels.$inferInsert;
export type ModelFeedback = typeof modelFeedback.$inferSelect;
export type NewModelFeedback = typeof modelFeedback.$inferInsert;

export const siteFeedback = pgTable('site_feedback', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  email: text('email'),
  userAgent: text('user_agent'),
  pageUrl: text('page_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type SiteFeedback = typeof siteFeedback.$inferSelect;
export type NewSiteFeedback = typeof siteFeedback.$inferInsert;

export const modelAvailabilitySnapshots = pgTable('model_availability_snapshots', {
  id: text('id').primaryKey(), // Format: "{modelId}_{YYYY-MM-DD}"
  modelId: text('model_id').notNull(),
  snapshotDate: timestamp('snapshot_date').notNull(),
  isAvailable: boolean('is_available').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export type ModelAvailabilitySnapshot = typeof modelAvailabilitySnapshots.$inferSelect;
export type NewModelAvailabilitySnapshot = typeof modelAvailabilitySnapshots.$inferInsert;
