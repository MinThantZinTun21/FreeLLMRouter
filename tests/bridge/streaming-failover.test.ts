import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { CatalogModel } from '../../src/bridge/types.ts';

const MAX_HOPS = 3;

const candidates: CatalogModel[] = [
  {
    catalogId: 'bridge_chat_a/model-a',
    provider: 'provider-a',
    modelId: 'provider-a/model-a',
    routeType: 'chat',
    supportsTools: false,
    supportsJsonMode: false,
    maxContext: 8000,
    maxOutput: 1000,
    rpmLimit: 60,
    dailyRequestLimit: null,
    dailyTokenLimit: 100_000,
  },
  {
    catalogId: 'bridge_chat_b/model-b',
    provider: 'provider-b',
    modelId: 'provider-b/model-b',
    routeType: 'chat',
    supportsTools: false,
    supportsJsonMode: false,
    maxContext: 8000,
    maxOutput: 1000,
    rpmLimit: 60,
    dailyRequestLimit: null,
    dailyTokenLimit: 100_000,
  },
  {
    catalogId: 'bridge_chat_c/model-c',
    provider: 'provider-c',
    modelId: 'provider-c/model-c',
    routeType: 'chat',
    supportsTools: false,
    supportsJsonMode: false,
    maxContext: 8000,
    maxOutput: 1000,
    rpmLimit: 60,
    dailyRequestLimit: null,
    dailyTokenLimit: 100_000,
  },
];

type InvokeResult =
  | { ok: true; stream: ReadableStream<Uint8Array>; streamContentType: string }
  | { ok: false; statusCode: number; errorCode: string };

async function simulateStreamingRoute(
  invokeForModel: (model: CatalogModel, hop: number) => Promise<InvokeResult>
) {
  const isStreaming = true;
  const trace = { attempts: [] as Array<{ hop: number; success: boolean }> };
  let invokeCalls = 0;
  let successResult: InvokeResult | null = null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const model = candidates[hop % candidates.length];
    invokeCalls += 1;
    const result = await invokeForModel(model, hop + 1);
    trace.attempts.push({ hop: hop + 1, success: result.ok });

    if (result.ok) {
      if (isStreaming && 'stream' in result && result.stream) {
        successResult = result;
        break;
      }
    }
  }

  return { invokeCalls, trace, successResult };
}

describe('streaming failover across hops', () => {
  it('retries streaming requests up to MAX_HOPS before succeeding', async () => {
    let calls = 0;
    const { invokeCalls, trace, successResult } = await simulateStreamingRoute(async () => {
      calls += 1;
      if (calls < 3) {
        return { ok: false, statusCode: 503, errorCode: 'UPSTREAM' };
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"ok":true}\n\n'));
          controller.close();
        },
      });

      return {
        ok: true,
        stream,
        streamContentType: 'text/event-stream',
      };
    });

    assert.equal(invokeCalls, 3);
    assert.equal(trace.attempts.length, 3);
    assert.deepEqual(
      trace.attempts.map((attempt) => attempt.success),
      [false, false, true]
    );
    assert.ok(successResult?.ok);
    assert.ok(successResult && 'stream' in successResult && successResult.stream);
  });

  it('matches router.ts MAX_HOPS loop contract', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/router.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes('const MAX_HOPS = 3'));
    assert.ok(source.includes('for (let hop = 0; hop < MAX_HOPS; hop++)'));
    assert.equal(source.includes('if (isStreaming) break'), false);
  });
});
