import axios from 'axios';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256File } from './hash';
import type { LauncherPaths } from './paths';

export type ManagedFile = {
  name: string;
  path: string;
  size: number;
  sha256: string;
  version?: string;
};

export type PlayerAddonKind = 'mod' | 'resourcepack' | 'shader';

export type PlayerAddonFile = {
  kind: PlayerAddonKind;
  name: string;
  path: string;
  size: number;
  sha1: string;
  sha512: string;
};

export type ListAddonFilesOptions = {
  includeManaged?: boolean;
};

export type Manifest = {
  version: string;
  generatedAt: string;
  files: ManagedFile[];
  backgrounds?: ManagedFile[];
};

export type SyncStatus = {
  phase: 'idle' | 'checking' | 'downloading' | 'complete' | 'warning' | 'error';
  verified: boolean;
  message: string;
  currentFile?: string;
  completedFiles: number;
  totalFiles: number;
};

export type SyncReporter = (status: SyncStatus) => void;

export async function runSync(paths: LauncherPaths, backendUrl: string, report: SyncReporter): Promise<SyncStatus> {
  const checking = status('checking', false, 'Sprawdzanie manifestu...', 0, 0);
  report(checking);

  let manifest: Manifest;

  try {
    manifest = await fetchManifest(backendUrl);
  } catch {
    const warning = status('warning', false, 'Nie udało się zweryfikować plików. Serwer synchronizacji nie odpowiada.', 0, 0);
    report(warning);
    return warning;
  }

  return syncManifestFiles(
    paths,
    manifest,
    (remotePath, localPath, kind) =>
      kind === 'background' ? downloadBackgroundFile(backendUrl, remotePath, localPath) : downloadManagedFile(backendUrl, remotePath, localPath),
    report
  );
}

export async function syncManifestFiles(
  paths: LauncherPaths,
  manifest: Manifest,
  downloadFile: (remotePath: string, localPath: string, kind: 'file' | 'background') => Promise<void>,
  report: SyncReporter
): Promise<SyncStatus> {
  await fs.mkdir(paths.minecraftDir, { recursive: true });
  await fs.mkdir(path.join(paths.assetsDir, 'backgrounds'), { recursive: true });

  const managesBackgrounds = Array.isArray(manifest.backgrounds);
  const backgrounds = managesBackgrounds ? manifest.backgrounds ?? [] : [];
  const totalFiles = manifest.files.length + backgrounds.length;
  let completedFiles = 0;

  for (const file of manifest.files) {
    const localPath = managedLocalPath(paths.minecraftDir, file.path);
    const current = status('downloading', false, 'Synchronizacja plików...', completedFiles, totalFiles, file.path);
    report(current);

    const needsDownload = await fileNeedsDownload(localPath, file.sha256);

    if (needsDownload) {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await downloadFile(file.path, localPath, 'file');

      const downloadedHash = await sha256File(localPath);
      if (downloadedHash !== file.sha256) {
        const error = status('error', false, `Plik ${file.path} nie przeszedł weryfikacji SHA256.`, completedFiles, totalFiles, file.path);
        report(error);
        return error;
      }
    }

    completedFiles += 1;
    report(status('downloading', false, 'Synchronizacja plików...', completedFiles, totalFiles, file.path));
  }

  await removeOrphanManagedFiles(paths.minecraftDir, manifest.files);

  for (const background of backgrounds) {
    const localPath = backgroundLocalPath(paths.assetsDir, background.path);
    const current = status('downloading', false, 'Synchronizacja teł...', completedFiles, totalFiles, background.path);
    report(current);

    const needsDownload = await fileNeedsDownload(localPath, background.sha256);

    if (needsDownload) {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await downloadFile(background.path, localPath, 'background');

      const downloadedHash = await sha256File(localPath);
      if (downloadedHash !== background.sha256) {
        const error = status('error', false, `Tło ${background.path} nie przeszło weryfikacji SHA256.`, completedFiles, totalFiles, background.path);
        report(error);
        return error;
      }
    }

    completedFiles += 1;
    report(status('downloading', false, 'Synchronizacja teł...', completedFiles, totalFiles, background.path));
  }

  if (managesBackgrounds) {
    await removeOrphanBackgrounds(paths.assetsDir, backgrounds);
  }

  const complete = status('complete', true, 'Pliki zweryfikowane.', completedFiles, totalFiles);
  report(complete);
  return complete;
}

export async function fetchManifest(backendUrl: string): Promise<Manifest> {
  const response = await axios.get<Manifest>(`${backendUrl}/manifest.json`, {
    timeout: 8000,
    validateStatus: (code) => code === 200
  });

  return response.data;
}

export async function listManagedLocalFiles(minecraftDir: string): Promise<ManagedFile[]> {
  const files = await walkFiles(minecraftDir);
  const managed = files.filter((file) => path.basename(file).startsWith('_'));

  return Promise.all(
    managed.map(async (file) => {
      const stat = await fs.stat(file);
      const relative = normalizeRelativePath(path.relative(minecraftDir, file));

      return {
        name: path.basename(file),
        path: relative,
        size: stat.size,
        sha256: await sha256File(file)
      };
    })
  );
}

