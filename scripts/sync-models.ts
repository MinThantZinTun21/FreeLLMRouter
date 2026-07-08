import 'dotenv/config';
import { createDb } from '../src/db';
import { syncModels } from '../src/services/openrouter';

async function main() {
  const databaseUrl = process.env.DATABASE_URL_OWNER || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL_OWNER or DATABASE_URL is required for db:sync-models.');
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  const result = await syncModels(db);
  console.log(
    `Synced models: total=${result.totalApiModels}, free=${result.freeModelsFound}, ` +
      `inserted=${result.inserted}, updated=${result.updated}, inactive=${result.markedInactive}`
  );
}

main().catch((error) => {
  console.error('Sync failed:', error);
  process.exit(1);
});
