// API Reference - GET Models (IDs only) Response
export const getModelsResponse = `{
  "ids": [
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-chat:free"
  ],
  "count": 15
}`;

// API Reference - GET Models Full Response
export const getModelsFullResponse = `{
  "models": [
    {
      "id": "google/gemini-2.0-flash-exp:free",
      "name": "Gemini 2.0 Flash",
      "contextLength": 1000000,
      "maxCompletionTokens": 8192,
      "description": "...",
      "inputModalities": ["text", "image"],
      "outputModalities": ["text"],
      "supportedParameters": ["tools", "reasoning"]
    }
  ],
  "feedbackCounts": { ... },
  "lastUpdated": "2024-12-29T10:00:00Z",
  "filters": ["vision"],
  "sort": "contextLength",
  "count": 15
}`;

// API Reference - Feedback Response
export const feedbackResponse = `{ "received": true }`;
