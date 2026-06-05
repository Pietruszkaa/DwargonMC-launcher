'use strict';

const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const fastify = require('fastify');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { Readable } = require('node:stream');

const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const filesDir = path.join(rootDir, 'files');
const backgroundsDir = path.join(rootDir, 'backgrounds');
const manifestFile = path.join(rootDir, 'manifest.json');
const announcementsFile = path.join(rootDir, 'announcements.json');
const port = Number(process.env.PORT || 2121);
const bindHost = process.env.BIND_HOST || '0.0.0.0';
const publicUrl = process.env.PUBLIC_URL || `http://127.0.0.1:${port}`;
const mapTarget = process.env.MAP_TARGET || 'http://127.0.0.1:8888';
const mapRequestHeaders = parseMapRequestHeaders(process.env);
const mcHost = process.env.MC_HOST || '127.0.0.1';
const mcPort = Number(process.env.MC_PORT || 25565);

async function buildServer() {
  const app = fastify({
    logger: true,
    trustProxy: true
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Authorization', 'Content-Type', 'X-Admin-Token']
  });

  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute'
  });

  await fs.mkdir(filesDir, { recursive: true });
  await fs.mkdir(backgroundsDir, { recursive: true });

  app.get('/health', async () => {
    const minecraftStatus = await pingMinecraftStatus(mcHost, mcPort, 1800);
    const serverOnline = minecraftStatus.online || (await checkTcp(mcHost, mcPort, 1200));

    return {
      ok: true,
      serverOnline,
      playersOnline: minecraftStatus.playersOnline,
      playersMax: minecraftStatus.playersMax,
      players: minecraftStatus.players,
      message: serverOnline ? 'Serwer MC odpowiada.' : 'Backend dziala, ale serwer MC nie odpowiada.'
    };
  });

  app.get('/manifest.json', async (_request, reply) => {
    try {
      return reply.type('application/json').send(await fs.readFile(manifestFile, 'utf8'));
    } catch {
      return reply.code(404).send({
        error: 'manifest_not_found',
        message: 'Uruchom node generate-manifest.js po dodaniu plików.'
      });
    }
  });

  app.get('/announcements.json', async (_request, reply) => {
    try {
      return reply.type('application/json').send(await fs.readFile(announcementsFile, 'utf8'));
    } catch {
      return reply.type('application/json').send({
        items: []
      });
    }
  });

  app.put('/admin/announcements.json', async (request, reply) => {
    if (!hasAdminAccess(request.headers, process.env.ADMIN_TOKEN)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Nieprawidlowy albo brakujacy token admina.'
      });
    }

    const result = normalizeAnnouncementsPayload(request.body);
    if (!result.ok) {
      return reply.code(400).send({
        error: 'invalid_announcements',
        message: result.message
      });
    }

    await writeJsonAtomic(announcementsFile, result.value);
    return reply.send(result.value);
  });

  app.get('/files/*', async (request, reply) => {
    const relative = request.params['*'];
    const safePath = resolveInside(filesDir, relative);

    if (!safePath) {
      return reply.code(400).send({ error: 'unsafe_path' });
    }

    try {
      const stat = await fs.stat(safePath);
      if (!stat.isFile()) throw new Error('not_file');
      return reply.header('content-length', stat.size).send(fsSync.createReadStream(safePath));
    } catch {
      return reply.code(404).send({ error: 'file_not_found' });
    }
  });

  app.get('/backgrounds/*', async (request, reply) => {
    const relative = request.params['*'];
    const safePath = resolveInside(backgroundsDir, relative);

    if (!safePath) {
      return reply.code(400).send({ error: 'unsafe_path' });
    }

    try {
      const stat = await fs.stat(safePath);
      if (!stat.isFile()) throw new Error('not_file');
      return reply.header('content-length', stat.size).send(fsSync.createReadStream(safePath));
    } catch {
      return reply.code(404).send({ error: 'background_not_found' });
    }
  });

  app.get('/map', mapProxyHandler);
  app.get('/map/*', mapProxyHandler);

  app.get('/', async () => ({
    name: 'DwargonMC backend',
    publicUrl,
    readOnly: true
  }));

  return app;

  async function mapProxyHandler(request, reply) {
    const targetUrl = mapTargetUrl(mapTarget, request.raw.url || '/map');

    try {
      const response = await fetch(targetUrl, {
        headers: mapRequestHeaders,
        redirect: 'manual'
      });

      reply.code(response.status);
      for (const [key, value] of response.headers) {
        if (!shouldForwardResponseHeader(key)) continue;
        reply.header(key, value);
      }

      if (!response.body) return reply.send();
      return reply.send(Readable.fromWeb(response.body));
    } catch (error) {
      request.log.warn({ error, targetUrl }, 'map proxy failed');
      return reply.code(502).send({
        error: 'map_proxy_failed',
        message: 'Backend nie może pobrać mapy z MAP_TARGET.'
      });
    }
  }
}

