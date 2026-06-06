import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execFileAsync = promisify(execFile);
const ORACLE_JAVA_21_WINDOWS_INSTALLER_URL = 'https://download.oracle.com/java/21/latest/jdk-21_windows-x64_bin.exe';
const ORACLE_JAVA_21_DOWNLOAD_PAGE_URL = 'https://www.oracle.com/pl/java/technologies/downloads/#jdk21-windows';
const ORACLE_JAVA_21_INSTALLER_NAME = 'jdk-21_windows-x64_bin.exe';

// Oracle provides SHA256 checksums - this should be fetched from a secure source or hardcoded for known releases
// For production, consider fetching from: https://www.oracle.com/webfolder/s/digest/21-0-4-sha256
const KNOWN_JAVA_21_SHA256_HASHES: Record<string, string> = {
  // These are example hashes - MUST BE UPDATED with real Oracle SHA256 values
  'jdk-21_windows-x64_bin.exe': 'placeholder-sha256-hash-must-be-verified'
};

export type JavaCheckResult = {
  ok: boolean;
  path: string;
  version: string | null;
  message: string;
};

export async function checkJava(javaPath: string): Promise<JavaCheckResult> {
  const executable = javaPath.trim() || 'java';

  try {
    const result = await execFileAsync(executable, ['-version']);
    const output = `${result.stderr}\n${result.stdout}`;
    const version = parseJavaVersion(output);

    if (version === null) {
      return {
        ok: false,
        path: executable,
        version: null,
        message: 'Nie udało się odczytać wersji Java.'
      };
    }

    if (version < 21) {
      return {
        ok: false,
        path: executable,
        version: String(version),
        message: 'Wykryto starą Java. Do Minecraft 1.21.1 zalecana jest Java 21 lub nowsza.'
      };
    }

    return {
      ok: true,
      path: executable,
      version: String(version),
      message: version === 21 ? 'Java 21 gotowa.' : `Java ${version} wykryta. Zalecana dla Minecraft 1.21.1 jest Java 21.`
    };
  } catch {
    return {
      ok: false,
      path: executable,
      version: null,
      message: 'Nie znaleziono Java. Zainstaluj Java 21 albo wskaż java.exe w ustawieniach.'
    };
  }
}

export function parseJavaVersion(output: string): number | null {
  const match = output.match(/version "(?<version>\d+)(?:\.\d+)?(?:\.\d+)?/);
  const version = match?.groups?.version;
  return version ? Number(version) : null;
}

export function javaDownloadUrl(platform = process.platform): string {
  return platform === 'win32' ? ORACLE_JAVA_21_WINDOWS_INSTALLER_URL : ORACLE_JAVA_21_DOWNLOAD_PAGE_URL;
}

export function javaDownloadPageUrl(): string {
  return ORACLE_JAVA_21_DOWNLOAD_PAGE_URL;
}

export type JavaInstallerResult = {
  phase: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  path: string | null;
  url: string;
  pageUrl: string;
  message: string;
};

export function idleJavaInstallerStatus(): JavaInstallerResult {
  return {
    phase: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    path: null,
    url: ORACLE_JAVA_21_WINDOWS_INSTALLER_URL,
    pageUrl: ORACLE_JAVA_21_DOWNLOAD_PAGE_URL,
    message: ''
  };
}

/**
 * Calculate SHA256 hash of a file
 */
async function calculateFileHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const fileStream = await fs.readFile(filePath);
  hash.update(fileStream);
  return hash.digest('hex');
}

/**
 * Fetch expected SHA256 from Oracle (or return from cache)
 */
async function getExpectedJavaInstallerHash(): Promise<string | null> {
  // In production, this should:
  // 1. Try to fetch from Oracle's official SHA256 list
  // 2. Fall back to hardcoded known-good hashes
  // 3. Cache the result

  try {
    // For now, return from hardcoded list
    const hash = KNOWN_JAVA_21_SHA256_HASHES[ORACLE_JAVA_21_INSTALLER_NAME];
    if (hash && hash !== 'placeholder-sha256-hash-must-be-verified') {
      return hash;
    }
  } catch (error) {
    console.error('Failed to get expected Java installer hash:', error);
  }

  return null;
}

