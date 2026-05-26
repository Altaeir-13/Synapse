import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as tar from 'tar';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let _vaultMasterPassword: Buffer | null = null;

export function setVaultPassword(password: string | Buffer): void {
  if (_vaultMasterPassword) {
    _vaultMasterPassword.fill(0);
  }
  _vaultMasterPassword = Buffer.isBuffer(password) ? Buffer.from(password) : Buffer.from(password, 'utf8');
}

export function getVaultPassword(): Buffer | null {
  return _vaultMasterPassword;
}

export function wipeVaultPassword(): void {
  if (_vaultMasterPassword) {
    _vaultMasterPassword.fill(0);
    _vaultMasterPassword = null;
  }
}

export class VaultError extends Error {
  constructor(message: string, public readonly code?: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'VaultError';
  }
}

export class VaultDecryptionError extends VaultError {
  constructor(originalError?: unknown) {
    super('Decryption failed: Incorrect password or corrupted data', 'ERR_DECRYPTION_FAILED', originalError);
    this.name = 'VaultDecryptionError';
  }
}

function deriveKey(password: Buffer, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32);
}

export function encryptBuffer(data: Buffer, password: Buffer): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Format: [SALT] [IV] [AUTH_TAG] [ENCRYPTED_DATA]
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

export function decryptBuffer(data: Buffer, password: Buffer): Buffer {
  if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new VaultError('Data is too short or corrupted', 'ERR_DATA_CORRUPTED');
  }
  
  let offset = 0;
  const salt = data.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
  const iv = data.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
  const authTag = data.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
  const encrypted = data.subarray(offset);
  
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (e: unknown) {
    throw new VaultDecryptionError(e);
  }
}

export async function packAndEncryptDir(dirPath: string, destFile: string, password: Buffer): Promise<void> {
  const dirName = path.basename(dirPath);
  const parentDir = path.dirname(dirPath);
  
  const tarStream = tar.c({ gzip: true, cwd: parentDir }, [dirName]);
  const chunks: Buffer[] = [];
  
  for await (const chunk of tarStream) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  
  const archiveBuffer = Buffer.concat(chunks);
  const encrypted = encryptBuffer(archiveBuffer, password);
  fs.writeFileSync(destFile, encrypted);
}

export async function decryptAndUnpackDir(srcFile: string, destDir: string, password: Buffer): Promise<void> {
  const encrypted = fs.readFileSync(srcFile);
  const decrypted = decryptBuffer(encrypted, password);
  
  // Create a temporary tar file
  const tmpTar = path.join(destDir, 'temp.tgz');
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(tmpTar, decrypted);
  
  try {
    await tar.x({ file: tmpTar, cwd: destDir });
  } finally {
    if (fs.existsSync(tmpTar)) {
      fs.unlinkSync(tmpTar);
    }
  }
}

import * as dotenv from 'dotenv';

export function loadEncryptedEnv(srcFile: string, password: Buffer): void {
  const encrypted = fs.readFileSync(srcFile);
  const decrypted = decryptBuffer(encrypted, password).toString('utf-8');
  
  const envConfig = dotenv.parse(decrypted);
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

export function secureWipeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'EPERM' || e.code === 'EBUSY') {
        console.warn(`[Vault] Warning: Gracefully ignoring locked directory ${dirPath}. It might be locked by another process (EPERM/EBUSY).`);
      } else {
        console.warn(`[Vault] Warning: Could not cleanly wipe directory ${dirPath}. Error: ${e.message}`);
      }
    }
  }
}
