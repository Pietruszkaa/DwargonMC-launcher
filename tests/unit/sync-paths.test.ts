import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { managedLocalPath, managedRelativePath, normalizeRemotePath } from '../../electron/main/sync';

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
});
