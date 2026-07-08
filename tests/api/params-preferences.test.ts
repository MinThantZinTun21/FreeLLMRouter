import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validatePreferences, MAX_EXCLUDED_MODELS } from '../../src/lib/api-definitions.ts';
import { parseModelParams } from '../../src/lib/api-params.ts';

describe('validatePreferences', () => {
  it('sanitizes excludeModelIds (trim, dedupe, drop empty)', () => {
    const result = validatePreferences({
      excludeModelIds: ['  a/model  ', 'b/model', '', 'a/model', '   '],
    });

    assert.deepStrictEqual(result.excludeModelIds, ['a/model', 'b/model']);
  });

  it('drops non-string excluded model IDs', () => {
    const result = validatePreferences({
      excludeModelIds: ['a/model', 42, null, true, 'b/model'],
    });

    assert.deepStrictEqual(result.excludeModelIds, ['a/model', 'b/model']);
  });

  it(`caps excluded model IDs at ${MAX_EXCLUDED_MODELS}`, () => {
    const ids = Array.from({ length: MAX_EXCLUDED_MODELS + 10 }, (_, i) => `m/${i}`);
    const result = validatePreferences({ excludeModelIds: ids });

    assert.strictEqual(result.excludeModelIds?.length, MAX_EXCLUDED_MODELS);
    assert.deepStrictEqual(result.excludeModelIds?.slice(0, 3), ['m/0', 'm/1', 'm/2']);
  });
});

describe('parseModelParams', () => {
  it('defaults excludeModelIds to empty array', () => {
    const params = parseModelParams(new URLSearchParams(), {});
    assert.deepStrictEqual(params.excludeModelIds, []);
  });

  it('uses saved excludeModelIds from preferences', () => {
    const params = parseModelParams(new URLSearchParams(), {
      excludeModelIds: ['a/model', 'b/model'],
    });
    assert.deepStrictEqual(params.excludeModelIds, ['a/model', 'b/model']);
  });

  it('ignores excludeModels query param (no request-level override)', () => {
    const searchParams = new URLSearchParams('excludeModels=one,two');
    const params = parseModelParams(searchParams, {
      excludeModelIds: ['saved/model'],
    });

    assert.deepStrictEqual(params.excludeModelIds, ['saved/model']);
  });

  it('supports internal clear flag for demo endpoint', () => {
    const searchParams = new URLSearchParams('_clearExcludedModels=true');
    const params = parseModelParams(searchParams, {
      excludeModelIds: ['saved/model'],
    });

    assert.deepStrictEqual(params.excludeModelIds, []);
  });
});
