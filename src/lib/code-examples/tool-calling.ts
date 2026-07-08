export const toolCalling = `import { getModelIds, reportSuccess, reportIssue, issueFromStatus } from './free-llm-router';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

// Vercel AI SDK with OpenRouter
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Define tools with Zod schemas
const tools = {
  getWeather: tool({
    description: 'Get current weather for a location',
    parameters: z.object({ location: z.string() }),
    execute: async ({ location }) => \`72°F and sunny in \${location}\`,
  }),
};

async function askWithTools(prompt: string) {
  try {
    // Filter for models that support tool calling
    // fetch ranked model IDs + requestId
    // SDK has built-in 15-min cache, so this won't hit the API on every call
    const { ids: models, requestId } = await getModelIds(['tools'], 'capable', 3);

    for (const id of models) {
      try {
        const { text, toolCalls } = await generateText({
          model: openrouter(id),
          prompt,
          tools,
        });
        // submit success feedback
        reportSuccess(id, requestId); // Helps improve health metrics
        return { text, toolCalls };
      } catch (e) {
        // submit issue feedback
        // Report with correct issue type - free, doesn't use quota
        reportIssue(id, issueFromStatus(e.status), requestId, e.message);
      }
    }
  } catch {
    // API unavailable
  }
  throw new Error('All models failed');
}`;
