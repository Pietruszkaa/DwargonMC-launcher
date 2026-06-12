import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { MC_VERSION } from './constants';
import type { LauncherPaths } from './paths';
import { normalizeBackendUrl } from './storage';

export type MinecraftLoader = 'vanilla' | 'neoforge';

export type ServerMinecraftConfig = {
  address: string | null;
  version: string;
  loader: MinecraftLoader;
  loaderVersion: string | null;
};

export type ServerEntry = {
  id: string;
  instanceId: string;
  name: string;
  backendUrl: string;
  minecraft: ServerMinecraftConfig;
  authRequired: boolean;
  addedAt: string;
  lastUsedAt: string;
};

export type ServerRegistry = {
  activeServerId: string | null;
  servers: ServerEntry[];
};

type ServerInfoResponse = {
  name?: unknown;
  minecraft?: {
    address?: unknown;
    version?: unknown;
    loader?: unknown;
    loaderVersion?: unknown;
  };
  auth?: {
    required?: unknown;
  };
};

export function emptyServerRegistry(): ServerRegistry {
  return {
    activeServerId: null,
    servers: []
  };
}

export async function readServerRegistry(paths: LauncherPaths): Promise<ServerRegistry> {
  try {
    const raw = await fs.readFile(paths.serversFile, 'utf8');
    return normalizeRegistry(JSON.parse(raw));
  } catch {
    return emptyServerRegistry();
  }
}

