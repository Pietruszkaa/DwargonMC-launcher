import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { ensureLauncherDirs, resolveAppDir, resolveInstallDir, type LauncherPaths } from '../../electron/main/paths';

describe('launcher paths', () => {
  it('uses cwd while running in dev mode', () => {
    expect(
      resolveInstallDir({
        isPackaged: false,
        portableExecutableDir: '/portable',
        executablePath: path.join('/app', 'DwargonMC Launcher.exe'),
        cwd: '/workspace'
      })
    ).toBe('/workspace');
  });

  it('uses portable executable directory for single-file portable builds', () => {
    expect(
      resolveInstallDir({
        isPackaged: true,
        portableExecutableDir: '/games/DwargonMC',
        executablePath: path.join('/tmp', 'portable-extract', 'DwargonMC Launcher.exe'),
        cwd: '/workspace'
      })
    ).toBe('/games/DwargonMC');
  });

  it('uses executable directory for unpacked packaged builds', () => {
    expect(
      resolveInstallDir({
        isPackaged: true,
        executablePath: path.join('/games/DwargonMC/win-unpacked', 'DwargonMC Launcher.exe'),
        cwd: '/workspace'
      })
    ).toBe('/games/DwargonMC/win-unpacked');
  });

  it('uses executable directory as app dir for packaged builds', () => {
    expect(
      resolveAppDir({
        isPackaged: true,
        executablePath: path.join('/tmp', 'portable-extract', 'DwargonMC Launcher.exe'),
        cwd: '/workspace'
      })
    ).toBe('/tmp/portable-extract');
  });

  it('copies bundled backgrounds into the persistent portable asset folder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-paths-'));
    const appDir = path.join(root, 'portable-extract');
    const installDir = path.join(root, 'launcher-folder');
    await fs.mkdir(path.join(appDir, 'assets', 'backgrounds'), { recursive: true });
    await fs.writeFile(path.join(appDir, 'assets', 'backgrounds', '1.png'), 'image');

    const paths: LauncherPaths = {
      installDir,
      appDir,
      minecraftDir: path.join(installDir, 'minecraft'),
      launcherDataDir: path.join(installDir, 'launcher-data'),
      assetsDir: path.join(installDir, 'assets'),
      bundledAssetsDir: path.join(appDir, 'assets'),
      settingsFile: path.join(installDir, 'launcher-data', 'settings.json'),
      profileFile: path.join(installDir, 'launcher-data', 'profile.json'),
      neoforgeInstallerFile: path.join(installDir, 'launcher-data', 'neoforge-installer.jar')
    };

    await ensureLauncherDirs(paths);

    await expect(fs.readFile(path.join(installDir, 'assets', 'backgrounds', '1.png'), 'utf8')).resolves.toBe('image');
  });
});
