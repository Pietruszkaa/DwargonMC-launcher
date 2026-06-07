import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProfile, saveProfile } from '../../electron/main/storage';
import type { LauncherPaths } from '../../electron/main/paths';

describe('launcher profile storage', () => {
  it('migrates old profiles as setup-complete with empty playtime counters', async () => {
    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });
    await fs.writeFile(paths.profileFile, JSON.stringify({ nickname: 'Player', lastPlayedAt: null }));

    await expect(readProfile(paths)).resolves.toEqual({
      nickname: 'Player',
      accountMode: 'offline',
      microsoft: null,
      lastPlayedAt: null,
      lastSessionSeconds: 0,
      totalPlaySeconds: 0,
      launchCount: 0,
      setupComplete: true
    });
  });

  it('normalizes persisted playtime counters', async () => {
    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });

    const saved = await saveProfile(paths, {
      nickname: ' Player ',
      accountMode: 'offline',
      microsoft: null,
      lastPlayedAt: '2026-06-05T00:00:00.000Z',
      lastSessionSeconds: 12.6,
      totalPlaySeconds: 40.2,
      launchCount: 2.4,
      setupComplete: true
    });

    expect(saved).toEqual({
      nickname: 'Player',
      accountMode: 'offline',
      microsoft: null,
      lastPlayedAt: '2026-06-05T00:00:00.000Z',
      lastSessionSeconds: 13,
      totalPlaySeconds: 40,
      launchCount: 2,
      setupComplete: true
    });
  });

  it('drops microsoft token data when profile is saved in offline mode', async () => {
    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });

    const saved = await saveProfile(paths, {
      nickname: 'Player',
      accountMode: 'offline',
      microsoft: {
        name: 'PremiumPlayer',
        uuid: 'uuid',
        refreshToken: 'refresh-token',
        xuid: 'xuid',
        expiresAt: 123
      },
      lastPlayedAt: null,
      lastSessionSeconds: 0,
      totalPlaySeconds: 0,
      launchCount: 0,
      setupComplete: true
    });

    expect(saved.accountMode).toBe('offline');
    expect(saved.microsoft).toBeNull();

    const raw = JSON.parse(await fs.readFile(paths.profileFile, 'utf8'));
    expect(raw.microsoft).toBeNull();
    await expect(fs.stat(path.join(paths.launcherDataDir, 'microsoft-token.bin'))).rejects.toThrow();
  });

  it('stores microsoft refresh token outside profile.json', async () => {
    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });

    const saved = await saveProfile(paths, {
      nickname: 'Player',
      accountMode: 'microsoft',
      microsoft: {
        name: 'PremiumPlayer',
        uuid: 'uuid',
        refreshToken: 'refresh-token',
        xuid: 'xuid',
        expiresAt: 123
      },
      lastPlayedAt: null,
      lastSessionSeconds: 0,
      totalPlaySeconds: 0,
      launchCount: 0,
      setupComplete: true
    });

    expect(saved.microsoft?.refreshToken).toBe('refresh-token');

    const raw = JSON.parse(await fs.readFile(paths.profileFile, 'utf8'));
    expect(raw.microsoft).toEqual({
      name: 'PremiumPlayer',
      uuid: 'uuid',
      xuid: 'xuid',
      expiresAt: 123
    });
    expect(raw.microsoft.refreshToken).toBeUndefined();

    const tokenFile = path.join(paths.launcherDataDir, 'microsoft-token.bin');
    const encrypted = await fs.readFile(tokenFile);
    expect(encrypted.includes(Buffer.from('refresh-token'))).toBe(false);

    const loaded = await readProfile(paths);
    expect(loaded.microsoft?.refreshToken).toBe('refresh-token');
  });

  it('migrates legacy refresh tokens from profile.json into encrypted storage', async () => {
    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });
    await fs.writeFile(
      paths.profileFile,
      JSON.stringify({
        nickname: 'Player',
        accountMode: 'microsoft',
        microsoft: {
          name: 'PremiumPlayer',
          uuid: 'uuid',
          refreshToken: 'legacy-refresh-token',
          xuid: 'xuid',
          expiresAt: 123
        },
        setupComplete: true
      })
    );

    const loaded = await readProfile(paths);
    expect(loaded.microsoft?.refreshToken).toBe('legacy-refresh-token');

    const raw = JSON.parse(await fs.readFile(paths.profileFile, 'utf8'));
    expect(raw.microsoft.refreshToken).toBeUndefined();
    await expect(fs.stat(path.join(paths.launcherDataDir, 'microsoft-token.bin'))).resolves.toBeDefined();
  });
});

async function tempPaths(): Promise<LauncherPaths> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-storage-'));

  return {
    installDir: root,
    appDir: root,
    globalDataDir: path.join(root, 'launcher-data'),
    serversFile: path.join(root, 'launcher-data', 'servers.json'),
    instancesDir: path.join(root, 'instances'),
    activeInstanceId: 'dwargonmc',
    activeInstanceDir: root,
    usingLegacyInstanceDir: true,
    minecraftDir: path.join(root, 'minecraft'),
    launcherDataDir: path.join(root, 'launcher-data'),
    assetsDir: path.join(root, 'assets'),
    bundledAssetsDir: path.join(root, 'assets'),
    settingsFile: path.join(root, 'launcher-data', 'settings.json'),
    profileFile: path.join(root, 'launcher-data', 'profile.json'),
    neoforgeInstallerFile: path.join(root, 'launcher-data', 'neoforge-installer.jar')
  };
}
