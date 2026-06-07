import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const JAVA_MAJOR_VERSION = 21;
const ADOPTIUM_RELEASES_PAGE_URL = 'https://adoptium.net/temurin/releases/?version=21';
const ADOPTIUM_API_URL =
  'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse&jvm_impl=hotspot&heap_size=normal';

export type JavaCheckResult = {
  ok: boolean;
  path: string;
  version: string | null;
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

    if (version < JAVA_MAJOR_VERSION) {
      return {
        ok: false,
        path: executable,
        version: String(version),
        message: `Wykryto starą Java. Do Minecraft 1.21.1 zalecana jest Java ${JAVA_MAJOR_VERSION} lub nowsza.`
      };
    }

    return {
      ok: true,
      path: executable,
      version: String(version),
      message:
        version === JAVA_MAJOR_VERSION
          ? `Java ${JAVA_MAJOR_VERSION} gotowa.`
          : `Java ${version} wykryta. Zalecana dla Minecraft 1.21.1 jest Java ${JAVA_MAJOR_VERSION}.`
    };
  } catch {
    return {
      ok: false,
      path: executable,
      version: null,
      message: `Nie znaleziono Java. Zainstaluj Java ${JAVA_MAJOR_VERSION} albo wskaż java.exe w ustawieniach.`
    };
  }
}

export function parseJavaVersion(output: string): number | null {
  const match = output.match(/version "(?<version>\d+)(?:\.\d+)?(?:\.\d+)?/);
  const version = match?.groups?.version;
  return version ? Number(version) : null;
}

export function javaDownloadUrl(platform = process.platform): string {
  return platform === 'win32' ? ADOPTIUM_API_URL : ADOPTIUM_RELEASES_PAGE_URL;
}

export function javaDownloadPageUrl(): string {
  return ADOPTIUM_RELEASES_PAGE_URL;
}

export function idleJavaInstallerStatus(): JavaInstallerResult {
  return {
    phase: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    path: null,
    url: ADOPTIUM_API_URL,
    pageUrl: ADOPTIUM_RELEASES_PAGE_URL,
    message: ''
  };
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
      message: `Automatyczne pobieranie Java ${JAVA_MAJOR_VERSION} jest przygotowane dla Windows. Otwórz stronę ręcznie.`
    };
    onStatus(result);
    return result;
  }

  let target: JavaDownloadTarget;

  try {
    target = await resolveAdoptiumJavaDownloadTarget();
  } catch (error) {
    const failed = {
      ...idleJavaInstallerStatus(),
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
    ...idleJavaInstallerStatus(),
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
        ...idleJavaInstallerStatus(),
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
      ...idleJavaInstallerStatus(),
      phase: 'error' as const,
      path: null,
      message: error instanceof Error ? error.message : 'Nie udało się pobrać instalatora Java.'
    };

    onStatus(failed);
    return failed;
  }
}

async function resolveAdoptiumJavaDownloadTarget(): Promise<JavaDownloadTarget> {
  const response = await fetch(ADOPTIUM_API_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DwargonMC-Launcher'
    }
  });

  if (!response.ok) {
    throw new Error(`Adoptium API HTTP ${response.status}`);
  }

  const assets = (await response.json()) as AdoptiumAsset[];
  const binary = assets.find((asset) => asset.binary?.installer?.link && asset.binary.installer.checksum)?.binary;

  const installer = binary?.installer ?? null;

  if (!installer?.link || !installer.name || !installer.checksum) {
    throw new Error('Adoptium API nie zwróciło instalatora Java z SHA256.');
  }

  const checksum = normalizeSha256(installer.checksum);

  if (!checksum) {
    throw new Error('Adoptium API zwróciło niepoprawny SHA256 instalatora Java.');
  }

  return {
    fileName: safeInstallerName(installer.name),
    url: installer.link,
    expectedSha256: checksum
  };
}

function normalizeSha256(value: string): string | null {
  const hash = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

async function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'DwargonMC-Launcher'
    }
  });

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
    return `OpenJDK${JAVA_MAJOR_VERSION}-temurin-windows-x64.msi`;
  }

  if (base.toLowerCase().endsWith('.msi') || base.toLowerCase().endsWith('.exe')) {
    return base;
  }

  return `${base}.msi`;
}