// This is for seeding the database with synthetic feedback data for testing purposes.
// Also seeds API request logs with responseData and links feedback to requests via requestId.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { modelFeedback, freeModels, modelAvailabilitySnapshots } from '../src/db/schema';
import { apiRequestLogs, users, apiKeys } from '../src/db/auth-schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL!;
const sql = neon(DATABASE_URL);
const db = drizzle(sql);

// Auto-detect user/key or use env vars
async function getSeederIds(): Promise<{ userId: string | null; apiKeyId: string | null }> {
  // Use env vars if provided
  if (process.env.SEED_USER_ID) {
    return {
      userId: process.env.SEED_USER_ID,
      apiKeyId: process.env.SEED_API_KEY_ID || null,
    };
  }

  // Auto-detect: get first user from database
  const [firstUser] = await db.select({ id: users.id, email: users.email }).from(users).limit(1);
  if (!firstUser) {
    console.log('No users found in database. Seeding feedback only (no request logs).');
    return { userId: null, apiKeyId: null };
  }

  console.log(`Auto-detected user: ${firstUser.email} (${firstUser.id})`);

  // Try to find an API key for this user
  const [firstKey] = await db
    .select({ id: apiKeys.id, name: apiKeys.name })
    .from(apiKeys)
    .where(eq(apiKeys.userId, firstUser.id))
    .limit(1);

  if (firstKey) {
    console.log(`Auto-detected API key: ${firstKey.name} (${firstKey.id})`);
  }

  return {
    userId: firstUser.id,
    apiKeyId: firstKey?.id || null,
  };
}

// Generate a random ID
function randomId() {
  return crypto.randomUUID();
}

