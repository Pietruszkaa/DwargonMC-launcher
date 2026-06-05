import fs from 'node:fs/promises';
import path from 'node:path';
import { buildLauncherPaths, type LauncherPaths } from './paths';

export type SetupReason = 'first-run' | 'crowded-folder' | null;

export type SetupState = {
  complete: boolean;
  required: boolean;
  reason: SetupReason;
  baseInstallDir: string;
  activeInstallDir: string;
  usingNestedDir: boolean;
  suggestedDir: string | null;
  crowdedEntries: string[];
};

export type SetupResolution = {
  paths: LauncherPaths;
  setup: Omit<SetupState, 'complete' | 'required'>;
};

const INSTANCE_FOLDER_NAME = 'DwargonMC Launcher';
const MANAGED_ENTRY_NAMES = new Set(['assets', 'launcher-data', 'minecraft', INSTANCE_FOLDER_NAME]);
const PORTABLE_HELPER_NAMES = new Set(['.icon-ico']);

export async function resolveSetupPaths(
  basePaths: LauncherPaths,
  options: {
    isPackaged: boolean;
    portableExecutableDir?: string;
    portableExecutableFile?: string;
  }
): Promise<SetupResolution> {
  if (!options.isPackaged || !options.portableExecutableDir) {
    return setupResolution(basePaths, null, false, []);
  }

  const nestedDir = path.join(basePaths.installDir, INSTANCE_FOLDER_NAME);
  if (await pathExists(path.join(nestedDir, 'launcher-data', 'profile.json'))) {
    return setupResolution(buildLauncherPaths(nestedDir, basePaths.appDir), 'crowded-folder', true, []);
  }

  if (await pathExists(basePaths.profileFile)) {
    return setupResolution(basePaths, null, false, []);
  }

  const executableName = options.portableExecutableFile ? path.basename(options.portableExecutableFile) : null;
  const crowdedEntries = await listCrowdedEntries(basePaths.installDir, executableName);
  if (crowdedEntries.length === 0) return setupResolution(basePaths, 'first-run', false, []);

  return setupResolution(buildLauncherPaths(nestedDir, basePaths.appDir), 'crowded-folder', true, crowdedEntries);
}

export async function listCrowdedEntries(installDir: string, executableName: string | null): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(installDir);
  } catch {
    return [];
  }

  return entries
    .filter((entry) => {
      if (entry === executableName) return false;
      if (entry.startsWith('.')) return false;
      if (MANAGED_ENTRY_NAMES.has(entry)) return false;
      if (PORTABLE_HELPER_NAMES.has(entry)) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function setupResolution(
  paths: LauncherPaths,
  reason: SetupReason,
  usingNestedDir: boolean,
  crowdedEntries: string[]
): SetupResolution {
  return {
    paths,
    setup: {
      reason,
      baseInstallDir: usingNestedDir ? path.dirname(paths.installDir) : paths.installDir,
      activeInstallDir: paths.installDir,
      usingNestedDir,
      suggestedDir: usingNestedDir ? paths.installDir : null,
      crowdedEntries
    }
  };
}