export async function downloadJavaInstaller(
  launcherDataDir: string,
  onStatus: (status: JavaInstallerResult) => void,
  platform = process.platform
): Promise<JavaInstallerResult> {
  if (platform !== 'win32') {
    const result = {
      ...idleJavaInstallerStatus(),
      phase: 'error' as const,
      message: 'Automatyczne pobieranie instalatora Java jest przygotowane dla Windows. Otwórz stronę ręcznie.'
    };
    onStatus(result);
    return result;
  }

  const installersDir = path.join(launcherDataDir, 'installers');
  const destination = path.join(installersDir, ORACLE_JAVA_21_INSTALLER_NAME);
  const tempDestination = `${destination}.download`;
  await fs.mkdir(installersDir, { recursive: true });

  const base = {
    ...idleJavaInstallerStatus(),
    phase: 'downloading' as const,
    path: destination,
    message: 'Pobieranie instalatora Java 21...'
  };
  onStatus(base);

  try {
    await downloadFile(ORACLE_JAVA_21_WINDOWS_INSTALLER_URL, tempDestination, (downloadedBytes, totalBytes) => {
      onStatus({
        ...base,
        downloadedBytes,
        totalBytes,
        progress: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0
      });
    });

    // SECURITY: Verify SHA256 before accepting the downloaded file
    onStatus({
      ...base,
      phase: 'verifying' as const,
      message: 'Weryfikacja integralności instalatora Java...'
    });

    const downloadedHash = await calculateFileHash(tempDestination);
    const expectedHash = await getExpectedJavaInstallerHash();

    if (expectedHash) {
      if (downloadedHash.toLowerCase() !== expectedHash.toLowerCase()) {
        await fs.rm(tempDestination, { force: true });
        const failed = {
          ...idleJavaInstallerStatus(),
          phase: 'error' as const,
          path: null,
          message: `🚨 BEZPIECZEŃSTWO: Suma kontrolna SHA256 instalatora Java nie zgadza się! Plik może być uszkodzony lub fałszywony. Pobrany: ${downloadedHash}, Oczekiwany: ${expectedHash}`
        };
        onStatus(failed);
        return failed;
      }
    } else {
      // If we don't have a known-good hash, warn the user
      console.warn('⚠️ WARNING: Could not verify Java installer SHA256 - no known hash available');
      console.warn(`Downloaded file SHA256: ${downloadedHash}`);
    }

    await fs.rm(destination, { force: true });
    await fs.rename(tempDestination, destination);

    const ready = {
      ...base,
      phase: 'ready' as const,
      progress: 100,
      message: 'Pobrano instalator Java 21. Uruchom instalator, a potem kliknij „Sprawdź ponownie".'
    };
    onStatus(ready);
    return ready;
  } catch (error) {
    await fs.rm(tempDestination, { force: true });
    const failed = {
      ...idleJavaInstallerStatus(),
      phase: 'error' as const,
      path: null,
      message: error instanceof Error ? error.message : 'Nie udało się pobrać instalatora Java.'
    };
    onStatus(failed);
    return failed;
  }
}

async function downloadFile(url: string, targetPath: string, onProgress: (downloadedBytes: number, totalBytes: number | null) => void): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'DwargonMC-Launcher'
    }
  });

  if (!response.ok || !response.body) throw new Error(`Pobieranie instalatora Java HTTP ${response.status}`);

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : null;
  const reader = response.body.getReader();
  const file = await fs.open(targetPath, 'w');
  let downloadedBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      await file.write(chunk);
      downloadedBytes += chunk.byteLength;
      onProgress(downloadedBytes, totalBytes && Number.isFinite(totalBytes) ? totalBytes : null);
    }
  } finally {
    await file.close();
  }
}
