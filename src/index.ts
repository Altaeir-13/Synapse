import { serve } from '@hono/node-server';
import * as dotenv from 'dotenv';
import { getProvider } from './providers/index.ts';
import { app } from './app.ts';
import { fileURLToPath } from 'url';
import { decryptEnvFile, secureWipeDir } from './core/security/vault.ts';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';

dotenv.config();

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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise<void>((resolve) => {
    let hidden = false;
    rl.question('Enter Vault Master Password: ', (password) => {
      hidden = false;
      (globalThis as any)._vaultPassword = password;
      if (hasEnvEnc) decryptEnvFile(envEncPath, password);
      console.log('\nVault unlocked!');
      rl.close();
      resolve();
    });
    hidden = true;
    (rl as any)._writeToOutput = function _writeToOutput(stringToWrite: string) {
      if (!hidden) {
        (rl as any).output.write(stringToWrite);
      } else {
        (rl as any).output.write(stringToWrite.replace(/./g, '*'));
      }
    };
  });
}

ensureVaultUnlocked().then(() => {
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const activeProviders = (process.env.ACTIVE_PROVIDERS || 'deepseek').split(',').map(s => s.trim());

    Promise.all(activeProviders.map(async (pid) => {
      try {
        const p = getProvider(pid);
        await p.init();
        console.log(`[Init] Provider '${pid}' initialized.`);
      } catch (e: any) {
        console.warn(`[Init] Could not initialize provider '${pid}': ${e.message}`);
      }
    })).then(() => {
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
      const hostname = process.env.HOST || '127.0.0.1';
      console.log(`Server is running on http://${hostname}:${port}`);

      serve({
        fetch: app.fetch,
        port,
        hostname
      });
    }).catch((err: any) => {
      console.error('Failed to initialize server:', err);
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
