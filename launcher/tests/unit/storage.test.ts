import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMicrosoftRefreshToken } from '../../electron/main/keychain';
import { readProfile, saveProfile } from '../../electron/main/storage';
import type { LauncherPaths } from '../../electron/main/paths';

vi.mock('../../electron/main/keychain', () => ({
  saveMicrosoftRefreshToken: vi.fn()
}));

describe('launcher profile storage', () => {
  beforeEach(() => {
    vi.mocked(saveMicrosoftRefreshToken).mockReset();
  });

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
  });

  it('moves legacy microsoft refresh token to the system credential store', async () => {
    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });
    await fs.writeFile(
      paths.profileFile,
      JSON.stringify({
        nickname: 'PremiumPlayer',
        accountMode: 'microsoft',
        microsoft: {
          name: 'PremiumPlayer',
          uuid: 'uuid',
          xuid: 'xuid',
          expiresAt: 123,
          refreshToken: 'refresh-secret'
        }
      })
    );

    const profile = await readProfile(paths);
    const persisted = JSON.parse(await fs.readFile(paths.profileFile, 'utf8'));

    expect(saveMicrosoftRefreshToken).toHaveBeenCalledWith('uuid', 'refresh-secret');
    expect(profile).toMatchObject({
      nickname: 'PremiumPlayer',
      accountMode: 'microsoft',
      microsoft: {
        name: 'PremiumPlayer',
        uuid: 'uuid',
        xuid: 'xuid',
        expiresAt: 123
      }
    });
    expect(persisted.microsoft.refreshToken).toBeUndefined();
  });

  it('drops legacy microsoft login when the credential store rejects migration', async () => {
    vi.mocked(saveMicrosoftRefreshToken).mockRejectedValueOnce(new Error('keychain unavailable'));

    const paths = await tempPaths();
    await fs.mkdir(paths.launcherDataDir, { recursive: true });
    await fs.writeFile(
      paths.profileFile,
      JSON.stringify({
        nickname: 'PremiumPlayer',
        accountMode: 'microsoft',
        microsoft: {
          name: 'PremiumPlayer',
          uuid: 'uuid',
          refreshToken: 'refresh-secret'
        }
      })
    );

    const profile = await readProfile(paths);
    const persisted = JSON.parse(await fs.readFile(paths.profileFile, 'utf8'));

    expect(profile.accountMode).toBe('offline');
    expect(profile.microsoft).toBeNull();
    expect(persisted.microsoft).toBeNull();
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
