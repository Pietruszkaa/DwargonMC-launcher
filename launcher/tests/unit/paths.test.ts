import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { ensureLauncherDirs, resolveAppDir, resolveInstallDir, type LauncherPaths } from '../../electron/main/paths';

describe('launcher paths', () => {
  it('uses cwd while running in dev mode', () => {
    const cwd = path.join(path.sep, 'workspace');

    expect(
      resolveInstallDir({
        isPackaged: false,
        portableExecutableDir: path.join(path.sep, 'portable'),
        executablePath: path.join(path.sep, 'app', 'DwargonMC Launcher.exe'),
        cwd
      })
    ).toBe(cwd);
  });

  it('uses portable executable directory for single-file portable builds', () => {
    const portableExecutableDir = path.join(path.sep, 'games', 'DwargonMC');

    expect(
      resolveInstallDir({
        isPackaged: true,
        portableExecutableDir,
        executablePath: path.join(path.sep, 'tmp', 'portable-extract', 'DwargonMC Launcher.exe'),
        cwd: path.join(path.sep, 'workspace')
      })
    ).toBe(portableExecutableDir);
  });

  it('uses executable directory for unpacked packaged builds', () => {
    const appDir = path.join(path.sep, 'games', 'DwargonMC', 'win-unpacked');

    expect(
      resolveInstallDir({
        isPackaged: true,
        executablePath: path.join(appDir, 'DwargonMC Launcher.exe'),
        cwd: path.join(path.sep, 'workspace')
      })
    ).toBe(appDir);
  });

  it('uses executable directory as app dir for packaged builds', () => {
    const appDir = path.join(path.sep, 'tmp', 'portable-extract');

    expect(
      resolveAppDir({
        isPackaged: true,
        executablePath: path.join(appDir, 'DwargonMC Launcher.exe'),
        cwd: path.join(path.sep, 'workspace')
      })
    ).toBe(appDir);
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
