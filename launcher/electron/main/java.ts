import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_JAVA_MAJOR_VERSION = 21;
const ADOPTIUM_API_TIMEOUT_MS = 15_000;
const JAVA_INSTALLER_DOWNLOAD_TIMEOUT_MS = 180_000;

export type JavaCheckResult = {
  ok: boolean;
  path: string;
  version: string | null;
  requiredMajor: number;
  message: string;
};

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

type JavaRecommendation = {
  major: number;
  label: string;
};

type AdoptiumPackage = {
  name?: string;
  link?: string;
  checksum?: string;
};

type AdoptiumBinary = {
  image_type?: string;
  os?: string;
  architecture?: string;
  package?: AdoptiumPackage;
  installer?: AdoptiumPackage;
};

type AdoptiumAsset = {
  binary?: AdoptiumBinary;
  version?: {
    semver?: string;
  };
};

type JavaDownloadTarget = {
  fileName: string;
  url: string;
  expectedSha256: string;
};

export async function checkJava(javaPath: string, minecraftVersion = '1.21.1'): Promise<JavaCheckResult> {
  const executable = javaPath.trim() || 'java';
  const recommendation = recommendedJavaForMinecraft(minecraftVersion);

  try {
    const result = await execFileAsync(executable, ['-version']);
    const output = `${result.stderr}\n${result.stdout}`;
    const version = parseJavaVersion(output);

    if (version === null) {
      return {
        ok: false,
        path: executable,
        version: null,
        requiredMajor: recommendation.major,
        message: 'Nie udało się odczytać wersji Java.'
      };
    }

    if (version < recommendation.major) {
      return {
        ok: false,
        path: executable,
        version: String(version),
        requiredMajor: recommendation.major,
        message: `Wykryto zbyt starą Javę. Dla Minecraft ${minecraftVersion} zalecana jest Java ${recommendation.label} lub nowsza.`
      };
    }

    return {
      ok: true,
      path: executable,
      version: String(version),
      requiredMajor: recommendation.major,
      message:
        version === recommendation.major
          ? `Java ${recommendation.label} gotowa dla Minecraft ${minecraftVersion}.`
          : `Java ${version} wykryta. Dla Minecraft ${minecraftVersion} zalecana jest Java ${recommendation.label}.`
    };
  } catch {
    return {
      ok: false,
      path: executable,
      version: null,
      requiredMajor: recommendation.major,
      message: `Nie znaleziono Javy. Zainstaluj Java ${recommendation.label} albo wskaż java.exe w ustawieniach.`
    };
  }
}