export async function saveServerRegistry(paths: LauncherPaths, registry: ServerRegistry): Promise<ServerRegistry> {
  const normalized = normalizeRegistry(registry);
  await fs.mkdir(paths.globalDataDir, { recursive: true });
  await fs.writeFile(paths.serversFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export async function addServer(paths: LauncherPaths, registry: ServerRegistry, backendUrl: string): Promise<ServerRegistry> {
  const normalizedUrl = normalizeBackendUrl(backendUrl);
  if (!normalizedUrl) throw new Error('Wklej adres backendu serwera.');

  const info = await fetchServerInfoOrFallback(normalizedUrl);
  const now = new Date().toISOString();
  const existing = registry.servers.find((server) => server.id === normalizedUrl);
  const entry: ServerEntry = {
    id: normalizedUrl,
    instanceId: existing?.instanceId ?? instanceIdForBackend(normalizedUrl),
    name: info.name || existing?.name || serverNameFromUrl(normalizedUrl),
    backendUrl: normalizedUrl,
    minecraft: mergeMinecraftConfig(existing?.minecraft, info.minecraft),
    authRequired: info.authRequired,
    addedAt: existing?.addedAt ?? now,
    lastUsedAt: now
  };

  return saveServerRegistry(paths, {
    activeServerId: entry.id,
    servers: [...registry.servers.filter((server) => server.id !== entry.id), entry]
  });
}

export async function removeServer(paths: LauncherPaths, registry: ServerRegistry, serverId: string): Promise<ServerRegistry> {
  const remaining = registry.servers.filter((server) => server.id !== serverId);
  const activeServerId = registry.activeServerId === serverId ? remaining[0]?.id ?? null : registry.activeServerId;

  return saveServerRegistry(paths, {
    activeServerId,
    servers: remaining
  });
}

export async function refreshServerName(
  paths: LauncherPaths,
  registry: ServerRegistry,
  serverId: string
): Promise<ServerRegistry | null> {
  const server = registry.servers.find((s) => s.id === serverId);
  if (!server) return null;

  try {
    const info = await fetchServerInfo(server.backendUrl);
    const newName = info.name || server.name;
    if (newName === server.name) return null; // no change

    const updated = {
      ...registry,
      servers: registry.servers.map((s) =>
        s.id === serverId ? { ...s, name: newName } : s
      )
    };
    return saveServerRegistry(paths, updated);
  } catch {
    return null;
  }
}

export async function activateServer(paths: LauncherPaths, registry: ServerRegistry, serverId: string): Promise<ServerRegistry> {
  const now = new Date().toISOString();
  const server = registry.servers.find((entry) => entry.id === serverId);
  if (!server) throw new Error('Nie znaleziono serwera.');

  return saveServerRegistry(paths, {
    activeServerId: server.id,
    servers: registry.servers.map((entry) => (entry.id === server.id ? { ...entry, lastUsedAt: now } : entry))
  });
}

export function activeServer(registry: ServerRegistry): ServerEntry | null {
  return registry.servers.find((server) => server.id === registry.activeServerId) ?? null;
}

export function instanceIdForBackend(backendUrl: string): string {
  const normalized = normalizeBackendUrl(backendUrl);
  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 10);
  return `${serverNameFromUrl(normalized).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'server'}-${hash}`;
}

async function fetchServerInfo(backendUrl: string): Promise<{ name: string | null; minecraft: ServerMinecraftConfig; authRequired: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${backendUrl}/server.json`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Dwargon-Launcher'
      }
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as ServerInfoResponse;
    return {
      name: typeof json.name === 'string' && json.name.trim() ? json.name.trim() : null,
      minecraft: normalizeMinecraftConfig(json.minecraft),
      authRequired: json.auth?.required === true
    };
  } catch {
    throw new Error('Backend nie odpowiada albo nie wystawia /server.json.');
  }
}

async function fetchServerInfoOrFallback(backendUrl: string): Promise<{ name: string | null; minecraft: ServerMinecraftConfig; authRequired: boolean }> {
  try {
    return await fetchServerInfo(backendUrl);
  } catch {
    return {
      name: null,
      minecraft: {
        address: null,
        version: MC_VERSION,
        loader: 'neoforge',
        loaderVersion: null
      },
      authRequired: false
    };
  }
}

function normalizeRegistry(input: unknown): ServerRegistry {
  const value = input as Partial<ServerRegistry>;
  const servers = Array.isArray(value.servers)
    ? value.servers
        .map(normalizeServerEntry)
        .filter((server): server is ServerEntry => Boolean(server))
    : [];
  const activeServerId = typeof value.activeServerId === 'string' && servers.some((server) => server.id === value.activeServerId)
    ? value.activeServerId
    : servers[0]?.id ?? null;

  return { activeServerId, servers };
}

function normalizeServerEntry(input: unknown): ServerEntry | null {
  const value = input as Partial<ServerEntry>;
  if (typeof value.backendUrl !== 'string' && typeof value.id !== 'string') return null;

  const backendUrl = normalizeBackendUrl(value.backendUrl || value.id || '');
  if (!backendUrl) return null;
  const now = new Date().toISOString();

  return {
    id: backendUrl,
    instanceId: typeof value.instanceId === 'string' && value.instanceId ? value.instanceId : instanceIdForBackend(backendUrl),
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : serverNameFromUrl(backendUrl),
    backendUrl,
    minecraft: normalizeMinecraftConfig((value as { minecraft?: unknown }).minecraft ?? { address: (value as { minecraftAddress?: unknown }).minecraftAddress }),
    authRequired: value.authRequired === true,
    addedAt: typeof value.addedAt === 'string' ? value.addedAt : now,
    lastUsedAt: typeof value.lastUsedAt === 'string' ? value.lastUsedAt : now
  };
}

function serverNameFromUrl(backendUrl: string): string {
  try {
    return new URL(backendUrl).hostname;
  } catch {
    return 'Serwer';
  }
}

function mergeMinecraftConfig(current: ServerMinecraftConfig | undefined, next: ServerMinecraftConfig): ServerMinecraftConfig {
  return {
    address: next.address ?? current?.address ?? null,
    version: next.version || current?.version || MC_VERSION,
    loader: next.loader || current?.loader || 'neoforge',
    loaderVersion: next.loaderVersion ?? current?.loaderVersion ?? null
  };
}

function normalizeMinecraftConfig(input: unknown): ServerMinecraftConfig {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const loader = value.loader === 'vanilla' ? 'vanilla' : 'neoforge';

  return {
    address: typeof value.address === 'string' && value.address.trim() ? value.address.trim() : null,
    version: typeof value.version === 'string' && value.version.trim() ? value.version.trim() : MC_VERSION,
    loader,
    loaderVersion: typeof value.loaderVersion === 'string' && value.loaderVersion.trim() ? value.loaderVersion.trim() : null
  };
}
