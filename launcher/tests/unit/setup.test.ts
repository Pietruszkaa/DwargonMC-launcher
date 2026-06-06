import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLauncherPaths } from '../../electron/main/paths';
import { listCrowdedEntries, resolveSetupPaths } from '../../electron/main/setup';

describe('setup wizard path resolution', () => {
  it('uses a nested instance folder for fresh portable exe in a crowded folder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-setup-'));
    await fs.writeFile(path.join(root, 'Dwargon Launcher.exe'), '');
    await fs.writeFile(path.join(root, 'random-file.txt'), '');

    const result = await resolveSetupPaths(buildLauncherPaths(root, root), {
      isPackaged: true,
      portableExecutableDir: root,
      portableExecutableFile: path.join(root, 'Dwargon Launcher.exe')
    });

    expect(result.paths.installDir).toBe(path.join(root, 'Dwargon Launcher'));
    expect(result.setup.reason).toBe('crowded-folder');
    expect(result.setup.usingNestedDir).toBe(true);
    expect(result.setup.crowdedEntries).toEqual(['random-file.txt']);
  });

  it('keeps the portable exe folder when a profile already exists there', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-setup-'));
    await fs.mkdir(path.join(root, 'launcher-data'), { recursive: true });
    await fs.writeFile(path.join(root, 'launcher-data', 'profile.json'), '{}');
    await fs.writeFile(path.join(root, 'random-file.txt'), '');

    const result = await resolveSetupPaths(buildLauncherPaths(root, root), {
      isPackaged: true,
      portableExecutableDir: root,
      portableExecutableFile: path.join(root, 'Dwargon Launcher.exe')
    });

    expect(result.paths.installDir).toBe(root);
    expect(result.setup.reason).toBeNull();
    expect(result.setup.usingNestedDir).toBe(false);
  });

  it('ignores launcher-managed entries when checking crowded folders', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-setup-'));
    await fs.mkdir(path.join(root, 'minecraft'));
    await fs.mkdir(path.join(root, 'launcher-data'));
    await fs.mkdir(path.join(root, 'assets'));
    await fs.writeFile(path.join(root, 'Dwargon Launcher.exe'), '');

    await expect(listCrowdedEntries(root, 'Dwargon Launcher.exe')).resolves.toEqual([]);
  });
});
