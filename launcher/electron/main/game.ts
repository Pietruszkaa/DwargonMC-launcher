import axios from 'axios';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { MIN_NEOFORGE_VERSION, MC_VERSION } from './constants';
import type { MclcAuthorization } from './microsoftAuth';
import type { LauncherPaths } from './paths';
import type { ServerMinecraftConfig } from './servers';
import type { LauncherSettings } from './storage';
import { validateNickname } from './validation';

const { Client } = require('minecraft-launcher-core') as {
  Client: new () => EventEmitter & { launch(options: Record<string, unknown>): Promise<void> };
};

export type LaunchStatus = {
  running: boolean;
  phase: 'idle' | 'preparing' | 'launching' | 'running' | 'closed' | 'error';
  message: string;
  exitCode?: number;
};

export type GameEvents = {
  onStatus(status: LaunchStatus): void;
  onLog(line: string): void;
  onCrash(exitCode: number): void;
};

export type MinecraftInstanceCheck = {
  ready: boolean;
  missing: string[];
  message: string;
};

export async function launchGame(
  paths: LauncherPaths,
  settings: LauncherSettings,
  nickname: string,
  authorization: MclcAuthorization,
  events: GameEvents,
  minecraftConfig?: ServerMinecraftConfig | null
): Promise<LaunchStatus> {
  const validationError = validateNickname(nickname);

  if (validationError) {
    return {
      running: false,
      phase: 'error',
      message: validationError
    };
  }

  const minecraft = minecraftConfig ?? {
    address: null,
    version: MC_VERSION,
    loader: 'neoforge' as const,
    loaderVersion: null
  };

  const neoforge =
    minecraft.loader === 'neoforge'
      ? await ensureNeoForgeInstaller(paths.launcherDataDir, events, minecraft)
      : null;

  if (neoforge) await purgeStaleForgeMetadata(paths.minecraftDir, minecraft.version, neoforge.version, events);

  const launcher = new Client();
  const javaPath = settings.javaPath.trim() || undefined;

  launcher.on('debug', (line) => events.onLog(String(line)));
  launcher.on('data', (line) => events.onLog(String(line)));
  launcher.on('progress', (progress) => {
    events.onLog(`Progress: ${JSON.stringify(progress)}`);
    events.onStatus({
      running: true,
      phase: 'launching',
      message: minecraftDownloadMessage(progress)
    });
  });
  launcher.on('close', (code) => {
    const exitCode = typeof code === 'number' ? code : 0;

    events.onStatus({
      running: false,
      phase: 'closed',
      message: exitCode === 0 ? 'Gra została zamknięta.' : `Gra zakończyła się kodem ${exitCode}.`,
      exitCode
    });

    if (exitCode !== 0) {
      events.onCrash(exitCode);
    }
  });

  const options: Record<string, unknown> = {
    authorization,
    root: paths.minecraftDir,
    version: {
      number: minecraft.version,
      type: 'release'
    },
    forge: neoforge?.file,
    memory: {
      max: `${settings.ramMb}M`,
      min: '1024M'
    },
    overrides: {
      detached: false
    },
    quickPlay: settings.autoConnect && minecraft.address
      ? {
          type: 'multiplayer',
          identifier: minecraft.address
        }
      : undefined,
    javaPath
  };

  const customArgs = splitLaunchArgs(settings.jvmArgs);
  const customLaunchArgs = splitLaunchArgs(settings.minecraftArgs);

  if (settings.autoConnect && minecraft.address) {
    const [host, portStr] = minecraft.address.split(':');
    customLaunchArgs.push('--server', host);
    if (portStr) customLaunchArgs.push('--port', portStr);
  }

  if (customArgs.length > 0) options.customArgs = customArgs;
  if (customLaunchArgs.length > 0) options.customLaunchArgs = customLaunchArgs;

  events.onStatus({ running: true, phase: 'launching', message: 'Uruchamianie Minecraft...' });
  await launcher.launch(options);

  return {
    running: true,
    phase: 'running',
    message: 'Minecraft uruchomiony.'
  };
}

