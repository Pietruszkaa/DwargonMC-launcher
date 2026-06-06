import axios from 'axios';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MC_VERSION } from './constants';
import type { LauncherPaths } from './paths';
import type { ServerMinecraftConfig } from './servers';
import { listPlayerAddonFiles, type PlayerAddonFile } from './sync';

const MODRINTH_API = 'https://api.modrinth.com/v2';

export type ModrinthProjectType = 'mod' | 'resourcepack' | 'shader';
export type ModrinthSort = 'relevance' | 'downloads' | 'updated' | 'newest';

export type ModrinthSearchRequest = {
  query: string;
  projectType: ModrinthProjectType;
  sort: ModrinthSort;
  offset?: number;
  limit?: number;
};

export type ModrinthProject = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  projectType: ModrinthProjectType;
  clientSide: string;
  serverSide: string;
  downloads: number;
  iconUrl: string | null;
};

export type ModrinthInstallRequest = {
  projectId: string;
  projectType: ModrinthProjectType;
  slug?: string;
};

export type ModrinthInstallResult = {
  installed: boolean;
  message: string;
  fileName: string | null;
  targetPath: string | null;
};

export type ModrinthAddonUpdate = {
  path: string;
  status: 'unknown' | 'current' | 'update';
  projectId: string | null;
  versionNumber: string | null;
  fileName: string | null;
  downloadUrl: string | null;
  message: string;
};

export type InstalledModrinthProject = {
  projectId: string | null;
  slug: string;
  fileName: string;
  path: string;
  kind: PlayerAddonFile['kind'];
  managed: boolean;
};

type SearchResponse = {
  hits?: Array<Record<string, unknown>>;
};

type VersionResponse = Array<{
  project_id?: string;
  version_number?: string;
  version_type?: string;
  status?: string;
  files?: Array<{
    url?: string;
    filename?: string;
    primary?: boolean;
    hashes?: {
      sha1?: string;
      sha512?: string;
    };
  }>;
}>;

type DetectionCache = Record<
  string,
  {
    projectId: string | null;
    versionNumber: string | null;
    checkedAt: string;
  }
>;

export type ModrinthSearchCache = {
  query: string;
  projectType: ModrinthProjectType;
  sort: ModrinthSort;
  gameVersion: string;
  loader: string;
  results: ModrinthProject[];
  updatedAt: string;
} | null;

export async function searchModrinth(
  paths: LauncherPaths,
  request: ModrinthSearchRequest,
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<ModrinthProject[]> {
  const query = request.query.trim();
  const response = await axios.get<SearchResponse>(`${MODRINTH_API}/search`, {
    params: {
      query,
      facets: JSON.stringify(searchFacets(request.projectType, minecraft.version, minecraft.loader)),
      index: request.sort,
      limit: request.limit ?? 20,
      offset: request.offset ?? 0
    },
    headers: modrinthHeaders(appVersion),
    timeout: 10000,
    validateStatus: (code) => code === 200
  });

  const results = (response.data.hits ?? []).map(normalizeProject).filter((project): project is ModrinthProject => Boolean(project));
  if ((request.offset ?? 0) === 0) await writeSearchCache(paths, request, minecraft, results);
  return results;
}

export async function installModrinthProject(
  paths: LauncherPaths,
  request: ModrinthInstallRequest,
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<ModrinthInstallResult> {
  const version = await findInstallableVersion(request, appVersion, minecraft);
  const file = version?.files?.find((candidate) => candidate.primary) ?? version?.files?.[0];

  if (!version || !file?.url || !file.filename) {
    return {
      installed: false,
      message: 'Nie znaleziono zgodnej wersji do instalacji.',
      fileName: null,
      targetPath: null
    };
  }

  const fileName = safeFileName(file.filename);
  const targetDir = installDir(paths, request.projectType);
  const targetPath = path.join(targetDir, fileName);
  const existingFile = await installedFileForProject(paths, request, targetPath, appVersion, minecraft);

  if (existingFile) {
    return {
      installed: false,
      message: `Ten dodatek jest już zainstalowany: ${existingFile}.`,
      fileName,
      targetPath
    };
  }

  const response = await axios.get<ArrayBuffer>(file.url, {
    responseType: 'arraybuffer',
    headers: modrinthHeaders(appVersion),
    timeout: 60000,
    validateStatus: (code) => code === 200
  });
  const data = Buffer.from(response.data);

  verifyHash(data, file.hashes);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetPath, data);

  return {
    installed: true,
    message: `Zainstalowano ${fileName}.`,
    fileName,
    targetPath
  };
}

async function installedFileForProject(
  paths: LauncherPaths,
  request: ModrinthInstallRequest,
  targetPath: string,
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<string | null> {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isFile() && stat.size > 0) return path.basename(targetPath);
  } catch {
    // Check hashes below.
  }

  const files = await listPlayerAddonFiles(paths.minecraftDir, { includeManaged: true });
  const expectedKind = projectTypeToAddonKind(request.projectType);
  const bySlug = files.find((file) => file.kind === expectedKind && fileLooksLikeProject(file.name, request.slug ?? request.projectId));
  if (bySlug) return bySlug.name;

  const identified = await identifyInstalledModrinthProjects(paths, files, appVersion, minecraft);
  const byProject = identified.find((file) => file.projectId === request.projectId);
  if (byProject) return byProject.fileName;

  return null;
}

