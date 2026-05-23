import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from '../shared/utils/mutex.ts';
import { decryptAndUnpackDir, packAndEncryptDir, secureWipeDir } from '../core/security/vault.ts';

const contexts: Record<string, BrowserContext> = {};
const activePages: Record<string, Page> = {};
const mutexes: Record<string, Mutex> = {};
const activeTempDirs: Record<string, string> = {};

export async function initPlaywright(providerId: string, headless = true) {
  if (process.env.TEST_MOCK_PLAYWRIGHT) return;
  if (contexts[providerId]) {
    return;
  }

  const password = (globalThis as any)._vaultPassword;
  const encryptedProfile = path.resolve(`${providerId}_profile.enc`);
  const localProfile = path.resolve(`${providerId}_profile`);
  
  let profilePath: string;

  if (fs.existsSync(encryptedProfile)) {
    if (!password) throw new Error(`Vault password required to decrypt ${providerId}_profile.enc`);
    const tempDir = path.join(os.tmpdir(), `deepsproxy_profile_${uuidv4()}`);
    console.log(`[Vault] Decrypting ${providerId} profile to temporary secure memory...`);
    await decryptAndUnpackDir(encryptedProfile, tempDir, password);
    profilePath = path.join(tempDir, `${providerId}_profile`);
    activeTempDirs[providerId] = tempDir;
  } else {
    profilePath = localProfile;
  }

  const context = await chromium.launchPersistentContext(profilePath, {
    headless,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-infobars',
      // Sandbox is enabled for maximum security.
      // If running in Docker, run the container with --cap-add=SYS_ADMIN.
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  // Handle unexpected closures to self-heal
  context.on('close', async () => {
    console.warn(`[Playwright] Context for provider '${providerId}' closed unexpectedly. Cleaning up.`);
    if (activeTempDirs[providerId] && password) {
      try {
        await packAndEncryptDir(path.join(activeTempDirs[providerId], `${providerId}_profile`), path.resolve(`${providerId}_profile.enc`), password);
        secureWipeDir(activeTempDirs[providerId]);
      } catch (e) { console.error('Failed to encrypt profile on crash:', e); }
    }
    delete contexts[providerId];
    delete activePages[providerId];
    delete activeTempDirs[providerId];
  });

  contexts[providerId] = context;
  activePages[providerId] = await context.newPage();
  mutexes[providerId] = new Mutex();
}

export async function closePlaywright(providerId: string) {
  if (process.env.TEST_MOCK_PLAYWRIGHT) return;
  const context = contexts[providerId];
  if (context) {
    await context.close();
    
    const password = (globalThis as any)._vaultPassword;
    if (activeTempDirs[providerId] && password) {
      console.log(`[Vault] Re-encrypting and securely wiping ${providerId} profile...`);
      const profilePath = path.join(activeTempDirs[providerId], `${providerId}_profile`);
      await packAndEncryptDir(profilePath, path.resolve(`${providerId}_profile.enc`), password);
      secureWipeDir(activeTempDirs[providerId]);
    }
    
    delete contexts[providerId];
    delete activePages[providerId];
    delete mutexes[providerId];
    delete activeTempDirs[providerId];
  }
}

export function getActivePage(providerId: string): Page | null {
  return activePages[providerId] || null;
}

export function getProviderMutex(providerId: string): Mutex {
  if (!mutexes[providerId]) {
    mutexes[providerId] = new Mutex();
  }
  return mutexes[providerId];
}

export async function ensurePlaywright(providerId: string, headless = true) {
  if (!contexts[providerId]) {
    await initPlaywright(providerId, headless);
  }
}
