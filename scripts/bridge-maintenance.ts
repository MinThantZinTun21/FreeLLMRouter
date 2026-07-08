#!/usr/bin/env bun
import { pruneOldRequestLogs, pruneOldUsageAggregates } from '../src/bridge/usage';

const requestLogDays = Number(process.env.BRIDGE_REQUEST_LOG_RETENTION_DAYS || 30);
const aggregateDays = Number(process.env.BRIDGE_AGGREGATE_RETENTION_DAYS || 180);

async function main() {
  const logs = await pruneOldRequestLogs(requestLogDays);
  const aggregates = await pruneOldUsageAggregates(aggregateDays);
  console.log(
    JSON.stringify(
      {
        ok: true,
        pruned: {
          requestGroups: logs.groups,
          requestHops: logs.hops,
          usageAggregates: aggregates,
        },
        retention: { requestLogDays, aggregateDays },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
