import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listBackgroundUrls, resolveBackgroundRequest } from '../../electron/main/backgrounds';
import type { LauncherPaths } from '../../electron/main/paths';

function makePaths(root: string, appDir = root): LauncherPaths {
  return {
    installDir: root,
    appDir,
    globalDataDir: path.join(root, 'launcher-data'),
    serversFile: path.join(root, 'launcher-data', 'servers.json'),
    instancesDir: path.join(root, 'instances'),
    activeInstanceId: 'dwargonmc',
    activeInstanceDir: root,
    usingLegacyInstanceDir: true,
    minecraftDir: path.join(root, 'minecraft'),
    launcherDataDir: path.join(root, 'launcher-data'),
    assetsDir: path.join(root, 'assets'),
    bundledAssetsDir: path.join(appDir, 'assets'),
    settingsFile: path.join(root, 'launcher-data', 'settings.json'),
    profileFile: path.join(root, 'launcher-data', 'profile.json'),
    neoforgeInstallerFile: path.join(root, 'launcher-data', 'neoforge-installer.jar')
  };
}

describe('background assets', () => {
  it('lists local background image files as launcher protocol URLs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-backgrounds-'));
    const backgroundsDir = path.join(root, 'assets', 'backgrounds');
    await fs.mkdir(backgroundsDir, { recursive: true });
    await fs.writeFile(path.join(backgroundsDir, '2.webp'), 'webp');
    await fs.writeFile(path.join(backgroundsDir, '1.png'), 'png');
    await fs.writeFile(path.join(backgroundsDir, 'notes.txt'), 'skip');

    const urls = await listBackgroundUrls(makePaths(root));

    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe('dwargon-background://local/1.png');
    expect(urls[1]).toBe('dwargon-background://local/2.webp');
  });

  it('returns an empty list when the folder does not exist yet', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-backgrounds-missing-'));

    await expect(listBackgroundUrls(makePaths(root))).resolves.toEqual([]);
  });

  it('uses bundled default background only when instance has no backgrounds', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-backgrounds-default-'));
    const appDir = path.join(root, 'app');
    const instanceDir = path.join(root, 'instance');
    await fs.mkdir(path.join(appDir, 'assets', 'backgrounds'), { recursive: true });
    await fs.writeFile(path.join(appDir, 'assets', 'backgrounds', '1.png'), 'default');

    await expect(listBackgroundUrls(makePaths(instanceDir, appDir))).resolves.toEqual(['dwargon-background://bundled/1.png']);

    await fs.mkdir(path.join(instanceDir, 'assets', 'backgrounds'), { recursive: true });
    await fs.writeFile(path.join(instanceDir, 'assets', 'backgrounds', 'server.png'), 'server');

    await expect(listBackgroundUrls(makePaths(instanceDir, appDir))).resolves.toEqual(['dwargon-background://local/server.png']);
  });

  it('resolves only safe background protocol requests', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-backgrounds-resolve-'));
    const paths = makePaths(root);

    expect(resolveBackgroundRequest(paths, 'dwargon-background://local/spawn.png')).toBe(
      path.join(root, 'assets', 'backgrounds', 'spawn.png')
    );
    expect(resolveBackgroundRequest(paths, 'dwargon-background://bundled/1.png')).toBe(
      path.join(root, 'assets', 'backgrounds', '1.png')
    );
    expect(resolveBackgroundRequest(paths, 'dwargon-background://local/..%2Fsecret.png')).toBeNull();
    expect(resolveBackgroundRequest(paths, 'dwargon-background://local/notes.txt')).toBeNull();
  });
});
