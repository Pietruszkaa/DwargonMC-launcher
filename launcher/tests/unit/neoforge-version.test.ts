import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compareNeoForgeVersions,
  ensureNeoForgeInstaller,
  forgeMetadataIsStale,
  isSafeNeoForgeVersionToken,
  minecraftDownloadMessage,
  parseNeoForgeVersions,
  parseSha256Checksum,
  purgeStaleForgeMetadata,
  splitLaunchArgs
} from '../../electron/main/game';

vi.mock('axios');

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

  it('parses NeoForge SHA256 checksum files', () => {
    const hash = 'A'.repeat(64);
    expect(parseSha256Checksum(`${hash}  neoforge-21.1.230-installer.jar\n`)).toBe(hash.toLowerCase());
    expect(parseSha256Checksum('not-a-hash')).toBeNull();
  });

  it('accepts only safe NeoForge version tokens', () => {
    expect(isSafeNeoForgeVersionToken('21.1.230')).toBe(true);
    expect(isSafeNeoForgeVersionToken('21.1.230-beta')).toBe(true);
    expect(isSafeNeoForgeVersionToken('../21.1.230')).toBe(false);
    expect(isSafeNeoForgeVersionToken('21.1.230/evil')).toBe(false);
  });

  it('detects stale MCLC forge metadata', () => {
    expect(forgeMetadataIsStale('{\"id\":\"1.21.1-neoforge-21.1.200\"}', '1.21.1', '21.1.233')).toBe(true);
    expect(forgeMetadataIsStale('{\"id\":\"1.21.1-neoforge-21.1.233\"}', '1.21.1', '21.1.233')).toBe(false);
    expect(forgeMetadataIsStale('{\"id\":\"1.21.10-neoforge-21.1.200\"}', '1.21.1', '21.1.233')).toBe(false);
  });

  it('purges stale MCLC forge metadata before launch', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-forge-meta-'));
    const forgeDir = path.join(root, 'forge', '1.21.1');
    await fs.mkdir(forgeDir, { recursive: true });
    await fs.writeFile(path.join(forgeDir, 'version.json'), '{\"id\":\"neoforge-21.1.200\"}');

    await expect(purgeStaleForgeMetadata(root, '1.21.1', '21.1.233')).resolves.toBe(true);
    await expect(fs.stat(forgeDir)).rejects.toThrow();
  });

  it('does not purge metadata for a different exact Minecraft version token', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-forge-meta-'));
    const forgeDir = path.join(root, 'versions', '1.21.10-neoforge-21.1.200');
    await fs.mkdir(forgeDir, { recursive: true });
    await fs.writeFile(path.join(forgeDir, 'version.json'), '{\"id\":\"1.21.10-neoforge-21.1.200\"}');

    await expect(purgeStaleForgeMetadata(root, '1.21.1', '21.1.233')).resolves.toBe(false);
    await expect(fs.stat(forgeDir)).resolves.toBeDefined();
  });

  it('starts with cached NeoForge installer and sidecar hash without network access', async () => {
    const launcherDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-neoforge-cache-'));
    const installer = path.join(launcherDataDir, 'neoforge-21.1.233-installer.jar');
    const content = Buffer.from('valid cached installer');
    const hash = '6ebea0cafad5c211f7ac48330a497923c2e1cde94dd98d373b0d06ad0f6e1326';

    await fs.writeFile(installer, content);
    await fs.writeFile(`${installer}.sha256`, `${hash}\n`);
    vi.mocked(axios.get).mockRejectedValue(new Error('network disabled'));

    await expect(
      ensureNeoForgeInstaller(
        launcherDataDir,
        {
          onStatus: vi.fn(),
          onLog: vi.fn(),
          onCrash: vi.fn()
        },
        {
          address: null,
          version: '1.21.1',
          loader: 'neoforge',
          loaderVersion: '21.1.233'
        }
      )
    ).resolves.toEqual({ version: '21.1.233', file: installer });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('formats Minecraft download progress for launcher status', () => {
    expect(minecraftDownloadMessage({ name: 'client.jar', current: 2, total: 4 })).toBe('Pobieranie Minecraft: client.jar (2/4)');
    expect(minecraftDownloadMessage(null)).toBe('Pobieranie plików Minecraft...');
  });

  it('splits custom launch args with quotes', () => {
    expect(splitLaunchArgs('-Dfoo=bar "--demo value" --width 1280')).toEqual(['-Dfoo=bar', '--demo value', '--width', '1280']);
  });
});
