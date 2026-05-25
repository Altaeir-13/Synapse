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
import { decryptEnvFile, secureWipeDir } from './core/security/vault.ts';
import fs from 'fs';
import path from 'path';
import open from 'open';
import os from 'os';
import { askPassword } from './shared/utils/cli.ts';

dotenv.config();
import crypto from 'crypto';

if (!process.env.API_KEY) {
  process.env.API_KEY = 'sk-' + crypto.randomBytes(24).toString('hex');
  console.warn('\n[!] WARNING: No API_KEY was found in environment.');
  console.warn(`[!] A secure API Key was auto-generated for this session:\n`);
  console.warn(`    ${process.env.API_KEY}\n`);
  console.warn(`[!] To make this permanent, add API_KEY=... to your .env file.\n`);
}

(globalThis as any)._vaultPassword = process.env.DEEPSPROXY_PASSWORD || '';

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
  
  if ((globalThis as any)._vaultPassword) {
    if (hasEnvEnc) decryptEnvFile(envEncPath, (globalThis as any)._vaultPassword);
    return;
  }

  const password = await askPassword('Enter Vault Master Password: ');
  (globalThis as any)._vaultPassword = password;
  if (hasEnvEnc) decryptEnvFile(envEncPath, password);
  console.log('\nVault unlocked!');
}

ensureVaultUnlocked().then(() => {
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const activeProviders = (process.env.ACTIVE_PROVIDERS || 'deepseek').split(',').map(s => s.trim());

    Promise.all(activeProviders.map(async (pid) => {
      try {
        const p = getProvider(pid);
        await p.init();
        console.log(`[Server] Provider '${pid}' initialized.`);
      } catch (e: any) {
        console.warn(`[Server] Could not initialize provider '${pid}': ${e.message}`);
      }
    })).then(() => {
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
      const hostname = process.env.HOST || '127.0.0.1';
      console.log(`[Server] Running on http://${hostname}:${port}`);

      serve({
        fetch: app.fetch,
        port,
        hostname
      });

      // Auto-open browser for GUI Dashboard
      if (!process.env.NO_OPEN) {
        open(`http://${hostname}:${port}/`).catch(err => console.error('[Server] Could not open browser:', err));
      }
    }).catch((err: any) => {
      console.error('[Server] Failed to initialize:', err);
      process.exit(1);
    });
  }
});

// Cleanup orphaned temp profiles on startup and shutdown
function cleanupTempProfiles() {
  const tmpRoot = os.tmpdir();
  const tempDirs = fs.readdirSync(tmpRoot).filter(d => d.startsWith('deepsproxy_profile_'));
  for (const d of tempDirs) {
    secureWipeDir(path.join(tmpRoot, d));
  }
}
cleanupTempProfiles();
process.on('exit', cleanupTempProfiles);
process.on('SIGINT', () => process.exit());
