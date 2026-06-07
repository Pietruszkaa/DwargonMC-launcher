import crypto from 'node:crypto';
import { getLauncherVersion } from './electronRuntime';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GITHUB_RELEASE_REPO } from './constants';

export type UpdateDownloadStatus = {
  phase: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  filePath: string | null;
  fileName: string | null;
  expectedSha256: string | null;
  actualSha256: string | null;
  message: string;
};

export type UpdateStatus = {
  checking: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  sha256Url: string | null;
  notes: string;
  error: string | null;
  download: UpdateDownloadStatus;
};

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
  size?: number;
};

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GitHubReleaseAsset[];
};

export function idleUpdateStatus(currentVersion = getLauncherVersion()): UpdateStatus {
  return {
    checking: false,
    available: false,
    currentVersion,
    latestVersion: null,
    releaseName: null,
    releaseUrl: null,
    downloadUrl: null,
    downloadName: null,
    sha256Url: null,
    notes: '',
    error: null,
    download: idleUpdateDownloadStatus()
  };
}

export function idleUpdateDownloadStatus(): UpdateDownloadStatus {
  return {
    phase: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: null,
    filePath: null,
    fileName: null,
    expectedSha256: null,
    actualSha256: null,
    message: ''
  };
}

export async function checkForLauncherUpdate(currentVersion = getLauncherVersion()): Promise<UpdateStatus> {
  const endpoint = `https://api.github.com/repos/${GITHUB_RELEASE_REPO}/releases/latest`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `DwargonMC-Launcher/${currentVersion}`
      }
    });

    if (!response.ok) throw new Error(`GitHub Releases HTTP ${response.status}`);
    return parseLatestRelease((await response.json()) as GitHubRelease, currentVersion);
  } catch (error) {
    return {
      ...idleUpdateStatus(currentVersion),
      error: error instanceof Error ? error.message : 'Nie udało się sprawdzić aktualizacji.'
    };
  }
}

export function parseLatestRelease(release: GitHubRelease, currentVersion: string): UpdateStatus {
  const latestVersion = normalizeVersion(release.tag_name ?? '');
  const exeAsset = release.assets?.find((asset) => asset.name?.toLowerCase().endsWith('.exe')) ?? null;
  const shaAsset =
    release.assets?.find((asset) => asset.name?.toLowerCase() === 'sha256sums.txt') ??
    release.assets?.find((asset) => asset.name?.toLowerCase().includes('sha256')) ??
    null;

  return {
    checking: false,
    available: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false,
    currentVersion,
    latestVersion: latestVersion || null,
    releaseName: release.name ?? release.tag_name ?? null,
    releaseUrl: release.html_url ?? null,
    downloadUrl: exeAsset?.browser_download_url ?? null,
    downloadName: exeAsset?.name ?? null,
    sha256Url: shaAsset?.browser_download_url ?? null,
    notes: release.body ?? '',
    error: null,
    download: idleUpdateDownloadStatus()
  };
}

export async function downloadLauncherUpdate(
  update: UpdateStatus,
  launcherDataDir: string,
  onStatus: (status: UpdateDownloadStatus) => void,
  currentVersion = getLauncherVersion()
): Promise<UpdateDownloadStatus> {
  if (!update.downloadUrl) throw new Error('Brak pliku aktualizacji do pobrania.');

  const updatesDir = path.join(launcherDataDir, 'updates');
  await fs.mkdir(updatesDir, { recursive: true });

  const fileName = safeDownloadName(update.downloadName ?? urlFileName(update.downloadUrl) ?? `Dwargon Launcher-${update.latestVersion ?? 'update'}-portable.exe`);
  const tempPath = path.join(updatesDir, `${fileName}.download`);
  const finalPath = path.join(updatesDir, fileName);
  const expectedSha256 = update.sha256Url ? await fetchExpectedSha256(update.sha256Url, fileName, currentVersion) : null;

  const downloading = {
    ...idleUpdateDownloadStatus(),
    phase: 'downloading' as const,
    filePath: null,
    fileName,
    expectedSha256,
    message: 'Pobieranie aktualizacji...'
  };
  onStatus(downloading);

  try {
    const actualSha256 = await downloadFile(update.downloadUrl, tempPath, currentVersion, (downloadedBytes, totalBytes) => {
      onStatus({
        ...downloading,
        downloadedBytes,
        totalBytes,
        progress: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0
      });
    });

    onStatus({
      ...downloading,
      phase: 'verifying',
      progress: 100,
      actualSha256,
      message: expectedSha256 ? 'Weryfikacja SHA256...' : 'Brak SHA256 w release, pomijam weryfikację.'
    });

    if (expectedSha256 && actualSha256 !== expectedSha256) {
      await fs.rm(tempPath, { force: true });
      throw new Error('Pobrany plik nie przeszedł weryfikacji SHA256.');
    }

    await fs.rm(finalPath, { force: true });
    await fs.rename(tempPath, finalPath);

    const ready: UpdateDownloadStatus = {
      phase: 'ready',
      progress: 100,
      downloadedBytes: 0,
      totalBytes: null,
      filePath: finalPath,
      fileName,
      expectedSha256,
      actualSha256,
      message: expectedSha256
        ? 'Aktualizacja pobrana i zweryfikowana. Zamknij launcher i uruchom nowy plik.'
        : 'Aktualizacja pobrana. Nie znaleziono SHA256 dla tego pliku w release.'
    };
    onStatus(ready);
    return ready;
  } catch (error) {
    const failed: UpdateDownloadStatus = {
      ...idleUpdateDownloadStatus(),
      phase: 'error',
      fileName,
      expectedSha256,
      message: error instanceof Error ? error.message : 'Nie udało się pobrać aktualizacji.'
    };
    onStatus(failed);
    return failed;
  }
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  return 0;
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '');
}

function versionParts(value: string): number[] {
  return normalizeVersion(value)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

async function fetchExpectedSha256(url: string, fileName: string, currentVersion: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': `DwargonMC-Launcher/${currentVersion}`
    }
  });

  if (!response.ok) throw new Error(`SHA256SUMS HTTP ${response.status}`);
  return parseSha256Sums(await response.text(), fileName);
}

export function parseSha256Sums(raw: string, fileName: string): string | null {
  const hashes: Array<{ hash: string; name: string }> = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) continue;
    hashes.push({ hash: match[1].toLowerCase(), name: path.basename(match[2].trim()) });
  }

  const exact = hashes.find((entry) => entry.name === fileName);
  if (exact) return exact.hash;
  return hashes.length === 1 ? hashes[0].hash : null;
}

async function downloadFile(
  url: string,
  targetPath: string,
  currentVersion: string,
  onProgress: (downloadedBytes: number, totalBytes: number | null) => void
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': `DwargonMC-Launcher/${currentVersion}`
    }
  });

  if (!response.ok || !response.body) throw new Error(`Pobieranie aktualizacji HTTP ${response.status}`);

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : null;
  const reader = response.body.getReader();
  const file = await fs.open(targetPath, 'w');
  const hash = crypto.createHash('sha256');
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

function urlFileName(url: string): string | null {
  try {
    const name = path.basename(new URL(url).pathname);
    return name && name !== '/' ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

function safeDownloadName(fileName: string): string {
  const normalized = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return normalized.toLowerCase().endsWith('.exe') ? normalized : `${normalized || 'Dwargon Launcher update'}.exe`;
}
