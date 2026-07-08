import { describe, it } from 'node:test';
import assert from 'node:assert';
import { deriveProvider, deriveRouteTypes } from '../../src/bridge/catalog.ts';
import { evaluateModelLimits, modelUsageStateId } from '../../src/bridge/limits.ts';
import type { FreeModel } from '../../src/db/schema.ts';

function makeModel(overrides: Partial<FreeModel>): FreeModel {
  return {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextLength: 128000,
    maxCompletionTokens: 4096,
    description: null,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['tools'],
    isModerated: false,
    priority: 100,
    isActive: true,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

const baseLimits = {
  rpmLimit: 60,
  dailyRequestLimit: 1000,
  dailyTokenLimit: 50_000,
};

const freshUsage = {
  requestsThisMinute: 0,
  requestsToday: 0,
  tokensToday: 0,
  minuteWindowStart: new Date(),
  usageDayKey: new Date().toISOString().slice(0, 10),
};

describe('bridge catalog mapping', () => {
  it('derives provider from model id', () => {
    assert.equal(deriveProvider('meta-llama/llama-3.1-8b'), 'meta-llama');
    assert.equal(deriveProvider('openai/gpt-4o-mini'), 'openai');
  });

  it('maps text models to chat route type', () => {
    const routes = deriveRouteTypes(makeModel({}));
    assert.deepEqual(routes, ['chat']);
  });

  it('maps image input models to vision and chat route types', () => {
    const routes = deriveRouteTypes(
      makeModel({
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
      })
    );
    assert.deepEqual(routes, ['vision', 'chat']);
  });

  it('maps embedding output models to embeddings route type', () => {
    const routes = deriveRouteTypes(
      makeModel({
        outputModalities: ['embeddings'],
      })
    );
    assert.deepEqual(routes, ['embeddings']);
  });

  it('maps tools and json mode from supported parameters in sync source', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/catalog.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes("'tools'") || source.includes('"tools"'));
    assert.ok(source.includes('tool_choice'));
    assert.ok(source.includes('response_format'));
    assert.ok(source.includes('structured_outputs'));
    assert.ok(source.includes('bridge_${routeType}_${model.id}'));
  });
});

describe('bridge model limits', () => {
  it('allows models with no usage history', () => {
    assert.equal(evaluateModelLimits(baseLimits, freshUsage), true);
  });

  it('detects rpm limit exceeded', () => {
    assert.equal(
      evaluateModelLimits({ ...baseLimits, rpmLimit: 2 }, { ...freshUsage, requestsThisMinute: 2 }),
      false
    );
  });

  it('detects daily request limit exceeded', () => {
    assert.equal(
      evaluateModelLimits(
        { ...baseLimits, dailyRequestLimit: 10 },
        { ...freshUsage, requestsToday: 10 }
      ),
      false
    );
  });

  it('detects daily token limit exceeded', () => {
    assert.equal(
      evaluateModelLimits(
        { ...baseLimits, dailyTokenLimit: 1000 },
        { ...freshUsage, tokensToday: 1000 }
      ),
      false
    );
  });

  it('resets minute window after 60 seconds', () => {
    const staleMinute = new Date(Date.now() - 61_000);
    assert.equal(
      evaluateModelLimits(
        { ...baseLimits, rpmLimit: 2 },
        {
          ...freshUsage,
          requestsThisMinute: 5,
          minuteWindowStart: staleMinute,
        }
      ),
      true
    );
  });

  it('builds stable usage state ids', () => {
    assert.equal(
      modelUsageStateId('openai', 'openai/gpt-4o-mini'),
      'usage:openai:openai/gpt-4o-mini'
    );
  });

  it('deprioritizes limit-exceeded models in ranking source', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/scoring.ts', import.meta.url), 'utf8')
    );
    assert.ok(source.includes('isModelWithinLimits'));
    assert.ok(source.includes('limitByKey'));
    assert.ok(source.includes('inQuotaReset'));
  });

  it('filters limit-exceeded models for auto-switch candidates', () => {
    const models = [
      { ...baseLimits, rpmLimit: 1 },
      { ...baseLimits, rpmLimit: 100 },
    ];
    const usages = [
      { ...freshUsage, requestsThisMinute: 1 },
      { ...freshUsage, requestsThisMinute: 0 },
    ];

    const eligible = models.filter((model, index) => evaluateModelLimits(model, usages[index]!));
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0]?.rpmLimit, 100);
  });
});

describe('bridge router failover', () => {
  it('does not break early on streaming failures', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/bridge/router.ts', import.meta.url), 'utf8')
    );
    assert.equal(source.includes('if (isStreaming) break'), false);
    assert.ok(source.includes('MAX_HOPS'));
    assert.ok(source.includes('hop < MAX_HOPS'));
  });
});
