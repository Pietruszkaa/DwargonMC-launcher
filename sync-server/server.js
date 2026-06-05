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
    methods: ['GET', 'HEAD']
  });

  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute'
  });

  await fs.mkdir(filesDir, { recursive: true });
  await fs.mkdir(backgroundsDir, { recursive: true });

  app.get('/health', async () => {
    const serverOnline = await checkTcp(mcHost, mcPort, 1200);

    return {
      ok: true,
      serverOnline,
      playersOnline: null,
      playersMax: null,
      players: [],
      message: serverOnline ? 'Serwer MC odpowiada.' : 'Backend działa, ale serwer MC nie odpowiada.'
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

function mapTargetUrl(target, requestUrl) {
  const base = target.endsWith('/') ? target : `${target}/`;
  let suffix = requestUrl.startsWith('/map') ? requestUrl.slice('/map'.length) : requestUrl;
  if (suffix.startsWith('/')) suffix = suffix.slice(1);
  if (!suffix) suffix = '';
  return new URL(suffix, base).toString();
}

function parseMapRequestHeaders(env) {
  const headers = {};

  if (env.MAP_REQUEST_HEADERS) {
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
  mapTargetUrl,
  parseMapRequestHeaders,
  resolveInside
};
