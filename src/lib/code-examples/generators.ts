import {
  basicUsageSnippet,
  getModelIdsCallSnippet,
  getModelIdsDefaultCallSnippet,
} from './free-llm-router';

export const basicUsage = (
  useCases: string[],
  sort: string,
  topN?: number,
  maxErrorRate?: number,
  timeRange?: string,
  myReports?: boolean
) => {
  return basicUsageSnippet({
    useCases,
    sort,
    topN,
    maxErrorRate,
    timeRange,
    myReports,
  });
};

export const basicUsageDefault = () => basicUsageSnippet({});

export const getModelIdsCall = (
  useCases: string[],
  sort: string,
  topN?: number,
  maxErrorRate?: number,
  timeRange?: string,
  myReports?: boolean
) => {
  return getModelIdsCallSnippet({
    useCases,
    sort,
    topN,
    maxErrorRate,
    timeRange,
    myReports,
  });
};

export const getModelIdsDefaultCall = () => getModelIdsDefaultCallSnippet();