export async function checkMinecraftInstanceReady(
  paths: LauncherPaths,
  minecraft: ServerMinecraftConfig
): Promise<MinecraftInstanceCheck> {
  const missing: string[] = [];
  const versionDir = path.join(paths.minecraftDir, 'versions', minecraft.version);

  if (!(await fileExists(path.join(versionDir, `${minecraft.version}.json`)))) missing.push(`versions/${minecraft.version}/${minecraft.version}.json`);
  if (!(await fileExists(path.join(versionDir, `${minecraft.version}.jar`)))) missing.push(`versions/${minecraft.version}/${minecraft.version}.jar`);
  if (!(await directoryHasFiles(path.join(paths.minecraftDir, 'libraries')))) missing.push('libraries/');
  if (!(await fileExists(path.join(paths.minecraftDir, 'assets', 'indexes', `${minecraft.version}.json`)))) {
    missing.push(`assets/indexes/${minecraft.version}.json`);
  }
  if (!(await directoryHasFiles(path.join(paths.minecraftDir, 'assets', 'objects')))) missing.push('assets/objects/');

  const exactNeoForgeVersion = minecraft.loaderVersion && minecraft.loaderVersion !== 'latest' ? minecraft.loaderVersion : null;

  if (minecraft.loader === 'neoforge' && !(await hasNeoForgeInstaller(paths.launcherDataDir, exactNeoForgeVersion))) {
    missing.push(exactNeoForgeVersion ? `launcher-data/neoforge-${exactNeoForgeVersion}-installer.jar` : 'launcher-data/neoforge-*-installer.jar');
  }

  return {
    ready: missing.length === 0,
    missing,
    message: missing.length
      ? 'Ta instancja Minecraft nie jest jeszcze przygotowana. Launcher nie pobiera core automatycznie przy kliknięciu Graj.'
      : 'Instancja Minecraft wygląda na przygotowaną.'
  };
}

export async function ensureNeoForgeInstaller(
  launcherDataDir: string,
  events: GameEvents,
  minecraft: ServerMinecraftConfig
): Promise<{ version: string; file: string }> {
  events.onStatus({ running: false, phase: 'preparing', message: 'Sprawdzanie NeoForge...' });

  const explicitVersion = explicitNeoForgeLoaderVersion(minecraft.loaderVersion);
  const version = explicitVersion ?? await resolveLatestNeoForgeVersion(minecraft.version);

  const destination = path.join(launcherDataDir, `neoforge-${version}-installer.jar`);
  const tempDestination = `${destination}.download`;

  try {
    const stat = await fs.stat(destination);

    if (stat.size > 0) {
      events.onStatus({ running: false, phase: 'preparing', message: `Weryfikacja cache NeoForge ${version}...` });

      const verification = await verifyNeoForgeInstallerFile(destination, version);

      if (verification.ok) {
        events.onLog(`NeoForge ${version} installer cached and SHA256 verified.`);
        return { version, file: destination };
      }

      events.onLog(`NeoForge ${version} cached installer invalid: ${verification.message}`);
      await fs.rm(destination, { force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  events.onStatus({ running: false, phase: 'preparing', message: `Pobieranie NeoForge ${version}...` });

  const url = neoForgeInstallerUrl(version);

  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: (code) => code === 200
    });

    await fs.mkdir(launcherDataDir, { recursive: true });
    await fs.writeFile(tempDestination, Buffer.from(response.data));

    events.onStatus({ running: false, phase: 'preparing', message: `Weryfikacja NeoForge ${version}...` });

    const verification = await verifyNeoForgeInstallerFile(tempDestination, version);

    if (!verification.ok) {
      await fs.rm(tempDestination, { force: true });
      throw new Error(verification.message);
    }

    await fs.rm(destination, { force: true });
    await fs.rename(tempDestination, destination);
    await fs.writeFile(neoForgeInstallerSha256Path(destination), `${verification.hash}\n`, 'utf8');

    events.onLog(`NeoForge ${version} installer downloaded and SHA256 verified.`);
    return { version, file: destination };
  } catch (error) {
    await fs.rm(tempDestination, { force: true });
    throw error;
  }
}

async function verifyNeoForgeInstallerFile(filePath: string, version: string): Promise<{ ok: true; hash: string } | { ok: false; hash: string | null; message: string }> {
  const expectedHash = await readNeoForgeInstallerSidecarSha256(filePath) ?? await getNeoForgeInstallerSha256(version);

  if (!expectedHash) {
    return {
      ok: false,
      hash: null,
      message: `Nie można zweryfikować SHA256 instalatora NeoForge ${version}. Pobieranie przerwane.`
    };
  }

  const actualHash = await sha256File(filePath);

  if (actualHash !== expectedHash) {
    return {
      ok: false,
      hash: actualHash,
      message: `Suma SHA256 instalatora NeoForge ${version} nie zgadza się. Pobrany: ${actualHash}, oczekiwany: ${expectedHash}.`
    };
  }

  return {
    ok: true,
    hash: actualHash
  };
}

async function readNeoForgeInstallerSidecarSha256(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(neoForgeInstallerSha256Path(filePath), 'utf8');
    return parseSha256Checksum(raw);
  } catch {
    return null;
  }
}

