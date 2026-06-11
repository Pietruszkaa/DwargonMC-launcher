import fs from 'node:fs/promises';
import path from 'node:path';
import type { LauncherPaths } from './paths';

export const BACKGROUND_PROTOCOL = 'dwargon-background';
const BACKGROUND_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const DEFAULT_BACKGROUND_NAME = '1.png';

export async function listBackgroundUrls(paths: LauncherPaths): Promise<string[]> {
  const backgroundDir = path.join(paths.assetsDir, 'backgrounds');

  try {
    const entries = (await fs.readdir(backgroundDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && BACKGROUND_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => backgroundUrlForName(entry.name))
      .sort((left, right) => left.localeCompare(right, 'pl'));

    if (entries.length > 0) return entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (await bundledDefaultBackgroundExists(paths)) {
    return [bundledBackgroundUrlForName(DEFAULT_BACKGROUND_NAME)];
  }

  return [];
}

export function resolveBackgroundRequest(paths: LauncherPaths, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${BACKGROUND_PROTOCOL}:` || !['local', 'bundled'].includes(url.hostname)) return null;

  let fileName: string;
  try {
    fileName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
  if (!isSafeBackgroundFileName(fileName)) return null;
  if (url.hostname === 'bundled' && fileName !== DEFAULT_BACKGROUND_NAME) return null;

  const baseDir = url.hostname === 'bundled' ? paths.bundledAssetsDir : paths.assetsDir;
  return path.join(baseDir, 'backgrounds', fileName);
}

function backgroundUrlForName(fileName: string): string {
  return `${BACKGROUND_PROTOCOL}://local/${encodeURIComponent(fileName)}`;
}

function bundledBackgroundUrlForName(fileName: string): string {
  return `${BACKGROUND_PROTOCOL}://bundled/${encodeURIComponent(fileName)}`;
}

async function bundledDefaultBackgroundExists(paths: LauncherPaths): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(paths.bundledAssetsDir, 'backgrounds', DEFAULT_BACKGROUND_NAME));
    return stat.isFile();
  } catch {
    return false;
  }
}

function isSafeBackgroundFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName === path.basename(fileName) &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    BACKGROUND_EXTENSIONS.has(path.extname(fileName).toLowerCase())
  );
}
