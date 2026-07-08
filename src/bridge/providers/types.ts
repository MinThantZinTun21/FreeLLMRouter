import type { BridgeRouteType, CatalogModel, TokenUsage } from '../types';

export interface ProviderInvokeParams {
  routeType: BridgeRouteType;
  model: CatalogModel;
  apiKey: string;
  payload: Record<string, unknown>;
}

export interface ProviderInvokeResult {
  ok: boolean;
  statusCode: number;
  body?: unknown;
  stream?: ReadableStream<Uint8Array> | null;
  streamContentType?: string;
  usage: TokenUsage;
  errorCode?: string;
  errorMessage?: string;
  retryAfterSeconds?: number;
}

export interface ProviderAdapter {
  name: string;
  supports(routeType: BridgeRouteType, model: CatalogModel): boolean;
  invoke(params: ProviderInvokeParams): Promise<ProviderInvokeResult>;
}
