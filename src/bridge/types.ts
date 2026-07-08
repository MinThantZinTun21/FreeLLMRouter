export type BridgeRouteType = 'chat' | 'vision' | 'embeddings';

export interface RouteFeatureRequirements {
  tools?: boolean;
  jsonMode?: boolean;
  minContext?: number;
  minOutput?: number;
}

export interface CatalogModel {
  catalogId: string;
  provider: string;
  modelId: string;
  routeType: BridgeRouteType;
  supportsTools: boolean;
  supportsJsonMode: boolean;
  maxContext: number | null;
  maxOutput: number | null;
  rpmLimit: number;
  dailyRequestLimit: number | null;
  dailyTokenLimit: number;
}

export interface TenantLimits {
  rpmLimitChat: number;
  rpmLimitVision: number;
  rpmLimitEmbeddings: number;
  dailyLimitChat: number;
  dailyLimitVision: number;
  dailyLimitEmbeddings: number;
}

export interface TenantContext {
  tenantId: string;
  apiKeyId: string;
  debug: boolean;
  limits: TenantLimits;
}

export interface BridgeRoutingTrace {
  requestGroupId: string;
  attempts: Array<{
    hop: number;
    provider: string;
    modelId: string;
    statusCode?: number;
    success: boolean;
    errorCode?: string;
    latencyMs?: number;
  }>;
}

export interface TokenUsage {
  requestTokens?: number;
  responseTokens?: number;
  totalTokens?: number;
  source: 'provider' | 'estimated' | 'unknown';
}
