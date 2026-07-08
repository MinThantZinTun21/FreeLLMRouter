/** Free LLM Router helper. Set FREE_LLM_ROUTER_API_KEY in your environment. */

const API = 'https://freellmrouter.com/api/v1';
const API_KEY = typeof process !== 'undefined' ? process.env.FREE_LLM_ROUTER_API_KEY : undefined;

type UseCase = 'chat' | 'vision' | 'tools' | 'longContext' | 'reasoning';
type Sort = 'contextLength' | 'maxOutput' | 'capable' | 'leastIssues' | 'newest';
type CacheMode = 'default' | 'no-store';
type TimeRange = '15m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds

interface GetModelIdsResult {
  ids: string[];
  requestId: string;
}

const cache = new Map<string, { data: GetModelIdsResult; timestamp: number }>();

/** Returns `{ ids, requestId }`. Calling with no params uses saved API-key preferences if configured. */
export async function getModelIds(
  useCase?: UseCase[],
  sort?: Sort,
  topN?: number,
  options?: {
    cache?: CacheMode;
    maxErrorRate?: number;
    timeRange?: TimeRange;
    myReports?: boolean;
  }
): Promise<GetModelIdsResult> {
  // Keep cache keys stable regardless of useCase order.
  const normalizedUseCase = useCase ? [...useCase].sort() : undefined;

  const cacheKey = JSON.stringify({
    useCase: normalizedUseCase,
    sort,
    topN,
    maxErrorRate: options?.maxErrorRate,
    timeRange: options?.timeRange,
    myReports: options?.myReports,
  });

  const cached = cache.get(cacheKey);
  const cacheMode = options?.cache ?? 'default';

  if (cacheMode === 'default' && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams();
    if (normalizedUseCase) params.set('useCase', normalizedUseCase.join(','));
    if (sort) params.set('sort', sort);
    if (topN) params.set('topN', String(topN));
    if (options?.maxErrorRate !== undefined) {
      params.set('maxErrorRate', String(options.maxErrorRate));
    }
    if (options?.timeRange) {
      params.set('timeRange', options.timeRange);
    }
    if (options?.myReports) {
      params.set('myReports', 'true');
    }

    const { ids, requestId } = await fetch(`${API}/models/ids?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json());

    const result: GetModelIdsResult = { ids, requestId };

    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    // Prefer stale cache over hard failure when available.
    if (cached) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('API request failed, using stale cached data', error);
      }
      return cached.data;
    }
    throw error;
  }
}

/** Fire-and-forget feedback call (does not throw). */
export function reportIssue(
  modelId: string,
  issue: 'error' | 'rate_limited' | 'unavailable',
  requestId?: string,
  details?: string
) {
  fetch(`${API}/models/feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modelId, issue, requestId, details }),
  }).catch(() => {});
}

/** Fire-and-forget feedback call (does not throw). */
export function reportSuccess(modelId: string, requestId?: string, details?: string) {
  fetch(`${API}/models/feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modelId, success: true, requestId, details }),
  }).catch(() => {});
}

export function issueFromStatus(status: number): 'rate_limited' | 'unavailable' | 'error' {
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'error';
}

// DOCS_SNIPPETS_START
interface GetModelIdsSnippetOptions {
  useCases?: string[];
  sort?: string;
  topN?: number;
  maxErrorRate?: number;
  timeRange?: string;
  myReports?: boolean;
}

function buildOptionsLiteral({
  maxErrorRate,
  timeRange,
  myReports,
}: Pick<GetModelIdsSnippetOptions, 'maxErrorRate' | 'timeRange' | 'myReports'>):
  | string
  | undefined {
  const optionParts: string[] = [];

  if (maxErrorRate !== undefined) {
    optionParts.push(`maxErrorRate: ${maxErrorRate}`);
  }
  if (timeRange !== undefined) {
    optionParts.push(`timeRange: '${timeRange}'`);
  }
  if (myReports) {
    optionParts.push(`myReports: true`);
  }

  return optionParts.length > 0 ? `{ ${optionParts.join(', ')} }` : undefined;
}

function buildGetModelIdsInvocation(options: GetModelIdsSnippetOptions): string {
  const args: Array<string | undefined> = [];
  const useCases =
    options.useCases !== undefined
      ? `[${options.useCases.map((useCase) => `'${useCase}'`).join(', ')}]`
      : undefined;
  const sort = options.sort ? `'${options.sort}'` : undefined;
  const topN = options.topN !== undefined ? String(options.topN) : undefined;
  const optionsLiteral = buildOptionsLiteral(options);

  if (useCases !== undefined) args[0] = useCases;
  if (sort !== undefined) args[1] = sort;

  if (topN !== undefined) {
    if (args[0] === undefined) args[0] = 'undefined';
    if (args[1] === undefined) args[1] = 'undefined';
    args[2] = topN;
  }

  if (optionsLiteral !== undefined) {
    if (args[0] === undefined) args[0] = 'undefined';
    if (args[1] === undefined) args[1] = 'undefined';
    if (args[2] === undefined) args[2] = 'undefined';
    args[3] = optionsLiteral;
  }

  while (args.length > 0 && args[args.length - 1] === undefined) {
    args.pop();
  }

  const joinedArgs = args.filter((arg): arg is string => arg !== undefined).join(', ');
  return joinedArgs ? `getModelIds(${joinedArgs})` : 'getModelIds()';
}

export function getModelIdsDefaultCallSnippet(): string {
  return `const { ids, requestId } = await ${buildGetModelIdsInvocation({})}`;
}

export function getModelIdsCallSnippet(options: GetModelIdsSnippetOptions): string {
  return `const { ids, requestId } = await ${buildGetModelIdsInvocation(options)}`;
}

export function basicUsageSnippet(options: GetModelIdsSnippetOptions): string {
  const getModelsCall = getModelIdsCallSnippet(options);
  const getModelsCallIndented = getModelsCall
    .replace('const { ids, requestId } =', 'const { ids: freeModels, requestId } =')
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  const isDefaultCall =
    options.useCases === undefined &&
    options.sort === undefined &&
    options.topN === undefined &&
    options.maxErrorRate === undefined &&
    options.timeRange === undefined &&
    options.myReports !== true;
  const defaultCallComment = isDefaultCall
    ? '// getModelIds() with no params applies your saved configured params automatically\n'
    : '';

  return `import { getModelIds, reportSuccess, reportIssue, issueFromStatus } from './free-llm-router';

try {
${defaultCallComment}${getModelsCallIndented}

  for (const id of freeModels) {
    try {
      const res = await client.chat.completions.create({ model: id, messages });
      // submit success feedback
      reportSuccess(id, requestId);
      return res;
    } catch (e) {
      const status = e.status || e.response?.status;
      // submit issue feedback
      reportIssue(id, issueFromStatus(status), requestId, e.message);
    }
  }
} catch {
  // E.g. return await client.chat.completions.create({ model: 'anthropic/claude-3.5-sonnet', messages });
}
throw new Error('All models failed');`;
}