function resolveInside(root, relative) {
  if (typeof relative !== 'string' || !relative.trim()) return null;

  const normalized = path.posix.normalize(relative.replaceAll('\\', '/')).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) return null;

  const resolved = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  return resolved === rootResolved || resolved.startsWith(`${rootResolved}${path.sep}`) ? resolved : null;
}

function checkTcp(host, targetPort, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: targetPort });
    const done = (online) => {
      socket.destroy();
      resolve(online);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function pingMinecraftStatus(host, targetPort, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: targetPort });
    const chunks = [];
    let finished = false;
    let timer = null;

    const finish = (status) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      resolve(status);
    };

    timer = setTimeout(() => finish(emptyMinecraftStatus()), timeoutMs);

    socket.once('connect', () => {
      socket.write(buildMinecraftStatusRequest(host, targetPort));
    });

    socket.on('data', (chunk) => {
      chunks.push(chunk);
      const status = parseMinecraftStatusResponse(Buffer.concat(chunks));
      if (status) finish(status);
    });

    socket.once('error', () => finish(emptyMinecraftStatus()));
    socket.once('end', () => {
      const status = parseMinecraftStatusResponse(Buffer.concat(chunks));
      finish(status || emptyMinecraftStatus());
    });
  });
}

function emptyMinecraftStatus() {
  return {
    online: false,
    playersOnline: null,
    playersMax: null,
    players: []
  };
}

function buildMinecraftStatusRequest(host, targetPort) {
  const hostBuffer = Buffer.from(host, 'utf8');
  const handshake = Buffer.concat([
    encodeVarInt(0),
    encodeVarInt(767),
    encodeVarInt(hostBuffer.length),
    hostBuffer,
    encodeUnsignedShort(targetPort),
    encodeVarInt(1)
  ]);
  const request = Buffer.from([0x01, 0x00]);
  return Buffer.concat([encodeVarInt(handshake.length), handshake, request]);
}

function parseMinecraftStatusResponse(buffer) {
  try {
    let offset = 0;
    const packetLength = readVarInt(buffer, offset);
    if (!packetLength || buffer.length < packetLength.value + packetLength.bytes) return null;
    offset += packetLength.bytes;

    const packetId = readVarInt(buffer, offset);
    if (!packetId || packetId.value !== 0) return null;
    offset += packetId.bytes;

    const jsonLength = readVarInt(buffer, offset);
    if (!jsonLength || buffer.length < offset + jsonLength.bytes + jsonLength.value) return null;
    offset += jsonLength.bytes;

    const payload = JSON.parse(buffer.subarray(offset, offset + jsonLength.value).toString('utf8'));
    const sample = Array.isArray(payload.players?.sample) ? payload.players.sample : [];

    return {
      online: true,
      playersOnline: typeof payload.players?.online === 'number' ? payload.players.online : null,
      playersMax: typeof payload.players?.max === 'number' ? payload.players.max : null,
      players: sample.map((player) => player?.name).filter((name) => typeof name === 'string')
    };
  } catch {
    return null;
  }
}

