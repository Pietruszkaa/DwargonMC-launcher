import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LauncherPaths } from './paths';

const TOKEN_FILE = 'microsoft-token.bin';
const SAFE_STORAGE_PREFIX = Buffer.from('SAFE1');
const FALLBACK_PREFIX = Buffer.from('FALLBACK1');

type SafeStorageApi = {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

function getSafeStorage(): SafeStorageApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require('electron') as { safeStorage: SafeStorageApi };
    return safeStorage;
  } catch {
    return null;
  }
}

function tokenFile(paths: LauncherPaths): string {
  return path.join(paths.launcherDataDir, TOKEN_FILE);
}

function deriveFallbackKey(paths: LauncherPaths, salt: Buffer): Buffer {
  const material = `${paths.installDir}\0${paths.launcherDataDir}`;
  return crypto.scryptSync(material, salt, 32);
}

function encryptFallback(plaintext: string, paths: LauncherPaths): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveFallbackKey(paths, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([FALLBACK_PREFIX, salt, iv, tag, ciphertext]);
}

function decryptFallback(payload: Buffer, paths: LauncherPaths): string {
  const body = payload.subarray(FALLBACK_PREFIX.length);
  const salt = body.subarray(0, 16);
  const iv = body.subarray(16, 28);
  const tag = body.subarray(28, 44);
  const ciphertext = body.subarray(44);
  const key = deriveFallbackKey(paths, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function encryptToken(plaintext: string, paths: LauncherPaths): Buffer {
  const safeStorage = getSafeStorage();
  if (safeStorage?.isEncryptionAvailable()) {
    return Buffer.concat([SAFE_STORAGE_PREFIX, safeStorage.encryptString(plaintext)]);
  }

  return encryptFallback(plaintext, paths);
}

function decryptToken(payload: Buffer, paths: LauncherPaths): string {
  if (payload.subarray(0, SAFE_STORAGE_PREFIX.length).equals(SAFE_STORAGE_PREFIX)) {
    const safeStorage = getSafeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error('Nie można odszyfrować tokenu Microsoft (brak dostępu do magazynu kluczy systemowych).');
    }

    return safeStorage.decryptString(payload.subarray(SAFE_STORAGE_PREFIX.length));
  }

  if (payload.subarray(0, FALLBACK_PREFIX.length).equals(FALLBACK_PREFIX)) {
    return decryptFallback(payload, paths);
  }

  throw new Error('Nieznany format zapisanego tokenu Microsoft.');
}

export async function readMicrosoftRefreshToken(paths: LauncherPaths): Promise<string | null> {
  try {
    const payload = await fs.readFile(tokenFile(paths));
    return decryptToken(payload, paths);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveMicrosoftRefreshToken(paths: LauncherPaths, refreshToken: string): Promise<void> {
  const token = refreshToken.trim();
  if (!token) {
    await clearMicrosoftRefreshToken(paths);
    return;
  }

  await fs.mkdir(paths.launcherDataDir, { recursive: true });
  await fs.writeFile(tokenFile(paths), encryptToken(token, paths));
}

export async function clearMicrosoftRefreshToken(paths: LauncherPaths): Promise<void> {
  try {
    await fs.unlink(tokenFile(paths));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
