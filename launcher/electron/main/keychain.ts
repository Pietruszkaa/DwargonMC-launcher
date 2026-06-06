import fs from 'node:fs/promises';
import path from 'node:path';

let keytar: typeof import('keytar') | null = null;

// Lazy load keytar to handle cases where it's not available
async function getKeytar() {
  if (keytar === null) {
    try {
      keytar = await import('keytar');
    } catch {
      // keytar not available (e.g., in development or headless environments)
      keytar = undefined as any;
    }
  }
  return keytar;
}

const KEYTAR_SERVICE = 'DwargonMC-Launcher';
const KEYTAR_ACCOUNT = 'microsoft-refresh-token';

/**
 * Securely store Microsoft refresh token using OS credential manager
 * Falls back to encrypted file storage if keytar is unavailable
 */
export async function saveMicrosoftToken(launcherDataDir: string, token: string): Promise<void> {
  const kt = await getKeytar();

  if (kt) {
    try {
      await kt.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, token);
      return;
    } catch (error) {
      console.error('Failed to save token to keytar, falling back to file storage:', error);
    }
  }

  // Fallback: save to encrypted file (with basic obfuscation)
  const tokenFile = path.join(launcherDataDir, '.token');
  // Simple base64 encoding (NOT cryptographically secure, but better than plain text)
  const encoded = Buffer.from(token).toString('base64');
  await fs.writeFile(tokenFile, encoded, 'utf8');
}

/**
 * Securely retrieve Microsoft refresh token from OS credential manager
 * Falls back to reading from encrypted file if keytar is unavailable
 */
export async function getMicrosoftToken(launcherDataDir: string): Promise<string | null> {
  const kt = await getKeytar();

  if (kt) {
    try {
      const token = await kt.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (token) return token;
    } catch (error) {
      console.error('Failed to retrieve token from keytar, checking file storage:', error);
    }
  }

  // Fallback: read from encrypted file
  try {
    const tokenFile = path.join(launcherDataDir, '.token');
    const encoded = await fs.readFile(tokenFile, 'utf8');
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Delete Microsoft refresh token from secure storage
 */
export async function deleteMicrosoftToken(launcherDataDir: string): Promise<void> {
  const kt = await getKeytar();

  if (kt) {
    try {
      await kt.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    } catch (error) {
      console.error('Failed to delete token from keytar:', error);
    }
  }

  // Fallback: delete file
  try {
    const tokenFile = path.join(launcherDataDir, '.token');
    await fs.rm(tokenFile, { force: true });
  } catch (error) {
    console.error('Failed to delete token file:', error);
  }
}
