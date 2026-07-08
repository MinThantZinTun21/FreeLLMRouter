import type { APIRoute } from 'astro';
import { modelFeedback, withUserContext } from '@/db';
import { initializeAuthOnly } from '@/lib/api-params';
import { corsHeaders } from '@/lib/api-auth';
import { apiResponseHeaders, jsonResponse, noContentResponse } from '@/lib/api-response';

const VALID_ISSUES = ['rate_limited', 'unavailable', 'error'] as const;

/**
 * Submit health feedback about a model (success or issue)
 * Requires API key authentication but does NOT count towards rate limit.
 * Can report either success (success: true) or an issue (issue: 'rate_limited' | 'unavailable' | 'error')
 */
export const POST: APIRoute = async (context) => {
  const authCtx = await initializeAuthOnly(context);
  if (authCtx instanceof Response) return authCtx;

  try {
    const { db, databaseUrl, userId, keyId } = authCtx;

    const body = await context.request.json();
    const { modelId, success, issue, details, dryRun, requestId } = body;

    if (!modelId || typeof modelId !== 'string') {
      return jsonResponse(
        { error: 'modelId is required' },
        { status: 400, headers: apiResponseHeaders() }
      );
    }

    // Validate success/issue logic
    if (success === true) {
      // Success report - issue must not be provided
      if (issue) {
        return jsonResponse(
          { error: 'Cannot provide both success=true and issue field' },
          { status: 400, headers: apiResponseHeaders() }
        );
      }
    } else {
      // Issue report - issue field required
      if (!issue || !VALID_ISSUES.includes(issue)) {
        return jsonResponse(
          { error: `issue must be one of: ${VALID_ISSUES.join(', ')}` },
          { status: 400, headers: apiResponseHeaders() }
        );
      }
    }

    // Skip database insert for dry run (e.g., from TryItPanel demo)
    if (!dryRun) {
      if (!userId) {
        return jsonResponse(
          { error: 'Authenticated user context missing for feedback write' },
          { status: 401, headers: apiResponseHeaders() }
        );
      }

      const id = crypto.randomUUID();

      await withUserContext(databaseUrl, userId, async (tx) => {
        await tx.insert(modelFeedback).values({
          id,
          modelId,
          requestId: requestId || null, // Optional link to api_request_logs.id
          apiKeyId: keyId || null, // Track which API key was used
          isSuccess: success === true,
          issue: success === true ? null : issue,
          details: details || null,
          source: userId,
          createdAt: new Date(),
        });
      });
    }

    return jsonResponse({ received: true }, { headers: apiResponseHeaders() });
  } catch (error) {
    console.error('[API/feedback] Error:', error);

    return jsonResponse(
      { error: 'Failed to submit feedback' },
      { status: 500, headers: apiResponseHeaders() }
    );
  }
};

export const OPTIONS: APIRoute = async () => {
  return noContentResponse({ headers: corsHeaders });
};
