/**
 * @file app.ts
 * @description Core Hono application configuration. Defines all HTTP routes, 
 * authentication middleware, CORS policies, and Dashboard APIs.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { timingSafeEqual } from 'crypto';
import { chatCompletions } from './api/routes/chat.ts';
import { getContextLength } from './core/telemetry/telemetry.ts';

export const app = new Hono();

import fs from 'fs';
import path from 'path';
import { initPlaywright, getActivePage, closePlaywright } from './providers/playwright.ts';
import { encryptBuffer, packAndEncryptDir, secureWipeDir } from './core/security/vault.ts';

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

app.use('/v1/*', async (c, next) => {
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
      modelEntry('CohereLabs/c4ai-command-r-08-2024', 'huggingface'),
      modelEntry('kimi-chat', 'moonshot'),
      modelEntry('moonshot-v1-8k', 'moonshot'),
      modelEntry('glm-4', 'zhipu'),
      modelEntry('mimo-v2.5-pro', 'xiaomi')
    ]
  });
});

import { getConnInfo } from '@hono/node-server/conninfo';

// --------------------------------------------------------------------
// Dashboard GUI Routes (Zero-Terminal)
// --------------------------------------------------------------------

const requireLocalhost = async (c: any, next: any) => {
  try {
    const conn = getConnInfo(c);
    const ip = conn.remote.address;
    if (ip !== '127.0.0.1' && ip !== '::1') {
      return c.text('Forbidden: Dashboard is locked to localhost for security.', 403);
    }
  } catch (e) {
    return c.text('Forbidden: Unable to verify IP', 403);
  }
  await next();
};

app.use('/', requireLocalhost);
app.use('/api/dashboard/*', requireLocalhost);

app.get('/', (c) => {
  try {
    const html = fs.readFileSync(path.resolve('src/dashboard/index.html'), 'utf-8');
    return c.html(html);
  } catch (e) {
    return c.text('Dashboard not found.', 404);
  }
});

app.get('/api/dashboard/status', (c) => {
  const vaultUnlocked = !!(globalThis as any)._vaultPassword;
  const cwdFiles = fs.readdirSync(process.cwd());
  const vaultExists = cwdFiles.some(f => f.endsWith('_profile.enc')) || fs.existsSync(path.resolve('.env.enc'));

  const providers = ['deepseek', 'kimi', 'glm', 'mimo', 'huggingface'];
  const activeProfiles = providers.filter(id => {
    // A profile is ready if the page is active, OR if it has an encrypted vault file, OR if it has a local plaintext folder
    if (getActivePage(id)) return true;
    if (cwdFiles.includes(`${id}_profile.enc`) && vaultUnlocked) return true;
    if (cwdFiles.includes(`${id}_profile`)) return true;
    return false;
  });

  return c.json({
    vaultUnlocked,
    vaultExists,
    activeProfiles
  });
});

app.post('/api/dashboard/login/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await closePlaywright(id); // Force close the headless instance first
    await new Promise(r => setTimeout(r, 1500)); // Wait for Chromium file locks to release
    await initPlaywright(id, false); // false = not headless, so user can login
    const page = getActivePage(id);
    if (page) {
      if (id === 'huggingface') await page.goto('https://huggingface.co/chat/', { waitUntil: 'domcontentloaded' });
      else if (id === 'kimi') await page.goto('https://www.kimi.com/', { waitUntil: 'domcontentloaded' });
      else if (id === 'glm') await page.goto('https://chat.z.ai/', { waitUntil: 'domcontentloaded' });
      else if (id === 'mimo') await page.goto('https://aistudio.xiaomimimo.com/', { waitUntil: 'domcontentloaded' });
      else await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded' });
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/dashboard/vault/setup', async (c) => {
  const body = await c.req.json();
  const password = body.password;
  if (!password || password.length < 4) return c.text('Password too short', 400);

  try {
    (globalThis as any)._vaultPassword = password;
    
    const envPath = path.resolve('.env');
    const envEncPath = path.resolve('.env.enc');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath);
      const encryptedEnv = encryptBuffer(envContent, password);
      fs.writeFileSync(envEncPath, encryptedEnv);
      fs.unlinkSync(envPath);
    }
    
    const cwdFiles = fs.readdirSync(process.cwd());
    for (const file of cwdFiles) {
      if (file.endsWith('_profile') && fs.statSync(file).isDirectory()) {
        await packAndEncryptDir(file, `${file}.enc`, password);
        secureWipeDir(file);
      }
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

