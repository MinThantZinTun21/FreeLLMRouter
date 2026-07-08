import './node-compat';
import { neon } from '@neondatabase/serverless';

export interface FeedbackCount {
  modelId: string;
  issue: string | null;
  isSuccess: boolean;
  count: number;
}

export interface ErrorTimelinePoint {
  bucket: string;
  modelId: string;
  errorCount: number;
  totalCount: number;
}

/**
 * Call get_feedback_counts() SECURITY DEFINER function.
 * Returns aggregates only - no raw row access possible.
 */
export async function getFeedbackCounts(
  statsDbUrl: string,
  startTs: Date,
  endTs: Date
): Promise<FeedbackCount[]> {
  const sql = neon(statsDbUrl);
  const rows = await sql`
    SELECT model_id, issue, is_success, count
    FROM get_feedback_counts(${startTs.toISOString()}::timestamptz, ${endTs.toISOString()}::timestamptz)
  `;
  return rows.map((r) => ({
    modelId: r.model_id as string,
    issue: r.issue as string | null,
    isSuccess: r.is_success as boolean,
    count: Number(r.count),
  }));
}

/**
 * Call get_error_timeline() SECURITY DEFINER function.
 * Returns aggregates only - no raw row access possible.
 */
export async function getErrorTimeline(
  statsDbUrl: string,
  startTs: Date,
  endTs: Date
): Promise<ErrorTimelinePoint[]> {
  const sql = neon(statsDbUrl);
  const rows = await sql`
    SELECT bucket::text as bucket, model_id, error_count, total_count
    FROM get_error_timeline(${startTs.toISOString()}::timestamptz, ${endTs.toISOString()}::timestamptz)
  `;
  return rows.map((r) => ({
    bucket: r.bucket as string,
    modelId: r.model_id as string,
    errorCount: Number(r.error_count),
    totalCount: Number(r.total_count),
  }));
}
