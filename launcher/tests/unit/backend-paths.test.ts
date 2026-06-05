import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

const { mapTargetUrl, parseMapRequestHeaders, resolveInside } = require('../../../sync-server/server.js') as {
  mapTargetUrl(target: string, requestUrl: string): string;
  parseMapRequestHeaders(env: Record<string, string | undefined>): Record<string, string>;
  resolveInside(root: string, relative: string): string | null;
};

describe('backend resolveInside', () => {
  it('allows files inside root', () => {
    const root = path.join(os.tmpdir(), 'files');
    expect(resolveInside(root, 'mods/sodium.jar')).toBe(path.join(root, 'mods', 'sodium.jar'));
  });

  it('blocks path traversal', () => {
    const root = path.join(os.tmpdir(), 'files');
    expect(resolveInside(root, '../secret.txt')).toBeNull();
    expect(resolveInside(root, 'mods/../../secret.txt')).toBeNull();
  });
});

describe('backend map proxy helpers', () => {
  it('rewrites /map requests relative to MAP_TARGET', () => {
    expect(mapTargetUrl('http://127.0.0.1:8080', '/map/')).toBe('http://127.0.0.1:8080/');
    expect(mapTargetUrl('http://127.0.0.1:8080', '/map/tiles/0/0.png?x=1')).toBe(
      'http://127.0.0.1:8080/tiles/0/0.png?x=1'
    );
    expect(mapTargetUrl('https://maps.example.com/squaremap/', '/map/world/')).toBe(
      'https://maps.example.com/squaremap/world/'
    );
  });

  it('builds upstream map auth headers from env', () => {
    expect(
      parseMapRequestHeaders({
        MAP_ACCESS_CLIENT_ID: 'id',
        MAP_ACCESS_CLIENT_SECRET: 'secret',
        MAP_REQUEST_HEADERS: '{"x-map-token":"abc"}'
      })
    ).toEqual({
      'x-map-token': 'abc',
      'CF-Access-Client-Id': 'id',
      'CF-Access-Client-Secret': 'secret'
    });
  });
});
