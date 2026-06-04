import axios from 'axios';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { MIN_NEOFORGE_VERSION, SERVER_HOST, SERVER_PORT, MC_VERSION } from './constants';
import type { LauncherPaths } from './paths';
import type { LauncherSettings } from './storage';
import { offlineUuid, validateNickname } from './validation';

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

export async function launchGame(
  paths: LauncherPaths,
  settings: LauncherSettings,
  nickname: string,
  events: GameEvents
): Promise<LaunchStatus> {
  const validationError = validateNickname(nickname);

  if (validationError) {
    return {
      running: false,
      phase: 'error',
      message: validationError
    };
  }

  events.onStatus({ running: false, phase: 'preparing', message: 'Sprawdzanie NeoForge...' });
  const neoforge = await ensureNeoForgeInstaller(paths.launcherDataDir, events);
  await purgeStaleForgeMetadata(paths.minecraftDir, neoforge.version, events);
  await writeMinecraftOptions(paths.minecraftDir, settings);

  const launcher = new Client();
  const uuid = offlineUuid(nickname);
  const javaPath = settings.javaPath.trim() || undefined;

  launcher.on('debug', (line) => events.onLog(String(line)));
  launcher.on('data', (line) => events.onLog(String(line)));
  launcher.on('progress', (progress) => events.onLog(`Progress: ${JSON.stringify(progress)}`));
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
    authorization: {
      access_token: '0',
      client_token: uuid,
      uuid,
      name: nickname,
      user_properties: '{}',
      meta: {
        type: 'msa'
      }
    },
    root: paths.minecraftDir,
    version: {
      number: MC_VERSION,
      type: 'release'
    },
    forge: neoforge.file,
    memory: {
      max: `${settings.ramMb}M`,
      min: '1024M'
    },
    overrides: {
      detached: false
    },
    quickPlay: settings.autoConnect
      ? {
          type: 'multiplayer',
          identifier: `${SERVER_HOST}:${SERVER_PORT}`
        }
      : undefined,
    javaPath
  };

  events.onStatus({ running: true, phase: 'launching', message: 'Uruchamianie Minecraft...' });
  await launcher.launch(options);

  return {
    running: true,
    phase: 'running',
    message: 'Minecraft uruchomiony.'
  };
}

async function ensureNeoForgeInstaller(launcherDataDir: string, events: GameEvents): Promise<{ version: string; file: string }> {
  const version = await resolveLatestNeoForgeVersion();
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

async function resolveLatestNeoForgeVersion(): Promise<string> {
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

export async function purgeStaleForgeMetadata(minecraftDir: string, desiredNeoForgeVersion: string, events?: GameEvents): Promise<boolean> {
  const forgeVersionDir = path.join(minecraftDir, 'forge', MC_VERSION);
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
  events?.onLog(`Usunięto stare metadata NeoForge dla ${MC_VERSION}; wymagane ${desiredNeoForgeVersion}.`);
  return true;
}

export function forgeMetadataIsStale(versionJson: string, desiredNeoForgeVersion: string): boolean {
  return !versionJson.includes(`neoforge-${desiredNeoForgeVersion}`) && !versionJson.includes(`"version": "${desiredNeoForgeVersion}"`);
}

async function writeMinecraftOptions(minecraftDir: string, settings: LauncherSettings): Promise<void> {
  const optionsFile = path.join(minecraftDir, 'options.txt');
  const fovValue = minecraftFovOptionValue(settings.fov);

  let lines: string[] = [];
  try {
    lines = (await fs.readFile(optionsFile, 'utf8')).split(/\r?\n/).filter(Boolean);
  } catch {
    lines = [];
  }

  const withoutFov = lines.filter((line) => !line.startsWith('fov:'));
  withoutFov.push(`fov:${fovValue}`);

  await fs.mkdir(minecraftDir, { recursive: true });
  await fs.writeFile(optionsFile, `${withoutFov.join('\n')}\n`, 'utf8');
}

export function minecraftFovOptionValue(fov: number): string {
  const clamped = Math.min(Math.max(Number(fov) || 70, 30), 110);
  const normalized = (clamped - 70) / 40;
  return Number(normalized.toFixed(3)).toString();
}