async function seed() {
  // Auto-detect or use provided user/key IDs
  const { userId: USER_ID, apiKeyId: API_KEY_ID } = await getSeederIds();

  console.log('Fetching active models...');

  // Get active models to create feedback for
  const models = await db.select().from(freeModels).where(eq(freeModels.isActive, true));

  if (models.length === 0) {
    console.log('No active models found. Please sync models first.');
    return;
  }

  console.log(
    `Found ${models.length} models:`,
    models.map((m) => m.id)
  );

  const feedbackRecords: (typeof modelFeedback.$inferInsert)[] = [];
  const requestRecords: (typeof apiRequestLogs.$inferInsert)[] = [];
  const now = Date.now();
  const modelIds = models.map((m) => m.id);

  // Time ranges to cover: 15m, 30m, 1h, 6h, 24h, 7d, 30d
  // Create buckets that ensure data in each time range
  const timeRanges = [
    { name: '15m', buckets: 3, intervalMs: 5 * 60 * 1000 }, // 3 buckets × 5min = 15min
    { name: '30m', buckets: 3, intervalMs: 5 * 60 * 1000, offsetMs: 15 * 60 * 1000 }, // 15-30min ago
    { name: '1h', buckets: 6, intervalMs: 5 * 60 * 1000, offsetMs: 30 * 60 * 1000 }, // 30-60min ago
    { name: '6h', buckets: 10, intervalMs: 30 * 60 * 1000, offsetMs: 1 * 60 * 60 * 1000 }, // 1-6h ago
    { name: '24h', buckets: 12, intervalMs: 60 * 60 * 1000, offsetMs: 6 * 60 * 60 * 1000 }, // 6-24h ago
    { name: '7d', buckets: 12, intervalMs: 12 * 60 * 60 * 1000, offsetMs: 24 * 60 * 60 * 1000 }, // 1-7d ago
    {
      name: '30d',
      buckets: 12,
      intervalMs: 2 * 24 * 60 * 60 * 1000,
      offsetMs: 7 * 24 * 60 * 60 * 1000,
    }, // 7-30d ago
  ];

  // If USER_ID is available, we'll also create request logs and link feedback to them
  const shouldCreateRequests = !!USER_ID;
  if (shouldCreateRequests) {
    console.log('Will create API request logs and link feedback to requests');
  } else {
    console.log('No user found - creating unlinked feedback only');
  }

  for (const range of timeRanges) {
    const baseOffset = range.offsetMs || 0;

    for (let bucketIndex = 0; bucketIndex < range.buckets; bucketIndex++) {
      // Calculate the timestamp for this bucket
      const bucketTime = new Date(now - baseOffset - bucketIndex * range.intervalMs);

      if (shouldCreateRequests) {
        // Create a request and simulate the fallback pattern with linked feedback
        const requestId = randomId();

        // Pick 3-8 random models for this request's response
        const numModelsReturned = 3 + Math.floor(Math.random() * 6);
        const shuffled = [...modelIds].sort(() => Math.random() - 0.5);
        const returnedModelIds = shuffled.slice(0, numModelsReturned);

        // Generate random request params
        const useCasesOptions = [
          ['tools'],
          ['coding'],
          ['reasoning'],
          ['chat'],
          ['tools', 'coding'],
          null,
        ];
        const sortOptions = ['capable', 'contextLength', 'maxOutput', null];
        const topNOptions = [5, 10, 20, null];
        const maxErrorRateOptions = [0.1, 0.2, 0.5, null];
        const timeRangeOptions = ['15m', '1h', '24h', '7d', null];

        const params = {
          useCases: useCasesOptions[Math.floor(Math.random() * useCasesOptions.length)],
          sort: sortOptions[Math.floor(Math.random() * sortOptions.length)],
          topN: topNOptions[Math.floor(Math.random() * topNOptions.length)],
          maxErrorRate: maxErrorRateOptions[Math.floor(Math.random() * maxErrorRateOptions.length)],
          timeRange: timeRangeOptions[Math.floor(Math.random() * timeRangeOptions.length)],
          myReports: Math.random() < 0.3, // 30% chance of myReports=true
        };

        // Clean up null values from params
        const cleanParams = Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== null && v !== false)
        );

        requestRecords.push({
          id: requestId,
          userId: USER_ID,
          apiKeyId: API_KEY_ID || null,
          endpoint: '/api/v1/models/ids',
          method: 'GET',
          statusCode: 200,
          responseTimeMs: 50 + Math.floor(Math.random() * 200),
          responseData: JSON.stringify({
            ids: returnedModelIds,
            count: returnedModelIds.length,
            params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
          }),
          createdAt: bucketTime,
        });

        // Simulate fallback pattern: try models in order until one succeeds
        // 1-4 attempts, last one is usually successful
        const numAttempts = 1 + Math.floor(Math.random() * Math.min(4, returnedModelIds.length));
        let cumulativeDelayMs = 0;

        for (let attemptIndex = 0; attemptIndex < numAttempts; attemptIndex++) {
          const modelId = returnedModelIds[attemptIndex];
          const isLastAttempt = attemptIndex === numAttempts - 1;
          const isSuccess = isLastAttempt ? Math.random() < 0.85 : false; // 85% success on last try

          // Add delay for each attempt (simulating API call time)
          cumulativeDelayMs += 200 + Math.floor(Math.random() * 1500); // 200-1700ms per attempt
          const feedbackTime = new Date(bucketTime.getTime() + cumulativeDelayMs);

          if (isSuccess) {
            feedbackRecords.push({
              id: randomId(),
              modelId,
              requestId,
              apiKeyId: API_KEY_ID || null,
              isSuccess: true,
              issue: null,
              details: null,
              source: USER_ID,
              createdAt: feedbackTime,
            });
            break; // Stop on success
          } else {
            const issueTypes = ['rate_limited', 'unavailable', 'error'] as const;
            const issue = issueTypes[Math.floor(Math.random() * issueTypes.length)];

            feedbackRecords.push({
              id: randomId(),
              modelId,
              requestId,
              apiKeyId: API_KEY_ID || null,
              isSuccess: false,
              issue,
              details: `Model ${issue} during fallback attempt ${attemptIndex + 1}`,
              source: USER_ID,
              createdAt: feedbackTime,
            });
          }
        }
      } else {
        // No user - create unlinked feedback for chart data only
        for (const model of models) {
          const numReports = 2 + Math.floor(Math.random() * 3);
          const errorRate = 0.05 + Math.random() * 0.45;

          for (let i = 0; i < numReports; i++) {
            const isError = Math.random() < errorRate;
            const maxOffset = Math.min(range.intervalMs * 0.8, 4 * 60 * 1000);
            const offsetMs = Math.floor(Math.random() * maxOffset);
            const createdAt = new Date(bucketTime.getTime() - offsetMs);

            if (isError) {
              const issueTypes = ['rate_limited', 'unavailable', 'error'] as const;
              const issue = issueTypes[Math.floor(Math.random() * issueTypes.length)];

              feedbackRecords.push({
                id: randomId(),
                modelId: model.id,
                requestId: null,
                apiKeyId: null,
                isSuccess: false,
                issue,
                details: `Test ${issue} error`,
                source: 'seed-script',
                createdAt,
              });
            } else {
              feedbackRecords.push({
                id: randomId(),
                modelId: model.id,
                requestId: null,
                apiKeyId: null,
                isSuccess: true,
                issue: null,
                details: null,
                source: 'seed-script',
                createdAt,
              });
            }
          }
        }
      }
    }

    console.log(`Created ${range.name} range data`);
  }

  const totalBuckets = timeRanges.reduce((sum, r) => sum + r.buckets, 0);

  // Insert request records first (feedback references them)
  if (requestRecords.length > 0) {
    console.log(`Inserting ${requestRecords.length} request logs...`);
    const batchSize = 50;
    for (let i = 0; i < requestRecords.length; i += batchSize) {
      const batch = requestRecords.slice(i, i + batchSize);
      await db.insert(apiRequestLogs).values(batch);
    }
  }

  console.log(
    `Inserting ${feedbackRecords.length} feedback records across ${totalBuckets} time buckets...`
  );

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < feedbackRecords.length; i += batchSize) {
    const batch = feedbackRecords.slice(i, i + batchSize);
    await db.insert(modelFeedback).values(batch);
    console.log(
      `Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(feedbackRecords.length / batchSize)}`
    );
  }

  const linkedCount = feedbackRecords.filter((f) => f.requestId).length;
  console.log('Done seeding feedback!');
  console.log(`  - ${requestRecords.length} request logs`);
  console.log(`  - ${feedbackRecords.length} feedback records (${linkedCount} linked to requests)`);

  // Seed availability snapshots
  await seedAvailability(models);
}

