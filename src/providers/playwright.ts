import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from '../shared/utils/mutex.ts';
import { decryptAndUnpackDir, packAndEncryptDir, secureWipeDir, getVaultPassword } from '../core/security/vault.ts';

interface ProviderPlaywrightState {
  context: BrowserContext;
  page: Page;
  mutex: Mutex;
  tempDir?: string;
}

const providerStates: Record<string, ProviderPlaywrightState> = {};

export async function initPlaywright(providerId: string, headless = true) {
  if (process.env.TEST_MOCK_PLAYWRIGHT) return;
  if (providerStates[providerId]) {
    return;
  }

  const password = getVaultPassword();
  const encryptedProfile = path.resolve(`${providerId}_profile.enc`);
  const localProfile = path.resolve(`${providerId}_profile`);
  
  let profilePath: string;
  let tempDir: string | undefined;

  if (fs.existsSync(encryptedProfile)) {
    if (!password) throw new Error(`Vault password required to decrypt ${providerId}_profile.enc`);
    tempDir = path.join(os.tmpdir(), `deepsproxy_profile_${uuidv4()}`);
    console.log(`[Vault] Decrypting ${providerId} profile to temporary secure memory...`);
    await decryptAndUnpackDir(encryptedProfile, tempDir, password);
    profilePath = path.join(tempDir, `${providerId}_profile`);
  } else {
    profilePath = localProfile;
  }

  const launchOptions = {
    headless,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profilePath, { ...launchOptions, channel: 'chrome' });
  } catch (e) {
    try {
      context = await chromium.launchPersistentContext(profilePath, { ...launchOptions, channel: 'msedge' });
    } catch (e2) {
      context = await chromium.launchPersistentContext(profilePath, launchOptions);
    }
  }

  // Handle unexpected closures to self-heal
  context.on('close', async () => {
    console.warn(`[Playwright] Context for provider '${providerId}' closed unexpectedly. Cleaning up.`);
    const state = providerStates[providerId];
    if (state?.tempDir && password) {
      try {
        await new Promise(r => setTimeout(r, 1500)); // Allow Chromium to delete tmp files
        await packAndEncryptDir(path.join(state.tempDir, `${providerId}_profile`), path.resolve(`${providerId}_profile.enc`), password);
        secureWipeDir(state.tempDir);
      } catch (e) { console.error('Failed to encrypt profile on crash:', e); }
    }
    delete providerStates[providerId];
  });

  providerStates[providerId] = {
    context,
    page: await context.newPage(),
    mutex: new Mutex(),
    tempDir,
  };
}

export async function closePlaywright(providerId: string) {
  if (process.env.TEST_MOCK_PLAYWRIGHT) return;
  const state = providerStates[providerId];
  if (state) {
    await state.context.close();
    
    const password = getVaultPassword();
    if (state.tempDir && password) {
      console.log(`[Vault] Re-encrypting and securely wiping ${providerId} profile...`);
      const profilePath = path.join(state.tempDir, `${providerId}_profile`);
      await packAndEncryptDir(profilePath, path.resolve(`${providerId}_profile.enc`), password);
      secureWipeDir(state.tempDir);
    }
    
    delete providerStates[providerId];
  }
}

export function getActivePage(providerId: string): Page | null {
  return providerStates[providerId]?.page || null;
}

export function getProviderMutex(providerId: string): Mutex {
  let state = providerStates[providerId];
  if (!state) {
    // If initPlaywright was bypassed by mocks, we still might need a mutex
    state = {
      context: {} as BrowserContext,
      page: {} as Page,
      mutex: new Mutex(),
    };
    providerStates[providerId] = state;
  }
  return state.mutex;
}

export async function ensurePlaywright(providerId: string, headless = true) {
  if (!providerStates[providerId] || (!providerStates[providerId].context && !process.env.TEST_MOCK_PLAYWRIGHT)) {
    await initPlaywright(providerId, headless);
  }
}
