/**
 * @file index.ts
 * @description Application Entrypoint. Bootstraps the environment, unlocks the Vault,
 * initializes requested providers, and starts the Hono HTTP server.
 */
import { serve } from '@hono/node-server';
import * as dotenv from 'dotenv';
import { getProvider } from './providers/index.ts';
import { app } from './app.ts';
import { fileURLToPath } from 'url';
import { loadEncryptedEnv, secureWipeDir, getVaultPassword, setVaultPassword, wipeVaultPassword } from './core/security/vault.ts';
import fs from 'fs';
import path from 'path';
import open from 'open';
import os from 'os';
import { askPassword } from './shared/utils/cli.ts';
import crypto from 'crypto';

function initializeEnvironment() {
  const envPath = path.resolve('.env');
  
  // $O(1) check prevents wasted I/O and crypto ops on subsequent boots
  if (fs.existsSync(envPath) || fs.existsSync(path.resolve('.env.enc'))) return;

  const envExamplePath = path.resolve('.env.example');

  try {
    if (fs.existsSync(envExamplePath)) {
      const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
      const generatedKey = 'sk-' + crypto.randomBytes(24).toString('hex');
      const apiKeyRegex = /^API_KEY=.*$/m;
      let newContent: string;

      if (apiKeyRegex.test(exampleContent)) {
        newContent = exampleContent.replace(apiKeyRegex, `API_KEY=${generatedKey}`);
      } else {
        // Fallback: Append safely if the placeholder is missing entirely
        newContent = exampleContent.trim() + `\nAPI_KEY=${generatedKey}\n`;
      }

      fs.writeFileSync(envPath, newContent, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      console.log('[Setup] No .env file found. Auto-generating one from .env.example...');
      console.log('[Setup] A unique, secure API_KEY has been generated and saved to your .env file with strict permissions (0600).\n');
    }
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      console.warn('[Setup] Could not auto-generate .env file:', err.message);
    }
  }
}

async function ensureVaultUnlocked() {
  if (process.env.TEST_MOCK_PLAYWRIGHT) return;
  
  const envEncPath = path.resolve('.env.enc');
  const hasEnvEnc = fs.existsSync(envEncPath);
  
  let requiresPassword = hasEnvEnc;
  if (!requiresPassword) {
    const cwdFiles = fs.readdirSync(process.cwd());
    requiresPassword = cwdFiles.some(f => f.endsWith('_profile.enc'));
  }

  if (!requiresPassword) return;
  
  const currentPwd = getVaultPassword();
  if (currentPwd) {
    if (hasEnvEnc) loadEncryptedEnv(envEncPath, currentPwd);
    return;
  }

  const password = await askPassword('Enter Vault Master Password: ');
  setVaultPassword(password);
  if (hasEnvEnc) loadEncryptedEnv(envEncPath, password);
  console.log('\nVault unlocked!');
}

async function bootstrap() {
  // 1. Vault Decryption
  await ensureVaultUnlocked();

  // 2. Environment Preparation
  initializeEnvironment();
  dotenv.config();

  if (!process.env.API_KEY) {
    console.warn('\n[!] WARNING: No API_KEY was found in your .env file or encrypted vault.');
    console.warn('[!] The API will remain blocked until you configure one and restart the server.\n');
  }

  if (process.env.DEEPSPROXY_PASSWORD) {
    setVaultPassword(process.env.DEEPSPROXY_PASSWORD);
  }

  // 3. Provider Initialization
  const activeProviders = (process.env.ACTIVE_PROVIDERS || 'deepseek').split(',').map(s => s.trim());
  await Promise.all(activeProviders.map(async (pid) => {
    try {
      const p = getProvider(pid);
      await p.init();
      console.log(`[Server] Provider '${pid}' initialized.`);
    } catch (e: any) {
      console.warn(`[Server] Could not initialize provider '${pid}': ${e.message}`);
    }
  }));

  // 4. Server Startup
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const hostname = process.env.HOST || '127.0.0.1';
  console.log(`[Server] Running on http://${hostname}:${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname
  });

  if (!process.env.NO_OPEN) {
    open(`http://${hostname}:${port}/`).catch(err => console.error('[Server] Could not open browser:', err));
  }
}

// Lifecycle Hooks
function cleanupTempProfiles() {
  const tmpRoot = os.tmpdir();
  const tempDirs = fs.readdirSync(tmpRoot).filter(d => d.startsWith('deepsproxy_profile_'));
  for (const d of tempDirs) {
    secureWipeDir(path.join(tmpRoot, d));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrap().catch((err: any) => {
    console.error('[Server] Fatal initialization error:', err);
    process.exit(1);
  });
}

function handleExit() {
  cleanupTempProfiles();
  wipeVaultPassword();
  process.exit(0);
}

process.on('exit', handleExit);
process.on('SIGINT', () => process.exit());
