import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSync, syncManifestFiles } from '../../electron/main/sync';
import type { LauncherPaths } from '../../electron/main/paths';

describe('runSync', () => {
  it('downloads changed files and only removes orphan managed files', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-sync-'));
    const minecraftDir = path.join(temp, 'minecraft');
    const launcherDataDir = path.join(temp, 'launcher-data');
    await fs.mkdir(path.join(minecraftDir, 'mods'), { recursive: true });
    await fs.writeFile(path.join(minecraftDir, 'mods', 'player.jar'), 'keep me');
    await fs.writeFile(path.join(minecraftDir, 'mods', '_old.jar'), 'remove me');

    const body = Buffer.from('new sodium');
    const backgroundBody = Buffer.from('background image');
    const manifest = {
      version: 'test',
      generatedAt: new Date().toISOString(),
      files: [
        {
          name: 'sodium.jar',
          path: 'mods/sodium.jar',
          size: body.length,
          sha256: crypto.createHash('sha256').update(body).digest('hex')
        }
      ],
      backgrounds: [
        {
          name: 'spawn.png',
          path: 'spawn.png',
          size: backgroundBody.length,
          sha256: crypto.createHash('sha256').update(backgroundBody).digest('hex')
        }
      ]
    };

    const paths: LauncherPaths = {
      installDir: temp,
      appDir: temp,
      minecraftDir,
      launcherDataDir,
      assetsDir: path.join(temp, 'assets'),
      bundledAssetsDir: path.join(temp, 'assets'),
      settingsFile: path.join(launcherDataDir, 'settings.json'),
      profileFile: path.join(launcherDataDir, 'profile.json'),
      neoforgeInstallerFile: path.join(launcherDataDir, 'neoforge.jar')
    };

    const result = await syncManifestFiles(
      paths,
      manifest,
      async (remotePath, localPath, kind) => {
        if (kind === 'background') {
          expect(remotePath).toBe('spawn.png');
          await fs.writeFile(localPath, backgroundBody);
          return;
        }

        expect(remotePath).toBe('mods/sodium.jar');
        await fs.writeFile(localPath, body);
      },
      () => undefined
    );

    await expect(fs.readFile(path.join(minecraftDir, 'mods', '_sodium.jar'), 'utf8')).resolves.toBe('new sodium');
    await expect(fs.readFile(path.join(temp, 'assets', 'backgrounds', 'spawn.png'), 'utf8')).resolves.toBe('background image');
    await expect(fs.readFile(path.join(minecraftDir, 'mods', 'player.jar'), 'utf8')).resolves.toBe('keep me');
    await expect(fs.stat(path.join(minecraftDir, 'mods', '_old.jar'))).rejects.toThrow();
    expect(result.verified).toBe(true);
  });

  it('returns warning when backend is unavailable', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-sync-offline-'));
    const paths = minimalPaths(temp);

    const result = await runSync(paths, 'http://127.0.0.1:9', () => undefined);

    expect(result.phase).toBe('warning');
    expect(result.verified).toBe(false);
  });

  it('keeps local backgrounds when manifest does not manage backgrounds', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-sync-backgrounds-'));
    const paths = minimalPaths(temp);
    const localBackground = path.join(temp, 'assets', 'backgrounds', 'local.png');
    await fs.mkdir(path.dirname(localBackground), { recursive: true });
    await fs.writeFile(localBackground, 'local background');

    const result = await syncManifestFiles(
      paths,
      {
        version: 'test',
        generatedAt: new Date().toISOString(),
        files: []
      },
      async () => {
        throw new Error('No downloads expected.');
      },
      () => undefined
    );

    expect(result.phase).toBe('complete');
    await expect(fs.readFile(localBackground, 'utf8')).resolves.toBe('local background');
  });
});

function minimalPaths(root: string): LauncherPaths {
  return {
    installDir: root,
    appDir: root,
    minecraftDir: path.join(root, 'minecraft'),
    launcherDataDir: path.join(root, 'launcher-data'),
    assetsDir: path.join(root, 'assets'),
    bundledAssetsDir: path.join(root, 'assets'),
    settingsFile: path.join(root, 'launcher-data', 'settings.json'),
    profileFile: path.join(root, 'launcher-data', 'profile.json'),
    neoforgeInstallerFile: path.join(root, 'launcher-data', 'neoforge.jar')
  };
}
