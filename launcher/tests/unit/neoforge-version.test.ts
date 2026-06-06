import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compareNeoForgeVersions, forgeMetadataIsStale, minecraftDownloadMessage, parseNeoForgeVersions, purgeStaleForgeMetadata, splitLaunchArgs } from '../../electron/main/game';

describe('NeoForge version resolver helpers', () => {
  it('parses 1.21.1 NeoForge versions from Maven metadata', () => {
    const metadata = `
      <metadata>
        <versioning>
          <versions>
            <version>21.1.200</version>
            <version>21.1.230</version>
            <version>21.1.999</version>
            <version>21.2.1</version>
          </versions>
        </versioning>
      </metadata>
    `;

    expect(parseNeoForgeVersions(metadata)).toEqual(['21.1.200', '21.1.230', '21.1.999']);
  });

  it('sorts NeoForge versions numerically', () => {
    expect(compareNeoForgeVersions('21.1.230', '21.1.99')).toBeGreaterThan(0);
    expect(compareNeoForgeVersions('21.1.230', '21.1.230')).toBe(0);
    expect(compareNeoForgeVersions('21.1.229', '21.1.230')).toBeLessThan(0);
  });

  it('detects stale MCLC forge metadata', () => {
    expect(forgeMetadataIsStale('{\"id\":\"neoforge-21.1.200\"}', '21.1.233')).toBe(true);
    expect(forgeMetadataIsStale('{\"id\":\"neoforge-21.1.233\"}', '21.1.233')).toBe(false);
  });

  it('purges stale MCLC forge metadata before launch', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-forge-meta-'));
    const forgeDir = path.join(root, 'forge', '1.21.1');
    await fs.mkdir(forgeDir, { recursive: true });
    await fs.writeFile(path.join(forgeDir, 'version.json'), '{\"id\":\"neoforge-21.1.200\"}');

    await expect(purgeStaleForgeMetadata(root, '1.21.1', '21.1.233')).resolves.toBe(true);
    await expect(fs.stat(forgeDir)).rejects.toThrow();
  });

  it('formats Minecraft download progress for launcher status', () => {
    expect(minecraftDownloadMessage({ name: 'client.jar', current: 2, total: 4 })).toBe('Pobieranie Minecraft: client.jar (2/4)');
    expect(minecraftDownloadMessage(null)).toBe('Pobieranie plików Minecraft...');
  });

  it('splits custom launch args with quotes', () => {
    expect(splitLaunchArgs('-Dfoo=bar "--demo value" --width 1280')).toEqual(['-Dfoo=bar', '--demo value', '--width', '1280']);
  });
});