function encodeVarInt(value) {
  const bytes = [];
  let current = value >>> 0;

  do {
    let temp = current & 0x7f;
    current >>>= 7;
    if (current !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (current !== 0);

  return Buffer.from(bytes);
}

function readVarInt(buffer, offset) {
  let value = 0;
  let position = 0;

  for (let index = 0; index < 5; index += 1) {
    if (offset + index >= buffer.length) return null;
    const current = buffer[offset + index];
    value |= (current & 0x7f) << position;

    if ((current & 0x80) === 0) {
      return {
        value,
        bytes: index + 1
      };
    }

    position += 7;
  }

  return null;
}

function encodeUnsignedShort(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function mapTargetUrl(target, requestUrl) {
  const base = target.endsWith('/') ? target : `${target}/`;
  let suffix = requestUrl.startsWith('/map') ? requestUrl.slice('/map'.length) : requestUrl;
  if (suffix.startsWith('/')) suffix = suffix.slice(1);
  if (!suffix) suffix = '';
  return new URL(suffix, base).toString();
}

function parseMapRequestHeaders(env) {
  const headers = {};

  if (env.MAP_REQUEST_HEADERS?.trim()) {
    try {
      Object.assign(headers, JSON.parse(env.MAP_REQUEST_HEADERS));
    } catch (error) {
      throw new Error(`MAP_REQUEST_HEADERS musi być poprawnym JSON object: ${error.message}`);
    }
  }

  if (env.MAP_ACCESS_CLIENT_ID && env.MAP_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.MAP_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = env.MAP_ACCESS_CLIENT_SECRET;
  }

  return headers;
}

function hasAdminAccess(headers, adminToken) {
  if (!adminToken) return false;

  const provided = parseAdminToken(headers);
  if (!provided) return false;

  const expectedBuffer = Buffer.from(adminToken);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && require('node:crypto').timingSafeEqual(expectedBuffer, providedBuffer);
}

function parseAdminToken(headers) {
  const headerToken = headers['x-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();

  const authorization = headers.authorization;
  if (typeof authorization !== 'string') return '';

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function normalizeAnnouncementsPayload(input) {
  const items = Array.isArray(input?.items) ? input.items : null;
  if (!items) {
    return { ok: false, message: 'Body musi miec format { "items": [...] }.' };
  }

  if (items.length > 20) {
    return { ok: false, message: 'Maksymalnie 20 komunikatow.' };
  }

  const normalized = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, message: 'Kazdy komunikat musi byc obiektem.' };
    }

    const title = stringField(item.title, 120);
    const body = stringField(item.body, 1200);
    if (!title || !body) {
      return { ok: false, message: 'Kazdy komunikat wymaga title i body.' };
    }

    const id = stringField(item.id, 80) || stableAnnouncementId(title, body);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return { ok: false, message: 'Pole id moze zawierac tylko litery, cyfry, _ i -.' };
    }

    const level = ['info', 'warning', 'maintenance', 'update'].includes(item.level) ? item.level : 'info';
    const date = dateField(item.date) || new Date().toISOString();
    const expiresAt = dateField(item.expiresAt);
    const link = urlField(item.link);

    normalized.push({
      id,
      title,
      body,
      level,
      date,
      link,
      expiresAt
    });
  }

  return {
    ok: true,
    value: {
      items: normalized
    }
  };
}

async function writeJsonAtomic(file, value) {
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, file);
}

function stringField(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function dateField(value) {
  const text = stringField(value, 80);
  if (!text) return null;
  return Number.isNaN(Date.parse(text)) ? null : new Date(text).toISOString();
}

function urlField(value) {
  const text = stringField(value, 300);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function stableAnnouncementId(title, body) {
  return `${title}:${body}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function shouldForwardResponseHeader(header) {
  return !['connection', 'content-encoding', 'content-length', 'keep-alive', 'transfer-encoding'].includes(
    header.toLowerCase()
  );
}

if (require.main === module) {
  buildServer()
    .then((app) => app.listen({ port, host: bindHost }))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  buildServer,
  hasAdminAccess,
  buildMinecraftStatusRequest,
  encodeVarInt,
  mapTargetUrl,
  normalizeAnnouncementsPayload,
  parseMapRequestHeaders,
  parseMinecraftStatusResponse,
  resolveInside
};