export async function listPlayerAddonFiles(minecraftDir: string, options: ListAddonFilesOptions = {}): Promise<PlayerAddonFile[]> {
  const groups: Array<{ kind: PlayerAddonKind; dir: string }> = [
    { kind: 'mod', dir: 'mods' },
    { kind: 'resourcepack', dir: 'resourcepacks' },
    { kind: 'shader', dir: 'shaderpacks' }
  ];
  const output: PlayerAddonFile[] = [];

  for (const group of groups) {
    const root = path.join(minecraftDir, group.dir);
    const files = await walkFiles(root);

    for (const file of files) {
      if (!options.includeManaged && path.basename(file).startsWith('_')) continue;
      if (!isAddonFile(file)) continue;

      const stat = await fs.stat(file);
      const data = await fs.readFile(file);
      output.push({
        kind: group.kind,
        name: path.basename(file),
        path: normalizeRelativePath(path.relative(minecraftDir, file)),
        size: stat.size,
        sha1: crypto.createHash('sha1').update(data).digest('hex'),
        sha512: crypto.createHash('sha512').update(data).digest('hex')
      });
    }
  }

  return output.sort((left, right) => left.path.localeCompare(right.path, 'pl'));
}

export function managedLocalPath(minecraftDir: string, remotePath: string): string {
  const safe = normalizeRemotePath(remotePath);
  const directory = path.dirname(safe);
  const filename = path.basename(safe);
  const prefixed = filename.startsWith('_') ? filename : `_${filename}`;
  return path.join(minecraftDir, directory === '.' ? '' : directory, prefixed);
}

export function managedRelativePath(remotePath: string): string {
  const safe = normalizeRemotePath(remotePath);
  const directory = path.dirname(safe);
  const filename = path.basename(safe);
  const prefixed = filename.startsWith('_') ? filename : `_${filename}`;
  return normalizeRelativePath(path.join(directory === '.' ? '' : directory, prefixed));
}

export function backgroundLocalPath(assetsDir: string, remotePath: string): string {
  const safe = normalizeRemotePath(remotePath);
  return path.join(assetsDir, 'backgrounds', safe);
}

export function backgroundRelativePath(remotePath: string): string {
  return normalizeRemotePath(remotePath);
}

export function normalizeRemotePath(remotePath: string): string {
  const normalized = path.posix.normalize(remotePath.replaceAll('\\', '/')).replace(/^\/+/, '');

  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe remote path: ${remotePath}`);
  }

  return normalized;
}

async function fileNeedsDownload(localPath: string, expectedSha256: string): Promise<boolean> {
  try {
    const hash = await sha256File(localPath);
    return hash !== expectedSha256;
  } catch {
    return true;
  }
}

async function downloadManagedFile(backendUrl: string, remotePath: string, localPath: string): Promise<void> {
  await downloadBackendAsset(`${backendUrl}/files/${encodeRemotePath(remotePath)}`, localPath);
}

async function downloadBackgroundFile(backendUrl: string, remotePath: string, localPath: string): Promise<void> {
  await downloadBackendAsset(`${backendUrl}/backgrounds/${encodeRemotePath(remotePath)}`, localPath);
}

async function downloadBackendAsset(url: string, localPath: string): Promise<void> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    validateStatus: (code) => code === 200
  });

  await fs.writeFile(localPath, Buffer.from(response.data));
}

async function removeOrphanManagedFiles(minecraftDir: string, manifestFiles: ManagedFile[]): Promise<void> {
  const expected = new Set(manifestFiles.map((file) => managedRelativePath(file.path)));
  const files = await walkFiles(minecraftDir);

  await Promise.all(
    files.map(async (file) => {
      const relative = normalizeRelativePath(path.relative(minecraftDir, file));
      if (path.basename(file).startsWith('_') && !expected.has(relative)) {
        await fs.unlink(file);
      }
    })
  );
}

async function removeOrphanBackgrounds(assetsDir: string, manifestBackgrounds: ManagedFile[]): Promise<void> {
  const backgroundsDir = path.join(assetsDir, 'backgrounds');
  const expected = new Set(manifestBackgrounds.map((file) => backgroundRelativePath(file.path)));
  const files = await walkFiles(backgroundsDir);

  await Promise.all(
    files.map(async (file) => {
      const relative = normalizeRelativePath(path.relative(backgroundsDir, file));
      if (!expected.has(relative)) {
        await fs.unlink(file);
      }
    })
  );
}

async function walkFiles(root: string): Promise<string[]> {
  const output: string[] = [];

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) {
        output.push(...(await walkFiles(absolute)));
      } else if (entry.isFile()) {
        output.push(absolute);
      }
    }
  } catch {
    return output;
  }

  return output;
}

function status(
  phase: SyncStatus['phase'],
  verified: boolean,
  message: string,
  completedFiles: number,
  totalFiles: number,
  currentFile?: string
): SyncStatus {
  return {
    phase,
    verified,
    message,
    currentFile,
    completedFiles,
    totalFiles
  };
}

function encodeRemotePath(remotePath: string): string {
  return normalizeRemotePath(remotePath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeRelativePath(relative: string): string {
  return relative.replaceAll(path.sep, '/');
}

function isAddonFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.jar' || extension === '.zip';
}