export function parseJavaVersion(output: string): number | null {
  const match = output.match(/version "(?<version>\d+)(?:\.\d+)?(?:\.\d+)?/);
  const version = match?.groups?.version;
  return version ? Number(version) : null;
}

export function javaDownloadUrl(javaMajor = DEFAULT_JAVA_MAJOR_VERSION, platform = process.platform): string {
  return platform === 'win32' ? adoptiumApiUrl(javaMajor) : javaDownloadPageUrl(javaMajor);
}

export function javaDownloadPageUrl(javaMajor = DEFAULT_JAVA_MAJOR_VERSION): string {
  return `https://adoptium.net/temurin/releases/?version=${javaMajor}`;
}

export function idleJavaInstallerStatus(javaMajor = DEFAULT_JAVA_MAJOR_VERSION): JavaInstallerResult {
  return {
    phase: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    path: null,
    url: adoptiumApiUrl(javaMajor),
    pageUrl: javaDownloadPageUrl(javaMajor),
    message: ''
  };
}

export async function downloadJavaInstaller(
  launcherDataDir: string,
  onStatus: (status: JavaInstallerResult) => void,
  javaMajor = DEFAULT_JAVA_MAJOR_VERSION,
  platform = process.platform
): Promise<JavaInstallerResult> {
  if (platform !== 'win32') {
    const result = {
      ...idleJavaInstallerStatus(javaMajor),
      phase: 'error' as const,
      message: `Automatyczne pobieranie Java ${javaMajor} jest przygotowane dla Windows. Otwórz stronę ręcznie.`
    };
    onStatus(result);
    return result;
  }

  let target: JavaDownloadTarget;

  try {
    target = await resolveAdoptiumJavaDownloadTarget(javaMajor);
  } catch (error) {
    const failed = {
      ...idleJavaInstallerStatus(javaMajor),
      phase: 'error' as const,
      message: error instanceof Error ? error.message : 'Nie udało się pobrać metadanych Java z Adoptium.'
    };
    onStatus(failed);
    return failed;
  }

  const installersDir = path.join(launcherDataDir, 'installers');
  const destination = path.join(installersDir, target.fileName);
  const tempDestination = `${destination}.download`;

  await fs.mkdir(installersDir, { recursive: true });

  const base = {
    ...idleJavaInstallerStatus(javaMajor),
    phase: 'downloading' as const,
    path: destination,
    url: target.url,
    message: `Pobieranie ${target.fileName}...`
  };

  onStatus(base);

  try {
    const actualSha256 = await downloadFile(target.url, tempDestination, (downloadedBytes, totalBytes) => {
      onStatus({
        ...base,
        downloadedBytes,
        totalBytes,
        progress: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0
      });
    });

    onStatus({
      ...base,
      phase: 'verifying' as const,
      progress: 100,
      message: 'Weryfikacja SHA256 instalatora Java...'
    });

    if (actualSha256 !== target.expectedSha256) {
      await fs.rm(tempDestination, { force: true });

      const failed = {
        ...idleJavaInstallerStatus(javaMajor),
        phase: 'error' as const,
        path: null,
        message: `Suma SHA256 instalatora Java nie zgadza się. Pobrany: ${actualSha256}, oczekiwany: ${target.expectedSha256}.`
      };

      onStatus(failed);
      return failed;
    }

    await fs.rm(destination, { force: true });
    await fs.rename(tempDestination, destination);

    const ready = {
      ...base,
      phase: 'ready' as const,
      progress: 100,
      message: `Pobrano i zweryfikowano ${target.fileName}. Uruchom instalator, a potem kliknij „Sprawdź ponownie”.`
    };

    onStatus(ready);
    return ready;
  } catch (error) {
    await fs.rm(tempDestination, { force: true });

    const failed = {
      ...idleJavaInstallerStatus(javaMajor),
      phase: 'error' as const,
      path: null,
      message: error instanceof Error ? error.message : 'Nie udało się pobrać instalatora Java.'
    };

    onStatus(failed);
    return failed;
  }
}

async function resolveAdoptiumJavaDownloadTarget(javaMajor: number): Promise<JavaDownloadTarget> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADOPTIUM_API_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(adoptiumApiUrl(javaMajor), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DwargonMC-Launcher'
      }
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Przekroczono limit czasu pobierania metadanych Java ${javaMajor} z Adoptium.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Adoptium API HTTP ${response.status}`);
  }

  const assets = (await response.json()) as AdoptiumAsset[];
  const binary = assets.find((asset) => asset.binary?.installer?.link && asset.binary.installer.checksum)?.binary;

  const installer = binary?.installer ?? null;

  if (!installer?.link || !installer.name || !installer.checksum) {
    throw new Error(`Adoptium API nie zwróciło instalatora Java ${javaMajor} z SHA256.`);
  }

  const checksum = normalizeSha256(installer.checksum);

  if (!checksum) {
    throw new Error(`Adoptium API zwróciło niepoprawny SHA256 instalatora Java ${javaMajor}.`);
  }

  return {
    fileName: safeInstallerName(installer.name),
    url: installer.link,
    expectedSha256: checksum
  };
}

export function normalizeSha256(value: string): string | null {
  const hash = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

async function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JAVA_INSTALLER_DOWNLOAD_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'DwargonMC-Launcher'
      }
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Przekroczono limit czasu pobierania instalatora Java.');
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok || !response.body) {
    throw new Error(`Pobieranie instalatora Java HTTP ${response.status}`);
  }

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : null;
  const reader = response.body.getReader();
  const file = await fs.open(targetPath, 'w');
  const hash = createHash('sha256');
  let downloadedBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      const chunk = Buffer.from(value);
      await file.write(chunk);
      hash.update(chunk);
      downloadedBytes += chunk.byteLength;
      onProgress(downloadedBytes, totalBytes && Number.isFinite(totalBytes) ? totalBytes : null);
    }
  } finally {
    await file.close();
  }

  return hash.digest('hex');
}

function safeInstallerName(fileName: string): string {
  const base = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();

  if (!base || base === '.' || base === '..') {
    throw new Error('Adoptium zwróciło niepoprawną nazwę instalatora Java.');
  }

  const lower = base.toLowerCase();

  if (!lower.endsWith('.msi') && !lower.endsWith('.exe')) {
    throw new Error(`Adoptium zwróciło nieobsługiwany typ instalatora Java: ${base}`);
  }

  return base;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function adoptiumApiUrl(javaMajor: number): string {
  return `https://api.adoptium.net/v3/assets/latest/${javaMajor}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse&jvm_impl=hotspot&heap_size=normal`;
}

export function recommendedJavaForMinecraft(minecraftVersion: string): JavaRecommendation {
  if (compareMinecraftVersions(minecraftVersion, '1.16.5') <= 0) return { major: 8, label: '8' };
  if (compareMinecraftVersions(minecraftVersion, '1.17') >= 0 && compareMinecraftVersions(minecraftVersion, '1.17.1') <= 0) {
    return { major: 16, label: '16' };
  }
  if (compareMinecraftVersions(minecraftVersion, '1.18') >= 0 && compareMinecraftVersions(minecraftVersion, '1.20.4') <= 0) {
    return { major: 17, label: '17' };
  }
  if (compareMinecraftVersions(minecraftVersion, '26.1') >= 0) return { major: 25, label: '25' };
  return { major: 21, label: '21' };
}

function compareMinecraftVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}
