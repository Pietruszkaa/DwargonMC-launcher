import { app } from 'electron';
import fsSync from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export type LauncherPaths = {
  installDir: string;
  appDir: string;
  globalDataDir: string;
  serversFile: string;
  instancesDir: string;
  activeInstanceId: string;
  activeInstanceDir: string;
  usingLegacyInstanceDir: boolean;
  minecraftDir: string;
  launcherDataDir: string;
  assetsDir: string;
  bundledAssetsDir: string;
  settingsFile: string;
  profileFile: string;
  neoforgeInstallerFile: string;
};

const BACKGROUND_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const DEFAULT_INSTANCE_ID = 'dwargonmc';

export function getInstallDir(): string {
  return resolveInstallDir({
    isPackaged: app.isPackaged,
    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    executablePath: process.execPath,
    cwd: process.cwd()
  });
}

export function resolveInstallDir({
  isPackaged,
  portableExecutableDir,
  executablePath,
  cwd
}: {
  isPackaged: boolean;
  portableExecutableDir?: string;
  executablePath: string;
  cwd: string;
}): string {
  if (!isPackaged) return cwd;
  if (portableExecutableDir) return portableExecutableDir;
  return path.dirname(executablePath);
}

export function getLauncherPaths(): LauncherPaths {
  const installDir = getInstallDir();
  const appDir = resolveAppDir({
    isPackaged: app.isPackaged,
    executablePath: process.execPath,
    cwd: process.cwd()
  });

  return buildLauncherPaths(installDir, appDir);
}

export function buildLauncherPaths(installDir: string, appDir: string, requestedInstanceId = process.env.DWARGONMC_INSTANCE_ID || DEFAULT_INSTANCE_ID): LauncherPaths {
  const globalDataDir = path.join(installDir, 'launcher-data');
  const activeInstanceId = normalizeInstanceId(requestedInstanceId);
  const instancesDir = path.join(installDir, 'instances');
  const usingLegacyInstanceDir = requestedInstanceId === DEFAULT_INSTANCE_ID && hasLegacyInstanceData(installDir);
  const activeInstanceDir = usingLegacyInstanceDir ? installDir : path.join(instancesDir, activeInstanceId);
  const minecraftDir = path.join(activeInstanceDir, 'minecraft');
  const launcherDataDir = path.join(activeInstanceDir, 'launcher-data');
  const assetsDir = path.join(activeInstanceDir, 'assets');

  return {
    installDir,
    appDir,
    globalDataDir,
    serversFile: path.join(globalDataDir, 'servers.json'),
    instancesDir,
    activeInstanceId,
    activeInstanceDir,
    usingLegacyInstanceDir,
    minecraftDir,
    launcherDataDir,
    assetsDir,
    bundledAssetsDir: path.join(appDir, 'assets'),
    settingsFile: path.join(launcherDataDir, 'settings.json'),
    profileFile: path.join(launcherDataDir, 'profile.json'),
    neoforgeInstallerFile: path.join(launcherDataDir, 'neoforge-installer.jar')
  };
}

export async function ensureLauncherDirs(paths: LauncherPaths): Promise<void> {
  await fs.mkdir(paths.globalDataDir, { recursive: true });
  await fs.mkdir(paths.instancesDir, { recursive: true });
  await fs.mkdir(paths.activeInstanceDir, { recursive: true });
  await fs.mkdir(paths.minecraftDir, { recursive: true });
  await fs.mkdir(path.join(paths.minecraftDir, 'mods'), { recursive: true });
  await fs.mkdir(paths.launcherDataDir, { recursive: true });
  await fs.mkdir(path.join(paths.assetsDir, 'backgrounds'), { recursive: true });
  await copyBundledBackgrounds(paths);
}

function hasLegacyInstanceData(installDir: string): boolean {
  return ['minecraft', 'launcher-data', 'assets'].some((entry) => fsSync.existsSync(path.join(installDir, entry)));
}

function normalizeInstanceId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || DEFAULT_INSTANCE_ID;
}

export function resolveAppDir({
  isPackaged,
  executablePath,
  cwd
}: {
  isPackaged: boolean;
  executablePath: string;
  cwd: string;
}): string {
  return isPackaged ? path.dirname(executablePath) : cwd;
}

async function copyBundledBackgrounds(paths: LauncherPaths): Promise<void> {
  const sourceDir = path.join(paths.bundledAssetsDir, 'backgrounds');
  const targetDir = path.join(paths.assetsDir, 'backgrounds');
  if (sourceDir === targetDir) return;

  let entries: Array<{ isFile(): boolean; name: string }>;
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  await fs.mkdir(targetDir, { recursive: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && BACKGROUND_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(async (entry) => {
        const targetFile = path.join(targetDir, entry.name);
        try {
          await fs.copyFile(path.join(sourceDir, entry.name), targetFile, fsConstants.COPYFILE_EXCL);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      })
  );
}
