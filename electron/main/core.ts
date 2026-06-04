import fs from 'node:fs/promises';
import path from 'node:path';
import type { LauncherPaths } from './paths';

export const CORE_CACHE_RELATIVE_PATHS = [
  'forge',
  'versions',
  'libraries',
  'assets/indexes',
  'assets/objects',
  'assets/skins'
] as const;

export type ReinstallCoreResult = {
  removed: string[];
  message: string;
};

export async function reinstallCore(paths: LauncherPaths): Promise<ReinstallCoreResult> {
  const removed: string[] = [];

  for (const relative of CORE_CACHE_RELATIVE_PATHS) {
    const target = safeMinecraftChildPath(paths.minecraftDir, relative);
    await fs.rm(target, { recursive: true, force: true });
    removed.push(relative);
  }

  await removeOldNeoForgeInstallers(paths.launcherDataDir, removed);

  return {
    removed,
    message: 'Core cache wyczyszczony. Następny start gry pobierze runtime, biblioteki, assety i najnowszy NeoForge od nowa.'
  };
}

export function safeMinecraftChildPath(minecraftDir: string, relativePath: string): string {
  const normalized = path.normalize(relativePath);
  if (path.isAbsolute(normalized) || normalized.startsWith('..') || normalized.includes(`${path.sep}..${path.sep}`)) {
    throw new Error(`Unsafe core path: ${relativePath}`);
  }

  const resolved = path.resolve(minecraftDir, normalized);
  const root = path.resolve(minecraftDir);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Core path escapes minecraft dir: ${relativePath}`);
  }

  return resolved;
}

async function removeOldNeoForgeInstallers(launcherDataDir: string, removed: string[]): Promise<void> {
  let entries: string[];

  try {
    entries = await fs.readdir(launcherDataDir);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => /^neoforge(?:-\d+\.\d+\.\d+)?-installer\.jar$/.test(entry))
      .map(async (entry) => {
        await fs.rm(path.join(launcherDataDir, entry), { force: true });
        removed.push(`launcher-data/${entry}`);
      })
  );
}
