export const chatbot = `import { getModelIds, reportSuccess, reportIssue, issueFromStatus } from './free-llm-router';
import OpenAI from 'openai';

// OpenAI SDK works with OpenRouter's API
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Store conversation history for multi-turn chat
const messages: OpenAI.ChatCompletionMessageParam[] = [];

async function chat(userMessage: string) {
  messages.push({ role: 'user', content: userMessage });

  try {
    // fetch ranked model IDs + requestId
    // SDK has built-in 15-min cache, so this won't hit the API on every call
    const { ids: models, requestId } = await getModelIds(['chat'], 'capable', 5);

    for (const id of models) {
      try {
        const res = await client.chat.completions.create({
          model: id,
          messages, // Include full history
        });
        const reply = res.choices[0].message.content;
        messages.push({ role: 'assistant', content: reply });
        // submit success feedback
        // Report success - helps other users know this model works!
        reportSuccess(id, requestId);
        return reply;
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
