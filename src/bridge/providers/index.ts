import { resolveProviderKey } from '../provider-keys';
import { isInCooldown } from '../state';
import type { CatalogModel } from '../types';
import { directAdapter, getDirectBaseUrl } from './direct';
import { openRouterAdapter } from './openrouter';
import type { ProviderAdapter, ProviderInvokeParams, ProviderInvokeResult } from './types';

export interface InvokeContext {
  tenantId: string;
  model: CatalogModel;
}

export async function invokeForModel(
  ctx: InvokeContext,
  params: Omit<ProviderInvokeParams, 'apiKey' | 'model'>
): Promise<ProviderInvokeResult & { providerKeyId?: string; adapter: string }> {
  const strategies: Array<{ adapter: ProviderAdapter; providerKeyName: string }> = [];

  if (getDirectBaseUrl(ctx.model.provider)) {
    strategies.push({ adapter: directAdapter, providerKeyName: ctx.model.provider });
  }
  strategies.push({ adapter: openRouterAdapter, providerKeyName: 'openrouter' });

  let lastResult: (ProviderInvokeResult & { providerKeyId?: string; adapter: string }) | null =
    null;

  for (const strategy of strategies) {
    if (!strategy.adapter.supports(params.routeType, ctx.model)) continue;

    const key = await resolveProviderKey(strategy.providerKeyName, ctx.tenantId);
    if (!key) continue;

    if (await isInCooldown(ctx.model.provider, ctx.model.modelId, key.id)) {
      lastResult = {
        ok: false,
        statusCode: 503,
        adapter: strategy.adapter.name,
        providerKeyId: key.id,
        usage: { source: 'unknown' },
        errorCode: 'COOLDOWN',
        errorMessage: 'Provider key is in cooldown',
      };
      continue;
    }

    const result = await strategy.adapter.invoke({
      ...params,
      model: ctx.model,
      apiKey: key.apiKey,
    });

    const wrapped = { ...result, providerKeyId: key.id, adapter: strategy.adapter.name };
    if (result.ok) return wrapped;
    lastResult = wrapped;

    if (result.errorCode === 'AUTH') continue;
  }

  if (lastResult) return lastResult;

  return {
    ok: false,
    statusCode: 503,
    adapter: 'none',
    usage: { source: 'unknown' },
    errorCode: 'NO_PROVIDER_KEY',
    errorMessage: 'No active provider key available for this model',
  };
}

export { getDirectBaseUrl, openRouterAdapter, directAdapter };
