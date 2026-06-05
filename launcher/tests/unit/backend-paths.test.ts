import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

const {
  buildMinecraftStatusRequest,
  encodeVarInt,
  hasAdminAccess,
  mapTargetUrl,
  normalizeAnnouncementsPayload,
  parseMapRequestHeaders,
  parseMinecraftStatusResponse,
  resolveInside
} = require('../../../sync-server/server.js') as {
  buildMinecraftStatusRequest(host: string, port: number): Buffer;
  encodeVarInt(value: number): Buffer;
  hasAdminAccess(headers: Record<string, string | undefined>, adminToken?: string): boolean;
  mapTargetUrl(target: string, requestUrl: string): string;
  normalizeAnnouncementsPayload(input: unknown):
    | { ok: true; value: { items: Array<Record<string, unknown>> } }
    | { ok: false; message: string };
  parseMapRequestHeaders(env: Record<string, string | undefined>): Record<string, string>;
  parseMinecraftStatusResponse(buffer: Buffer):
    | {
        online: boolean;
        playersOnline: number | null;
        playersMax: number | null;
        players: string[];
      }
    | null;
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

describe('backend admin helpers', () => {
  it('accepts bearer and x-admin-token auth', () => {
    expect(hasAdminAccess({ authorization: 'Bearer secret' }, 'secret')).toBe(true);
    expect(hasAdminAccess({ 'x-admin-token': 'secret' }, 'secret')).toBe(true);
    expect(hasAdminAccess({ authorization: 'Bearer wrong' }, 'secret')).toBe(false);
    expect(hasAdminAccess({ authorization: 'Bearer secret' }, '')).toBe(false);
  });

  it('normalizes announcements payload for file storage', () => {
    const result = normalizeAnnouncementsPayload({
      items: [
        {
          title: '  Test ',
          body: ' Body ',
          level: 'update',
          date: '2026-06-05T00:00:00.000Z',
          link: 'https://dwargonmc.pl'
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([
      {
        id: 'test-body',
        title: 'Test',
        body: 'Body',
        level: 'update',
        date: '2026-06-05T00:00:00.000Z',
        link: 'https://dwargonmc.pl/',
        expiresAt: null
      }
    ]);
  });

  it('rejects unsafe announcement ids', () => {
    const result = normalizeAnnouncementsPayload({
      items: [
        {
          id: '../bad',
          title: 'Test',
          body: 'Body'
        }
      ]
    });

    expect(result.ok).toBe(false);
  });
});

describe('backend minecraft status helpers', () => {
  it('builds a status request packet', () => {
    const packet = buildMinecraftStatusRequest('127.0.0.1', 25565);
    expect(packet.length).toBeGreaterThan(8);
    expect(packet.at(-2)).toBe(0x01);
    expect(packet.at(-1)).toBe(0x00);
  });

  it('parses minecraft status response', () => {
    const payload = Buffer.from(
      JSON.stringify({
        players: {
          online: 2,
          max: 40,
          sample: [{ name: 'Yrafa_Buc' }, { name: 'Steve' }]
        }
      }),
      'utf8'
    );
    const body = Buffer.concat([encodeVarInt(0), encodeVarInt(payload.length), payload]);
    const packet = Buffer.concat([encodeVarInt(body.length), body]);

    expect(parseMinecraftStatusResponse(packet)).toEqual({
      online: true,
      playersOnline: 2,
      playersMax: 40,
      players: ['Yrafa_Buc', 'Steve']
    });
  });
});
