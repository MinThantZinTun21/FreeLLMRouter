function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Controls whether raw error-rate count details are included in API responses.
 * Default is false (details hidden).
 */
export function exposeErrorRateDetails(runtimeEnv?: Record<string, string | undefined>): boolean {
  return (
    isTruthyFlag(runtimeEnv?.EXPOSE_ERROR_RATE_DETAILS) ||
    isTruthyFlag(import.meta.env.EXPOSE_ERROR_RATE_DETAILS)
  );
}