function projectTypeToAddonKind(projectType: ModrinthProjectType): PlayerAddonFile['kind'] {
  if (projectType === 'resourcepack') return 'resourcepack';
  if (projectType === 'shader') return 'shader';
  return 'mod';
}

export async function checkModrinthAddonUpdates(
  files: PlayerAddonFile[],
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<ModrinthAddonUpdate[]> {
  const results: ModrinthAddonUpdate[] = [];

  for (const file of files) {
    try {
      const latest = await latestVersionFromHash(file, appVersion, minecraft);
      const primary = latest.files?.find((candidate) => candidate.primary) ?? latest.files?.[0] ?? null;

      if (!primary?.filename || !primary.url) {
        results.push(unknownUpdate(file, 'Modrinth zna plik, ale nie zwrocil pliku do pobrania.'));
        continue;
      }

      const isCurrent = primary.hashes?.sha512 === file.sha512 || primary.hashes?.sha1 === file.sha1;
      results.push({
        path: file.path,
        status: isCurrent ? 'current' : 'update',
        projectId: latest.project_id ?? null,
        versionNumber: latest.version_number ?? null,
        fileName: primary.filename,
        downloadUrl: primary.url,
        message: isCurrent ? 'Aktualne.' : `Dostepna wersja ${latest.version_number ?? primary.filename}.`
      });
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      results.push(unknownUpdate(file, status === 404 ? 'Zrodlo nieznane w Modrinth.' : 'Nie udalo sie sprawdzic aktualizacji.'));
    }
  }

  return results;
}

export function listInstalledModrinthProjects(files: PlayerAddonFile[]): InstalledModrinthProject[] {
  const output: InstalledModrinthProject[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const slug = addonSlugFromFileName(file.name);
    if (!slug || seen.has(`${file.kind}:${slug}`)) continue;

    seen.add(`${file.kind}:${slug}`);
    output.push({
      projectId: null,
      slug,
      fileName: file.name,
      path: file.path,
      kind: file.kind,
      managed: file.managed
    });
  }

  return output;
}

export async function identifyInstalledModrinthProjects(
  paths: LauncherPaths,
  files: PlayerAddonFile[],
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<InstalledModrinthProject[]> {
  const cache = await readDetectionCache(paths);
  let dirty = false;

  const items = await Promise.all(
    listInstalledModrinthProjects(files).map(async (item) => {
      const file = files.find((candidate) => candidate.path === item.path);
      if (!file?.sha512) return item;

      const cached = cache[file.sha512];
      if (cached && Date.now() - Date.parse(cached.checkedAt) < 7 * 24 * 60 * 60 * 1000) {
        return { ...item, projectId: cached.projectId };
      }

      try {
        const version = await versionFromHash(file.sha512, appVersion);
        cache[file.sha512] = {
          projectId: version.project_id ?? null,
          versionNumber: version.version_number ?? null,
          checkedAt: new Date().toISOString()
        };
        dirty = true;
        return { ...item, projectId: version.project_id ?? null };
      } catch {
        cache[file.sha512] = {
          projectId: null,
          versionNumber: null,
          checkedAt: new Date().toISOString()
        };
        dirty = true;
        return item;
      }
    })
  );

  if (dirty) await writeDetectionCache(paths, cache);
  return items.filter((item) => item.kind !== 'mod' || minecraft.loader === 'neoforge' || !item.managed);
}

export function fileLooksLikeProject(fileName: string, projectSlug: string): boolean {
  const fileSlug = addonSlugFromFileName(fileName);
  const expected = normalizeSlug(projectSlug);
  if (!fileSlug || !expected) return false;

  return fileSlug === expected || fileSlug.startsWith(`${expected}-`);
}

export function addonSlugFromFileName(fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext).replace(/^_+/, '');
  const ignored = new Set(['all', 'client', 'common', 'fabric', 'forge', 'mc', 'minecraft', 'mod', 'neoforge', 'quilt']);
  const tokens = base
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !ignored.has(token) && !isVersionToken(token));

  return tokens.slice(0, 3).join('-');
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
}

