import { randomUUID } from 'node:crypto';
import { getCandidateModels, getCatalogModelById } from './catalog';
import { assertTenantWithinLimits, filterModelsWithinLimits, incrementModelUsage } from './limits';
import { invokeForModel } from './providers';
import { applyQuotaResetHint, rankCandidatesByHealth } from './scoring';
import { finishRequestGroup, recordHop, startRequestGroup } from './state';
import type {
  BridgeRouteType,
  BridgeRoutingTrace,
  CatalogModel,
  RouteFeatureRequirements,
  TenantContext,
} from './types';

const MAX_HOPS = 3;

export interface RouteRequestParams {
  routeType: BridgeRouteType;
  tenant: TenantContext;
  payload: Record<string, unknown>;
  requirements?: RouteFeatureRequirements;
}

export interface RouteRequestResult {
  statusCode: number;
  response: unknown;
  trace?: BridgeRoutingTrace;
  stream?: ReadableStream<Uint8Array> | null;
  streamContentType?: string;
}

function reorderWithPinnedModel(
  candidates: CatalogModel[],
  pinned?: CatalogModel | null
): CatalogModel[] {
  if (!pinned) return candidates;
  const rest = candidates.filter((model) => model.catalogId !== pinned.catalogId);
  return [pinned, ...rest];
}

export async function routeRequest(params: RouteRequestParams): Promise<RouteRequestResult> {
  await assertTenantWithinLimits(params.tenant, params.routeType);

  const requestGroupId = randomUUID();
  await startRequestGroup({
    id: requestGroupId,
    tenantId: params.tenant.tenantId,
    routeType: params.routeType,
    debugTrace: params.tenant.debug,
  });

  const pinnedModelId = typeof params.payload.model === 'string' ? params.payload.model : undefined;
  const pinnedModel = pinnedModelId
    ? await getCatalogModelById(pinnedModelId, params.routeType)
    : null;

  let candidates = await rankCandidatesByHealth(
    await getCandidateModels(params.routeType, params.requirements || {})
  );
  candidates = reorderWithPinnedModel(candidates, pinnedModel);
  candidates = await filterModelsWithinLimits(candidates);

  if (candidates.length === 0) {
    await finishRequestGroup(requestGroupId, 'failed');
    return {
      statusCode: 503,
      response: { error: 'No eligible models in catalog', code: 'NO_MODELS' },
    };
  }

  const trace: BridgeRoutingTrace = { requestGroupId, attempts: [] };
  const isStreaming = params.routeType !== 'embeddings' && Boolean(params.payload.stream);
  let lastFailure: { statusCode: number; response: unknown } | null = null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const model = candidates[hop % candidates.length];

    const started = Date.now();
    const result = await invokeForModel(
      { tenantId: params.tenant.tenantId, model },
      {
        routeType: params.routeType,
        payload: params.payload,
      }
    );

    const latencyMs = Date.now() - started;
    trace.attempts.push({
      hop: hop + 1,
      provider: model.provider,
      modelId: model.modelId,
      statusCode: result.statusCode,
      success: result.ok,
      errorCode: result.errorCode,
      latencyMs,
    });

    await recordHop({
      id: randomUUID(),
      requestGroupId,
      tenantId: params.tenant.tenantId,
      hopIndex: hop + 1,
      provider: model.provider,
      modelId: model.modelId,
      providerKeyId: result.providerKeyId,
      statusCode: result.statusCode,
      success: result.ok,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      latencyMs,
      usage: result.usage,
      routeType: params.routeType,
      metadata: { adapter: result.adapter },
    });

    if (result.ok) {
      await incrementModelUsage(model.provider, model.modelId, result.usage.totalTokens || 0);
      await finishRequestGroup(requestGroupId, 'success');

      if (isStreaming && result.stream) {
        return {
          statusCode: 200,
          response: null,
          stream: result.stream,
          streamContentType: result.streamContentType,
          trace: params.tenant.debug ? trace : undefined,
        };
      }

      const response = params.tenant.debug
        ? { ...(result.body as object), _bridge: trace }
        : result.body;
      return {
        statusCode: result.statusCode,
        response,
        trace: params.tenant.debug ? trace : undefined,
      };
    }

    if (result.providerKeyId && result.retryAfterSeconds) {
      await applyQuotaResetHint(
        model.provider,
        model.modelId,
        result.providerKeyId,
        result.retryAfterSeconds
      );
    }

    lastFailure = {
      statusCode: result.statusCode,
      response: {
        error: result.errorMessage || 'Provider request failed',
        code: result.errorCode || 'PROVIDER_ERROR',
        model: model.modelId,
      },
    };
  }

  await finishRequestGroup(requestGroupId, 'failed');
  return {
    statusCode: lastFailure?.statusCode || 503,
    response: lastFailure?.response || {
      error: 'All routing attempts failed',
      code: 'ROUTING_FAILED',
    },
    trace: params.tenant.debug ? trace : undefined,
  };
}
