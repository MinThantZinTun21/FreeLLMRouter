/**
 * Shared types and logic for model filtering and sorting.
 *
 * This file focuses on business logic. Parameter definitions are now centralized
 * in api-definitions.ts as a single source of truth.
 */

// Import types and definitions from api-definitions.ts (single source of truth)
import type { UseCaseType, SortType } from './api-definitions';

export {
  type UseCaseType,
  type SortType,
  type UseCaseDefinition,
  type SortDefinition,
  VALID_USE_CASES,
  VALID_SORTS,
  USE_CASE_DEFINITIONS,
  SORT_DEFINITIONS,
  validateUseCases,
  validateSort,
} from './api-definitions';

/**
 * Use case criteria constants - defines what each use case checks.
 * Used by both frontend (JS) and backend (SQL) implementations.
 */
export const USE_CASE_CRITERIA = {
  chat: {
    // Check modality is text->text OR outputModalities includes 'text'
    field: 'modality',
    value: 'text->text',
    altField: 'outputModalities',
    altIncludes: 'text',
  },
  vision: {
    // Check inputModalities includes 'image'
    field: 'inputModalities',
    includes: 'image',
  },
  tools: {
    // Check supportedParameters includes 'tools'
    field: 'supportedParameters',
    includes: 'tools',
  },
  longContext: {
    // Check contextLength >= 100000
    field: 'contextLength',
    gte: 100000,
  },
  reasoning: {
    // Check supportedParameters includes 'reasoning' OR 'include_reasoning'
    field: 'supportedParameters',
    includesAny: ['reasoning', 'include_reasoning'],
  },
} as const;

/**
 * Sort criteria constants - defines what each sort orders by.
 * Used by both frontend (JS) and backend (SQL) implementations.
 */
export const SORT_CRITERIA = {
  contextLength: { field: 'contextLength', direction: 'desc' },
  maxOutput: { field: 'maxCompletionTokens', direction: 'desc' },
  capable: { field: 'supportedParameters', aggregation: 'length', direction: 'desc' },
  leastIssues: { field: 'errorRate', direction: 'asc' },
  newest: { field: 'createdAt', direction: 'desc' },
} as const;

// Common model interface for filtering/sorting (subset of full model)
export interface FilterableModel {
  modality: string | null;
  inputModalities: string[] | null;
  outputModalities: string[] | null;
  supportedParameters: string[] | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  createdAt?: string | Date | null;
  issueCount?: number;
  errorRate?: number;
}

/**
 * Check if a model matches a single use case criteria.
 * Single source of truth for use case logic - used by frontend.
 */
export function matchesUseCase<T extends FilterableModel>(model: T, useCase: UseCaseType): boolean {
  switch (useCase) {
    case 'chat':
      return model.modality === 'text->text' || (model.outputModalities?.includes('text') ?? false);
    case 'vision':
      return model.inputModalities?.includes('image') ?? false;
    case 'tools':
      return model.supportedParameters?.includes('tools') ?? false;
    case 'longContext':
      return model.contextLength !== null && model.contextLength >= 100000;
    case 'reasoning':
      return (
        (model.supportedParameters?.includes('reasoning') ||
          model.supportedParameters?.includes('include_reasoning')) ??
        false
      );
    default:
      return true;
  }
}

/**
 * Filter models by multiple use case criteria (AND logic).
 * Single source of truth for filtering - used by frontend.
 */
export function filterModelsByUseCase<T extends FilterableModel>(
  models: T[],
  useCases: UseCaseType[]
): T[] {
  if (useCases.length === 0) return models;
  return models.filter((model) => useCases.every((useCase) => matchesUseCase(model, useCase)));
}

/**
 * Get sort value for a model based on sort type.
 * Single source of truth for sort logic - used by frontend.
 */
export function getSortValue<T extends FilterableModel>(model: T, sort: SortType): number {
  switch (sort) {
    case 'contextLength':
      return model.contextLength ?? 0;
    case 'maxOutput':
      return model.maxCompletionTokens ?? 0;
    case 'capable':
      return model.supportedParameters?.length ?? 0;
    case 'leastIssues':
      return model.errorRate ?? 0;
    case 'newest':
      return model.createdAt ? new Date(model.createdAt).getTime() : 0;
    default:
      return 0;
  }
}

/**
 * Sort models by criteria.
 * Single source of truth for sorting - used by frontend and backend.
 * Uses contextLength as tie-breaker for consistent ordering.
 */
export function sortModels<T extends FilterableModel>(models: T[], sort: SortType): T[] {
  const sorted = [...models];
  const direction = SORT_CRITERIA[sort].direction;

  return sorted.sort((a, b) => {
    const valueA = getSortValue(a, sort);
    const valueB = getSortValue(b, sort);
    const primary = direction === 'desc' ? valueB - valueA : valueA - valueB;

    if (primary !== 0) return primary;

    // Tie-breaker: contextLength desc
    return (b.contextLength ?? 0) - (a.contextLength ?? 0);
  });
}
