import axios from 'axios';
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

async function ensureNeoForgeInstaller(
  launcherDataDir: string,
  events: GameEvents,
  minecraft: ServerMinecraftConfig
): Promise<{ version: string; file: string }> {
  events.onStatus({ running: false, phase: 'preparing', message: 'Sprawdzanie NeoForge...' });
  const version = minecraft.loaderVersion && minecraft.loaderVersion !== 'latest'
    ? minecraft.loaderVersion
    : await resolveLatestNeoForgeVersion(minecraft.version);
  const destination = path.join(launcherDataDir, `neoforge-${version}-installer.jar`);

  try {
    const stat = await fs.stat(destination);
    if (stat.size > 0) {
      events.onLog(`NeoForge ${version} installer cached.`);
      return { version, file: destination };
    }
  } catch {
    // Download below.
  }

  events.onStatus({ running: false, phase: 'preparing', message: `Pobieranie NeoForge ${version}...` });
  const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    validateStatus: (code) => code === 200
  });

  await fs.mkdir(launcherDataDir, { recursive: true });
  await fs.writeFile(destination, Buffer.from(response.data));
  events.onLog(`NeoForge ${version} installer downloaded.`);
  return { version, file: destination };
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryHasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function purgeStaleForgeMetadata(
  minecraftDir: string,
  minecraftVersion: string,
  desiredNeoForgeVersion: string,
  events?: GameEvents
): Promise<boolean> {
  const forgeVersionDir = path.join(minecraftDir, 'forge', minecraftVersion);
  const versionJson = path.join(forgeVersionDir, 'version.json');

  let raw: string;
  try {
    raw = await fs.readFile(versionJson, 'utf8');
  } catch {
    return false;
  }

  if (!forgeMetadataIsStale(raw, desiredNeoForgeVersion)) {
    return false;
  }

  await fs.rm(forgeVersionDir, { recursive: true, force: true });
  events?.onLog(`Usunięto stare metadata NeoForge dla ${minecraftVersion}; wymagane ${desiredNeoForgeVersion}.`);
  return true;
}

export function forgeMetadataIsStale(versionJson: string, desiredNeoForgeVersion: string): boolean {
  return !versionJson.includes(`neoforge-${desiredNeoForgeVersion}`) && !versionJson.includes(`"version": "${desiredNeoForgeVersion}"`);
}
