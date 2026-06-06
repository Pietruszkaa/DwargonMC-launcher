import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeServer, instanceIdForBackend, readServerRegistry, saveServerRegistry } from '../../electron/main/servers';
import type { LauncherPaths } from '../../electron/main/paths';

describe('server registry', () => {
  it('uses backend url as server id and keeps stable instance folder id', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-servers-'));
    const paths = makePaths(root);
    const backendUrl = 'https://sync.example.com';
    const instanceId = instanceIdForBackend(backendUrl);

    await saveServerRegistry(paths, {
      activeServerId: backendUrl,
      servers: [
        {
          id: backendUrl,
          instanceId,
          name: 'Example',
          backendUrl,
          minecraft: {
            address: 'play.example.com:25565',
            version: '1.21.1',
            loader: 'neoforge',
            loaderVersion: null
          },
          authRequired: false,
          addedAt: '2026-06-06T00:00:00.000Z',
          lastUsedAt: '2026-06-06T00:00:00.000Z'
        }
      ]
    });

    const registry = await readServerRegistry(paths);
    expect(activeServer(registry)).toMatchObject({
      id: backendUrl,
      instanceId,
      backendUrl,
      minecraft: {
        address: 'play.example.com:25565',
        version: '1.21.1',
        loader: 'neoforge',
        loaderVersion: null
      }
    });
  });
});

function makePaths(root: string): LauncherPaths {
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
    neoforgeInstallerFile: path.join(root, 'launcher-data', 'neoforge.jar')
  };
}
