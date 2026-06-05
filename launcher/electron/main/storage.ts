import fs from 'node:fs/promises';
import { DEFAULT_BACKEND_URL } from './constants';
import type { LauncherPaths } from './paths';
import { clampRam, getRamInfo } from './ram';

export type Language = 'pl' | 'en';

export type LauncherSettings = {
  backendUrl: string;
  ramMb: number;
  closeOnLaunch: boolean;
  windowCloseBehavior: 'ask' | 'tray' | 'exit';
  autoConnect: boolean;
  showLogs: boolean;
  javaPath: string;
  jvmArgs: string;
  minecraftArgs: string;
  language: Language;
};

export type LauncherProfile = {
  nickname: string;
  accountMode: 'offline' | 'microsoft';
  microsoft: {
    name: string;
    uuid: string;
    refreshToken: string;
    xuid: string | null;
    expiresAt: number | null;
  } | null;
  lastPlayedAt: string | null;
  lastSessionSeconds: number;
  totalPlaySeconds: number;
  launchCount: number;
  setupComplete: boolean;
};

export function defaultSettings(): LauncherSettings {
  const ram = getRamInfo();

  return {
    backendUrl: DEFAULT_BACKEND_URL,
    ramMb: ram.defaultRamMb,
    closeOnLaunch: false,
    windowCloseBehavior: 'ask',
    autoConnect: true,
    showLogs: true,
    javaPath: '',
    jvmArgs: '',
    minecraftArgs: '',
    language: 'pl'
  };
}

export function defaultProfile(): LauncherProfile {
  return {
    nickname: '',
    accountMode: 'offline',
    microsoft: null,
    lastPlayedAt: null,
    lastSessionSeconds: 0,
    totalPlaySeconds: 0,
    launchCount: 0,
    setupComplete: false
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(file: string, value: T): Promise<T> {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
}

export async function readSettings(paths: LauncherPaths): Promise<LauncherSettings> {
  const settings = await readJson(paths.settingsFile, defaultSettings());

  return {
    ...settings,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    ramMb: clampRam(settings.ramMb),
    windowCloseBehavior: normalizeWindowCloseBehavior(settings.windowCloseBehavior),
    jvmArgs: normalizeArgLine(settings.jvmArgs),
    minecraftArgs: normalizeArgLine(settings.minecraftArgs),
    language: settings.language === 'en' ? 'en' : 'pl'
  };
}

export async function saveSettings(paths: LauncherPaths, settings: LauncherSettings): Promise<LauncherSettings> {
  const normalized: LauncherSettings = {
    ...settings,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    ramMb: clampRam(settings.ramMb),
    windowCloseBehavior: normalizeWindowCloseBehavior(settings.windowCloseBehavior),
    jvmArgs: normalizeArgLine(settings.jvmArgs),
    minecraftArgs: normalizeArgLine(settings.minecraftArgs),
    language: settings.language === 'en' ? 'en' : 'pl'
  };

  return writeJson(paths.settingsFile, normalized);
}

export async function readProfile(paths: LauncherPaths): Promise<LauncherProfile> {
  try {
    const raw = await fs.readFile(paths.profileFile, 'utf8');
    const profile = JSON.parse(raw) as Partial<LauncherProfile>;

    const microsoft = normalizeMicrosoftProfile(profile.microsoft);

    return {
      nickname: profile.nickname ?? '',
      accountMode: profile.accountMode === 'microsoft' && microsoft ? 'microsoft' : 'offline',
      microsoft: profile.accountMode === 'microsoft' ? microsoft : null,
      lastPlayedAt: profile.lastPlayedAt ?? null,
      lastSessionSeconds: Math.max(0, Number(profile.lastSessionSeconds) || 0),
      totalPlaySeconds: Math.max(0, Number(profile.totalPlaySeconds) || 0),
      launchCount: Math.max(0, Number(profile.launchCount) || 0),
      setupComplete: profile.setupComplete ?? true
    };
  } catch {
    return defaultProfile();
  }
}

export async function saveProfile(paths: LauncherPaths, profile: LauncherProfile): Promise<LauncherProfile> {
  const microsoft = normalizeMicrosoftProfile(profile.microsoft);
  const accountMode = profile.accountMode === 'microsoft' && microsoft ? 'microsoft' : 'offline';

  return writeJson(paths.profileFile, {
    nickname: profile.nickname.trim(),
    accountMode,
    microsoft: accountMode === 'microsoft' ? microsoft : null,
    lastPlayedAt: profile.lastPlayedAt ?? null,
    lastSessionSeconds: Math.max(0, Math.round(Number(profile.lastSessionSeconds) || 0)),
    totalPlaySeconds: Math.max(0, Math.round(Number(profile.totalPlaySeconds) || 0)),
    launchCount: Math.max(0, Math.round(Number(profile.launchCount) || 0)),
    setupComplete: profile.setupComplete
  });
}

function normalizeMicrosoftProfile(profile: LauncherProfile['microsoft'] | undefined): LauncherProfile['microsoft'] {
  if (!profile?.name || !profile.uuid || !profile.refreshToken) return null;

  return {
    name: String(profile.name),
    uuid: String(profile.uuid),
    refreshToken: String(profile.refreshToken),
    xuid: profile.xuid ? String(profile.xuid) : null,
    expiresAt: typeof profile.expiresAt === 'number' ? profile.expiresAt : null
  };
}

export function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_BACKEND_URL;
  return trimmed.replace(/\/+$/, '');
}

function normalizeArgLine(value: string | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeWindowCloseBehavior(value: LauncherSettings['windowCloseBehavior'] | undefined): LauncherSettings['windowCloseBehavior'] {
  return value === 'tray' || value === 'exit' ? value : 'ask';
}