function neoForgeInstallerSha256Path(filePath: string): string {
  return `${filePath}.sha256`;
}

async function getNeoForgeInstallerSha256(version: string): Promise<string | null> {
  const url = `${neoForgeInstallerUrl(version)}.sha256`;

  try {
    const response = await axios.get<string>(url, {
      responseType: 'text',
      timeout: 12000,
      validateStatus: (code) => code === 200
    });

    const hash = parseSha256Checksum(response.data);

    if (!hash) {
      throw new Error(`Niepoprawny format SHA256 dla NeoForge ${version}.`);
    }

    return hash;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Nie udało się pobrać SHA256 NeoForge ${version}: HTTP ${error.response?.status ?? 'brak odpowiedzi'}.`);
    }

    throw error;
  }
}

export function parseSha256Checksum(raw: string): string | null {
  const hash = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function neoForgeInstallerUrl(version: string): string {
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
}

export function isSafeNeoForgeVersionToken(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(version);
}

function explicitNeoForgeLoaderVersion(loaderVersion: string | null): string | null {
  if (!loaderVersion || loaderVersion === 'latest') return null;

  const trimmed = loaderVersion.trim();

  if (!isSafeNeoForgeVersionToken(trimmed)) {
    throw new Error(`Backend podał niepoprawną wersję NeoForge: ${loaderVersion}`);
  }

  return trimmed;
}

async function hasNeoForgeInstaller(launcherDataDir: string, loaderVersion: string | null): Promise<boolean> {
  if (loaderVersion) return fileExists(path.join(launcherDataDir, `neoforge-${loaderVersion}-installer.jar`));

  try {
    const entries = await fs.readdir(launcherDataDir);
    return entries.some((entry) => /^neoforge-\d+\.\d+\.\d+-installer\.jar$/.test(entry));
  } catch {
    return false;
  }
}

async function resolveLatestNeoForgeVersion(minecraftVersion: string): Promise<string> {
  if (minecraftVersion !== MC_VERSION) {
    throw new Error(`Backend musi podać minecraft.loaderVersion dla NeoForge ${minecraftVersion}.`);
  }

  try {
    const response = await axios.get<string>('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', {
      responseType: 'text',
      timeout: 12000,
      validateStatus: (code) => code === 200
    });

    const versions = parseNeoForgeVersions(response.data).filter((version) => compareNeoForgeVersions(version, MIN_NEOFORGE_VERSION) >= 0);
    versions.sort(compareNeoForgeVersions);
    return versions.at(-1) ?? MIN_NEOFORGE_VERSION;
  } catch {
    return MIN_NEOFORGE_VERSION;
  }
}

export function parseNeoForgeVersions(metadataXml: string): string[] {
  return [...metadataXml.matchAll(/<version>(?<version>21\.1\.\d+)<\/version>/g)]
    .map((match) => match.groups?.version)
    .filter((version): version is string => Boolean(version));
}

export function compareNeoForgeVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

export function minecraftDownloadMessage(progress: unknown): string {
  if (!progress || typeof progress !== 'object') return 'Pobieranie plików Minecraft...';

  const record = progress as Record<string, unknown>;
  const task = typeof record.task === 'string' ? record.task : typeof record.type === 'string' ? record.type : '';
  const file = typeof record.name === 'string' ? record.name : typeof record.file === 'string' ? record.file : '';
  const total = typeof record.total === 'number' ? record.total : null;
  const current = typeof record.current === 'number' ? record.current : null;
  const count = total && current ? ` (${current}/${total})` : '';
  const label = file || task;

  return label ? `Pobieranie Minecraft: ${label}${count}` : `Pobieranie plików Minecraft${count}...`;
}

export function splitLaunchArgs(value: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of value.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);
  return args;
}

export function forgeMetadataIsStale(versionJson: string, minecraftVersion: string, expectedLoaderVersion: string, candidateMinecraftVersion: string | null = null): boolean {
  try {
    const parsed = JSON.parse(versionJson) as { id?: unknown; inheritsFrom?: unknown };
    const id = typeof parsed.id === 'string' ? parsed.id : '';
    const inheritsFrom = typeof parsed.inheritsFrom === 'string' ? parsed.inheritsFrom : '';
    const source = `${id} ${inheritsFrom}`.trim();

    if (!source) return false;

    const actualLoaderVersion = forgeMetadataLoaderVersion(source);

    if (!actualLoaderVersion) return false;

    const metadataMinecraftVersion = forgeMetadataMinecraftVersion(source);
    const actualMinecraftVersion = metadataMinecraftVersion ?? candidateMinecraftVersion;

    if (actualMinecraftVersion !== minecraftVersion) return false;

    return actualLoaderVersion !== expectedLoaderVersion;
  } catch {
    return false;
  }
}

function forgeMetadataMinecraftVersion(value: string): string | null {
  const withoutLoaderVersion = value.replace(/(?:^|[-_\s])(?:neo)?forge[-_]\d+\.\d+\.\d+(?:[-+][A-Za-z0-9][A-Za-z0-9._-]*)?(?=$|[-_\s])/gi, ' ');
  const match = withoutLoaderVersion.match(/(?:^|[^0-9.])(?<version>\d+\.\d+(?:\.\d+)?)(?=$|[^0-9.])/);
  return match?.groups?.version ?? null;
}

function forgeMetadataLoaderVersion(value: string): string | null {
  const match = value.match(/(?:^|[-_\s])(?:neo)?forge[-_](?<version>\d+\.\d+\.\d+(?:[-+][A-Za-z0-9][A-Za-z0-9._-]*)?)(?=$|[-_\s])/i);
  return match?.groups?.version ?? null;
}

export async function purgeStaleForgeMetadata(
  minecraftDir: string,
  minecraftVersion: string,
  loaderVersion: string,
  events?: GameEvents
): Promise<boolean> {
  const candidates = await staleForgeMetadataCandidates(minecraftDir, minecraftVersion);
  let removed = false;

  for (const candidate of candidates) {
    const versionJsonPath = path.join(candidate.dir, 'version.json');

    try {
      const versionJson = await fs.readFile(versionJsonPath, 'utf8');

      if (!forgeMetadataIsStale(versionJson, minecraftVersion, loaderVersion, candidate.minecraftVersion)) {
        continue;
      }

      await fs.rm(candidate.dir, { recursive: true, force: true });
      events?.onLog(`Removed stale Forge metadata: ${path.basename(candidate.dir)}`);
      removed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        events?.onLog(`Could not inspect Forge metadata ${path.basename(candidate.dir)}.`);
      }
    }
  }

  return removed;
}

async function staleForgeMetadataCandidates(minecraftDir: string, minecraftVersion: string): Promise<Array<{ dir: string; minecraftVersion: string | null }>> {
  const candidates: Array<{ dir: string; minecraftVersion: string | null }> = [];

  const versionsDir = path.join(minecraftDir, 'versions');
  const legacyForgeDir = path.join(minecraftDir, 'forge');

  try {
    const entries = await fs.readdir(versionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const name = entry.name;
      const lowerName = name.toLowerCase();
      const versionToken = directoryMinecraftVersionToken(name);

      if (versionToken !== minecraftVersion) continue;
      if (!lowerName.includes('forge') && !lowerName.includes('neoforge')) continue;

      candidates.push({ dir: path.join(versionsDir, entry.name), minecraftVersion: versionToken });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  try {
    const entries = await fs.readdir(legacyForgeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const versionToken = directoryMinecraftVersionToken(entry.name);
      if (versionToken !== minecraftVersion) continue;

      candidates.push({ dir: path.join(legacyForgeDir, entry.name), minecraftVersion: versionToken });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const unique = new Map(candidates.map((candidate) => [candidate.dir, candidate]));
  return [...unique.values()];
}

function directoryMinecraftVersionToken(name: string): string | null {
  const match = name.match(/(?:^|[^0-9.])(?<version>\d+\.\d+(?:\.\d+)?)(?=$|[^0-9.])/);
  return match?.groups?.version ?? null;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryHasFiles(directory: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(directory);
    return entries.length > 0;
  } catch {
    return false;
  }
}
