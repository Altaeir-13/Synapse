import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timingSafeEqual } from 'crypto';
import { chatCompletions } from './api/routes/chat.ts';
import { getContextLength } from './core/telemetry/telemetry.ts';

export const app = new Hono();

export function modelEntry(id: string, owner: string = 'deepseek') {
  const dynamicLimit = getContextLength(id);
  return {
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: owner,
    permission: [],
    root: id,
    parent: null,
    context_length: dynamicLimit,
    max_context_tokens: dynamicLimit,
    max_input_tokens: dynamicLimit,
    max_output_tokens: 8_000,
  };
}

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*'; // Allow local non-browser clients (curl, desktop apps)
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return origin;
    }
    return null; // Reject malicious sites trying to CSRF the local proxy
  }
}));

app.use('*', async (c, next) => {
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const authHeader = c.req.header('Authorization');
    const xApiKey = c.req.header('X-API-Key');
    const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : xApiKey;
    if (!providedKey || providedKey.length !== apiKey.length || !timingSafeEqual(Buffer.from(providedKey), Buffer.from(apiKey))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }
  await next();
});

// Basic health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// OpenAI compatible routes
app.post('/v1/chat/completions', chatCompletions);

app.get('/v1/models', (c) => {
  return c.json({
    object: 'list',
    data: [
      modelEntry('deepseek-v4-flash', 'deepseek'),
      modelEntry('deepseek-v4-flash-thinking', 'deepseek'),
      modelEntry('deepseek-v4-pro', 'deepseek'),
      modelEntry('deepseek-v4-pro-thinking', 'deepseek'),
      modelEntry('meta-llama/Llama-3.1-70B-Instruct', 'huggingface'),
      modelEntry('google/gemma-2-27b-it', 'huggingface'),
      modelEntry('Qwen/Qwen2.5-72B-Instruct', 'huggingface'),
      modelEntry('mistralai/Mistral-Nemo-Instruct-2407', 'huggingface'),
      modelEntry('kimi-chat', 'moonshot'),
      modelEntry('moonshot-v1-8k', 'moonshot'),
      modelEntry('glm-4', 'zhipu'),
      modelEntry('mimo-v2.5-pro', 'xiaomi')
    ]
  });
});
