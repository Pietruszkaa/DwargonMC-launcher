import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reinstallCore, safeMinecraftChildPath } from '../../electron/main/core';
import type { LauncherPaths } from '../../electron/main/paths';

describe('safeMinecraftChildPath', () => {
  it('rejects paths escaping minecraft dir', () => {
    expect(() => safeMinecraftChildPath('/tmp/minecraft', '../mods')).toThrow();
    expect(() => safeMinecraftChildPath('/tmp/minecraft', '/tmp/other')).toThrow();
  });
});

describe('reinstallCore', () => {
  it('removes only core cache and keeps user files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-core-'));
    const paths = makePaths(root);

    await fs.mkdir(path.join(paths.minecraftDir, 'versions', 'old'), { recursive: true });
    await fs.mkdir(path.join(paths.minecraftDir, 'forge', '1.21.1'), { recursive: true });
    await fs.mkdir(path.join(paths.minecraftDir, 'libraries', 'net', 'neoforged'), { recursive: true });
    await fs.mkdir(path.join(paths.minecraftDir, 'assets', 'objects'), { recursive: true });
    await fs.mkdir(path.join(paths.minecraftDir, 'mods'), { recursive: true });
    await fs.mkdir(paths.launcherDataDir, { recursive: true });
    await fs.writeFile(path.join(paths.minecraftDir, 'versions', 'old', 'old.json'), '{}');
    await fs.writeFile(path.join(paths.minecraftDir, 'forge', '1.21.1', 'version.json'), '{}');
    await fs.writeFile(path.join(paths.minecraftDir, 'mods', 'player.jar'), 'keep');
    await fs.writeFile(path.join(paths.launcherDataDir, 'settings.json'), '{}');
    await fs.writeFile(path.join(paths.launcherDataDir, 'neoforge-installer.jar'), 'old');
    await fs.writeFile(path.join(paths.launcherDataDir, 'neoforge-21.1.200-installer.jar'), 'old');

    const result = await reinstallCore(paths);

    await expect(fs.stat(path.join(paths.minecraftDir, 'versions'))).rejects.toThrow();
    await expect(fs.stat(path.join(paths.minecraftDir, 'forge'))).rejects.toThrow();
    await expect(fs.stat(path.join(paths.minecraftDir, 'libraries'))).rejects.toThrow();
    await expect(fs.readFile(path.join(paths.minecraftDir, 'mods', 'player.jar'), 'utf8')).resolves.toBe('keep');
    await expect(fs.readFile(path.join(paths.launcherDataDir, 'settings.json'), 'utf8')).resolves.toBe('{}');
    await expect(fs.stat(path.join(paths.launcherDataDir, 'neoforge-installer.jar'))).rejects.toThrow();
    await expect(fs.stat(path.join(paths.launcherDataDir, 'neoforge-21.1.200-installer.jar'))).rejects.toThrow();
    expect(result.removed).toContain('versions');
  });
});

function makePaths(root: string): LauncherPaths {
  return {
    installDir: root,
    appDir: root,
    minecraftDir: path.join(root, 'minecraft'),
    launcherDataDir: path.join(root, 'launcher-data'),
    assetsDir: path.join(root, 'assets'),
    bundledAssetsDir: path.join(root, 'assets'),
    settingsFile: path.join(root, 'launcher-data', 'settings.json'),
    profileFile: path.join(root, 'launcher-data', 'profile.json'),
    neoforgeInstallerFile: path.join(root, 'launcher-data', 'neoforge-installer.jar')
  };
}