function isVersionToken(token: string): boolean {
  return /^v?\d+(?:\.\d+)*$/.test(token) || /^\d+(?:\.\d+)*[a-z]?/.test(token) || /^mc\d/.test(token);
}

export function searchFacets(projectType: ModrinthProjectType, gameVersion = MC_VERSION, loader = 'neoforge'): string[][] {
  const facets = [[`project_type:${projectType}`], [`versions:${gameVersion}`]];

  if (projectType === 'mod') {
    if (loader !== 'vanilla') facets.push([`categories:${loader}`]);
    facets.push(['client_side:required', 'client_side:optional']);
    facets.push(['server_side:unsupported', 'server_side:optional']);
  }

  if (projectType === 'resourcepack') {
    facets.push(['categories:minecraft']);
  }

  return facets;
}

async function latestVersionFromHash(
  file: PlayerAddonFile,
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<VersionResponse[number]> {
  const response = await axios.post<VersionResponse[number]>(
    `${MODRINTH_API}/version_file/${file.sha512}/update`,
    {
      loaders: updateLoaders(file.kind, minecraft.loader),
      game_versions: [minecraft.version]
    },
    {
      params: {
        algorithm: 'sha512'
      },
      headers: modrinthHeaders(appVersion),
      timeout: 12000,
      validateStatus: (code) => code === 200
    }
  );

  return response.data;
}

async function versionFromHash(sha512: string, appVersion: string): Promise<VersionResponse[number]> {
  const response = await axios.get<VersionResponse[number]>(`${MODRINTH_API}/version_file/${sha512}`, {
    params: { algorithm: 'sha512' },
    headers: modrinthHeaders(appVersion),
    timeout: 12000,
    validateStatus: (code) => code === 200
  });

  return response.data;
}

function updateLoaders(kind: PlayerAddonFile['kind'], loader: ServerMinecraftConfig['loader']): string[] {
  if (kind === 'mod') return loader === 'vanilla' ? [] : [loader];
  if (kind === 'resourcepack') return ['minecraft'];
  return ['iris', 'oculus'];
}

function unknownUpdate(file: PlayerAddonFile, message: string): ModrinthAddonUpdate {
  return {
    path: file.path,
    status: 'unknown',
    projectId: null,
    versionNumber: null,
    fileName: null,
    downloadUrl: null,
    message
  };
}

async function findInstallableVersion(
  request: ModrinthInstallRequest,
  appVersion: string,
  minecraft: ServerMinecraftConfig
): Promise<VersionResponse[number] | null> {
  const response = await axios.get<VersionResponse>(`${MODRINTH_API}/project/${encodeURIComponent(request.projectId)}/version`, {
    params: versionParams(request.projectType, minecraft),
    headers: modrinthHeaders(appVersion),
    timeout: 12000,
    validateStatus: (code) => code === 200
  });

  return (
    response.data.find((version) => version.status === 'listed' && version.version_type === 'release' && version.files?.length) ??
    response.data.find((version) => version.status === 'listed' && version.files?.length) ??
    response.data.find((version) => version.files?.length) ??
    null
  );
}

function versionParams(projectType: ModrinthProjectType, minecraft: ServerMinecraftConfig): Record<string, string | boolean> {
  const params: Record<string, string | boolean> = {
    game_versions: JSON.stringify([minecraft.version]),
    include_changelog: false
  };

  if (projectType === 'mod' && minecraft.loader !== 'vanilla') {
    params.loaders = JSON.stringify([minecraft.loader]);
  }

  if (projectType === 'resourcepack') {
    params.loaders = JSON.stringify(['minecraft']);
  }

  return params;
}

export async function readSearchCache(paths: LauncherPaths): Promise<ModrinthSearchCache> {
  try {
    return JSON.parse(await fs.readFile(searchCacheFile(paths), 'utf8')) as ModrinthSearchCache;
  } catch {
    return null;
  }
}

async function writeSearchCache(
  paths: LauncherPaths,
  request: ModrinthSearchRequest,
  minecraft: ServerMinecraftConfig,
  results: ModrinthProject[]
): Promise<void> {
  await fs.mkdir(paths.launcherDataDir, { recursive: true });
  await fs.writeFile(
    searchCacheFile(paths),
    `${JSON.stringify(
      {
        query: request.query,
        projectType: request.projectType,
        sort: request.sort,
        gameVersion: minecraft.version,
        loader: minecraft.loader,
        results,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

async function readDetectionCache(paths: LauncherPaths): Promise<DetectionCache> {
  try {
    return JSON.parse(await fs.readFile(detectionCacheFile(paths), 'utf8')) as DetectionCache;
  } catch {
    return {};
  }
}

async function writeDetectionCache(paths: LauncherPaths, cache: DetectionCache): Promise<void> {
  await fs.mkdir(paths.launcherDataDir, { recursive: true });
  await fs.writeFile(detectionCacheFile(paths), `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function searchCacheFile(paths: LauncherPaths): string {
  return path.join(paths.launcherDataDir, 'modrinth-search-cache.json');
}

function detectionCacheFile(paths: LauncherPaths): string {
  return path.join(paths.launcherDataDir, 'modrinth-detection-cache.json');
}

function normalizeProject(input: Record<string, unknown>): ModrinthProject | null {
  const projectId = stringValue(input.project_id);
  const slug = stringValue(input.slug);
  const title = stringValue(input.title);
  const projectType = stringValue(input.project_type);
  if (!projectId || !slug || !title || !isProjectType(projectType)) return null;

  return {
    projectId,
    slug,
    title,
    description: stringValue(input.description),
    author: stringValue(input.author),
    projectType,
    clientSide: stringValue(input.client_side),
    serverSide: stringValue(input.server_side),
    downloads: numberValue(input.downloads),
    iconUrl: stringValue(input.icon_url) || null
  };
}

function installDir(paths: LauncherPaths, projectType: ModrinthProjectType): string {
  if (projectType === 'resourcepack') return path.join(paths.minecraftDir, 'resourcepacks');
  if (projectType === 'shader') return path.join(paths.minecraftDir, 'shaderpacks');
  return path.join(paths.minecraftDir, 'mods');
}

function verifyHash(data: Buffer, hashes: { sha1?: string; sha512?: string } | undefined): void {
  if (hashes?.sha512) {
    const actual = crypto.createHash('sha512').update(data).digest('hex');
    if (actual !== hashes.sha512) throw new Error('Pobrany plik nie przeszedl weryfikacji SHA512.');
    return;
  }

  if (hashes?.sha1) {
    const actual = crypto.createHash('sha1').update(data).digest('hex');
    if (actual !== hashes.sha1) throw new Error('Pobrany plik nie przeszedl weryfikacji SHA1.');
  }
}

function modrinthHeaders(appVersion: string): Record<string, string> {
  return {
    'User-Agent': `Pietruszkaa/DwargonMC-launcher/${appVersion} (https://github.com/Pietruszkaa/DwargonMC-launcher)`
  };
}

function safeFileName(fileName: string): string {
  const base = path.basename(fileName).trim();
  if (!base || base === '.' || base === '..') throw new Error('Modrinth zwrocil niepoprawna nazwe pliku.');
  return base;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isProjectType(value: string): value is ModrinthProjectType {
  return value === 'mod' || value === 'resourcepack' || value === 'shader';
}
