import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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

export const bridgeTenants = pgTable('bridge_tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  rpmLimitChat: integer('rpm_limit_chat').notNull().default(120),
  rpmLimitVision: integer('rpm_limit_vision').notNull().default(60),
  rpmLimitEmbeddings: integer('rpm_limit_embeddings').notNull().default(240),
  dailyLimitChat: integer('daily_limit_chat').notNull().default(5000),
  dailyLimitVision: integer('daily_limit_vision').notNull().default(2000),
  dailyLimitEmbeddings: integer('daily_limit_embeddings').notNull().default(10000),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const bridgeApiKeys = pgTable(
  'bridge_api_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => bridgeTenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    keyHashUnique: uniqueIndex('bridge_api_keys_key_hash_unique').on(table.keyHash),
  })
);

export const bridgeProviders = pgTable('bridge_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  directBaseUrl: text('direct_base_url'),
  defaultRpmLimit: integer('default_rpm_limit').notNull().default(60),
  defaultDailyRequestLimit: integer('default_daily_request_limit'),
  defaultDailyTokenLimit: integer('default_daily_token_limit').notNull().default(100_000),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const providerKeys = pgTable('provider_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => bridgeTenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  keyIv: text('key_iv').notNull(),
  keyTag: text('key_tag').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  keyLast4: text('key_last4').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const modelCatalogFree = pgTable('model_catalog_free', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  routeType: text('route_type').notNull(),
  supportsTools: boolean('supports_tools').notNull().default(false),
  supportsJsonMode: boolean('supports_json_mode').notNull().default(false),
  maxContext: integer('max_context'),
  maxOutput: integer('max_output'),
  rpmLimit: integer('rpm_limit').notNull().default(60),
  dailyRequestLimit: integer('daily_request_limit'),
  dailyTokenLimit: integer('daily_token_limit').notNull().default(100_000),
  sourceUrl: text('source_url'),
  sourceUpdatedAt: timestamp('source_updated_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const modelRuntimeState = pgTable('model_runtime_state', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  providerKeyId: text('provider_key_id').references(() => providerKeys.id, {
    onDelete: 'set null',
  }),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  cooldownUntil: timestamp('cooldown_until'),
  quotaResetAt: timestamp('quota_reset_at'),
  status: text('status').notNull().default('healthy'),
  lastErrorCode: text('last_error_code'),
  score: integer('score').notNull().default(100),
  requestsThisMinute: integer('requests_this_minute').notNull().default(0),
  requestsToday: integer('requests_today').notNull().default(0),
  tokensToday: integer('tokens_today').notNull().default(0),
  minuteWindowStart: timestamp('minute_window_start'),
  usageDayKey: text('usage_day_key'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const requestGroups = pgTable('request_groups', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => bridgeTenants.id, { onDelete: 'cascade' }),
  routeType: text('route_type').notNull(),
  debugTrace: boolean('debug_trace').notNull().default(false),
  status: text('status').notNull().default('started'),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
});

export const requestHops = pgTable('request_hops', {
  id: text('id').primaryKey(),
  requestGroupId: text('request_group_id')
    .notNull()
    .references(() => requestGroups.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => bridgeTenants.id, { onDelete: 'cascade' }),
  hopIndex: integer('hop_index').notNull(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  providerKeyId: text('provider_key_id').references(() => providerKeys.id, {
    onDelete: 'set null',
  }),
  requestTokens: integer('request_tokens'),
  responseTokens: integer('response_tokens'),
  totalTokens: integer('total_tokens'),
  tokenSource: text('token_source').notNull().default('unknown'),
  latencyMs: integer('latency_ms'),
  statusCode: integer('status_code'),
  success: boolean('success').notNull().default(false),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const dailyUsageAggregates = pgTable('daily_usage_aggregates', {
  id: text('id').primaryKey(),
  dateKey: text('date_key').notNull(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => bridgeTenants.id, { onDelete: 'cascade' }),
  routeType: text('route_type').notNull(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type BridgeTenant = typeof bridgeTenants.$inferSelect;
export type NewBridgeTenant = typeof bridgeTenants.$inferInsert;
export type BridgeApiKey = typeof bridgeApiKeys.$inferSelect;
export type NewBridgeApiKey = typeof bridgeApiKeys.$inferInsert;
export type ProviderKey = typeof providerKeys.$inferSelect;
export type NewProviderKey = typeof providerKeys.$inferInsert;
export type BridgeProvider = typeof bridgeProviders.$inferSelect;
export type NewBridgeProvider = typeof bridgeProviders.$inferInsert;
