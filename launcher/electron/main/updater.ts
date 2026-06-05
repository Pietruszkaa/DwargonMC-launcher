import { app } from 'electron';
import { GITHUB_RELEASE_REPO } from './constants';

export type UpdateStatus = {
  checking: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  sha256Url: string | null;
  notes: string;
  error: string | null;
};

type GitHubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
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

export function idleUpdateStatus(currentVersion = app.getVersion()): UpdateStatus {
  return {
    checking: false,
    available: false,
    currentVersion,
    latestVersion: null,
    releaseName: null,
    releaseUrl: null,
    downloadUrl: null,
    sha256Url: null,
    notes: '',
    error: null
  };
}

export async function checkForLauncherUpdate(currentVersion = app.getVersion()): Promise<UpdateStatus> {
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
    downloadUrl: exeAsset?.browser_download_url ?? release.html_url ?? null,
    sha256Url: shaAsset?.browser_download_url ?? null,
    notes: release.body ?? '',
    error: null
  };
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
