import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listPlayerAddonFiles, managedLocalPath, managedRelativePath, normalizeRemotePath } from '../../electron/main/sync';

describe('managed file paths', () => {
  it('adds underscore only to managed local filenames', () => {
    expect(managedRelativePath('mods/sodium.jar')).toBe('mods/_sodium.jar');
    expect(managedRelativePath('config/client.toml')).toBe('config/_client.toml');
  });

  it('rejects traversal paths', () => {
    expect(() => normalizeRemotePath('../secret.txt')).toThrow();
    expect(() => normalizeRemotePath('mods/../../secret.txt')).toThrow();
  });

  it('resolves inside minecraft dir', () => {
    const root = path.join('/tmp', 'minecraft');
    expect(managedLocalPath(root, 'mods/sodium.jar')).toBe(path.join(root, 'mods', '_sodium.jar'));
  });

  it('lists player addon files and skips managed underscore files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-addons-'));
    await fs.mkdir(path.join(root, 'mods'), { recursive: true });
    await fs.mkdir(path.join(root, 'resourcepacks'), { recursive: true });
    await fs.writeFile(path.join(root, 'mods', 'iris.jar'), 'player mod');
    await fs.writeFile(path.join(root, 'mods', '_server.jar'), 'managed');
    await fs.writeFile(path.join(root, 'resourcepacks', 'faithful.zip'), 'pack');

    const files = await listPlayerAddonFiles(root);

    expect(files.map((file) => file.path)).toEqual(['mods/iris.jar', 'resourcepacks/faithful.zip']);
    expect(files[0].kind).toBe('mod');
    expect(files[0].sha1).toHaveLength(40);
    expect(files[0].sha512).toHaveLength(128);
  });

  it('can include managed underscore addon files for Modrinth detection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-addons-managed-'));
    await fs.mkdir(path.join(root, 'mods'), { recursive: true });
    await fs.writeFile(path.join(root, 'mods', '_sodium.jar'), 'managed sodium');

    const files = await listPlayerAddonFiles(root, { includeManaged: true });

    expect(files.map((file) => file.path)).toEqual(['mods/_sodium.jar']);
    expect(files[0].kind).toBe('mod');
  });
});
