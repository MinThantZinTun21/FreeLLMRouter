export const oneOffCall = `import { getModelIds, reportSuccess, reportIssue, issueFromStatus } from './free-llm-router';

const prompt = 'Summarize this article in 3 bullet points: ...';

try {
  // fetch ranked model IDs + requestId
  // Get top 3 models with both chat and vision capabilities
  // SDK has built-in 15-min cache, so this won't hit the API on every call
  const { ids: models, requestId } = await getModelIds(['chat', 'vision'], 'capable', 3);

  // Try each model until one succeeds
  for (const id of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${process.env.OPENROUTER_API_KEY}\`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: id,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) {
        // Report the right issue type - free, doesn't use quota
        reportIssue(id, issueFromStatus(res.status), requestId, \`HTTP \${res.status}\`);
        continue;
      }
      const data = await res.json();
      console.log(data.choices[0].message.content);
      // submit success feedback
      // Report success - helps other users know this model works!
      reportSuccess(id, requestId);
      break; // Success - exit loop
    } catch (e) {
      const status = e.status || e.response?.status;
      // submit issue feedback
      reportIssue(id, issueFromStatus(status), requestId, e.message); // Free - doesn't use quota
    }
  }
} catch {
  // API unavailable - handle gracefully
  console.error('Failed to fetch models');
}`;
