import fs from 'node:fs/promises';
import path from 'node:path';
import type { LauncherPaths } from './paths';

export const BACKGROUND_PROTOCOL = 'dwargon-background';
const BACKGROUND_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export async function listBackgroundUrls(paths: LauncherPaths): Promise<string[]> {
  const backgroundDir = path.join(paths.assetsDir, 'backgrounds');

  try {
    const entries = await fs.readdir(backgroundDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && BACKGROUND_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => backgroundUrlForName(entry.name))
      .sort((left, right) => left.localeCompare(right, 'pl'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export function resolveBackgroundRequest(paths: LauncherPaths, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${BACKGROUND_PROTOCOL}:` || url.hostname !== 'local') return null;

  let fileName: string;
  try {
    fileName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
  if (!isSafeBackgroundFileName(fileName)) return null;

  return path.join(paths.assetsDir, 'backgrounds', fileName);
}

function backgroundUrlForName(fileName: string): string {
  return `${BACKGROUND_PROTOCOL}://local/${encodeURIComponent(fileName)}`;
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
