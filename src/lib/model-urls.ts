/** Build the internal path for a model detail page */
export function modelDetailPath(modelId: string): string {
  return `/models/${modelId}`;
}

/** Extract provider name from model ID (e.g. "google" from "google/gemini-2.0-flash:free") */
export function getProviderFromId(modelId: string): string {
  return modelId.split('/')[0] || modelId;
}

/** Build the internal path for a provider detail page */
export function providerDetailPath(provider: string): string {
  return `/providers/${provider}`;
}