/**
 * Seeds historical availability data for all active models.
 * Creates daily snapshots going back 30 days (or to model's createdAt, whichever is more recent).
 */
async function seedAvailability(models: (typeof freeModels.$inferSelect)[]) {
  console.log('\nSeeding availability snapshots...');

  const maxDays = 30;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const availabilityRecords: (typeof modelAvailabilitySnapshots.$inferInsert)[] = [];

  for (const model of models) {
    // Determine start date: either createdAt or maxDays ago, whichever is more recent
    const modelCreatedAt = model.createdAt ? new Date(model.createdAt) : today;
    modelCreatedAt.setUTCHours(0, 0, 0, 0);

    const maxDaysAgo = new Date(today);
    maxDaysAgo.setUTCDate(maxDaysAgo.getUTCDate() - maxDays);

    const startDate = modelCreatedAt > maxDaysAgo ? modelCreatedAt : maxDaysAgo;

    // Create records for each day from startDate to today
    const currentDate = new Date(startDate);
    while (currentDate <= today) {
      const dateString = currentDate.toISOString().split('T')[0];
      const snapshotId = `${model.id}_${dateString}`;

      availabilityRecords.push({
        id: snapshotId,
        modelId: model.id,
        snapshotDate: new Date(currentDate),
        isAvailable: true,
      });

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
  }

  console.log(`Inserting ${availabilityRecords.length} availability snapshots...`);

  // Insert in batches, using onConflictDoNothing to skip existing records
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < availabilityRecords.length; i += batchSize) {
    const batch = availabilityRecords.slice(i, i + batchSize);
    await db.insert(modelAvailabilitySnapshots).values(batch).onConflictDoNothing();
    inserted += batch.length;
    console.log(
      `Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(availabilityRecords.length / batchSize)}`
    );
  }

  console.log(
    `Done seeding availability! ${availabilityRecords.length} records for ${models.length} models over ${maxDays} days`
  );
}

seed().catch(console.error);
