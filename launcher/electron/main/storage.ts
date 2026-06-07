import fs from 'node:fs/promises';
import { DEFAULT_BACKEND_URL } from './constants';
import { saveMicrosoftRefreshToken } from './keychain';
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

export type MicrosoftProfile = {
  name: string;
  uuid: string;
  xuid: string | null;
  expiresAt: number | null;
};

export type LauncherProfile = {
  nickname: string;
  accountMode: 'offline' | 'microsoft';
  microsoft: MicrosoftProfile | null;
  lastPlayedAt: string | null;
  lastSessionSeconds: number;
  totalPlaySeconds: number;
  launchCount: number;
  setupComplete: boolean;
};

type LegacyMicrosoftProfile = MicrosoftProfile & {
  refreshToken?: unknown;
};

type LegacyLauncherProfile = Partial<Omit<LauncherProfile, 'microsoft'>> & {
  microsoft?: LegacyMicrosoftProfile | null;
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
  let profile: LegacyLauncherProfile;

  try {
    const raw = await fs.readFile(paths.profileFile, 'utf8');
    profile = JSON.parse(raw) as LegacyLauncherProfile;
  } catch {
    return defaultProfile();
  }

  const microsoft = normalizeMicrosoftProfile(profile.microsoft);
  const accountMode = profile.accountMode === 'microsoft' && microsoft ? 'microsoft' : 'offline';

  if (accountMode === 'microsoft' && microsoft && hasLegacyRefreshToken(profile.microsoft)) {
    await saveMicrosoftRefreshToken(microsoft.uuid, String(profile.microsoft.refreshToken));

    const migrated = normalizeProfile({
      ...profile,
      accountMode,
      microsoft
    });

    await writeJson(paths.profileFile, migrated);
    return migrated;
  }

  return normalizeProfile({
    ...profile,
    accountMode,
    microsoft: accountMode === 'microsoft' ? microsoft : null
  });
}

export async function saveProfile(paths: LauncherPaths, profile: LauncherProfile): Promise<LauncherProfile> {
  const normalized = normalizeProfile(profile);
  return writeJson(paths.profileFile, normalized);
}

function normalizeProfile(profile: LegacyLauncherProfile): LauncherProfile {
  const microsoft = normalizeMicrosoftProfile(profile.microsoft);
  const accountMode = profile.accountMode === 'microsoft' && microsoft ? 'microsoft' : 'offline';

  return {
    nickname: typeof profile.nickname === 'string' ? profile.nickname.trim() : '',
    accountMode,
    microsoft: accountMode === 'microsoft' ? microsoft : null,
    lastPlayedAt: typeof profile.lastPlayedAt === 'string' ? profile.lastPlayedAt : null,
    lastSessionSeconds: Math.max(0, Math.round(Number(profile.lastSessionSeconds) || 0)),
    totalPlaySeconds: Math.max(0, Math.round(Number(profile.totalPlaySeconds) || 0)),
    launchCount: Math.max(0, Math.round(Number(profile.launchCount) || 0)),
    setupComplete: profile.setupComplete ?? true
  };
}

function normalizeMicrosoftProfile(profile: LegacyLauncherProfile['microsoft'] | undefined): MicrosoftProfile | null {
  if (!profile?.name || !profile.uuid) return null;

  return {
    name: String(profile.name),
    uuid: String(profile.uuid),
    xuid: profile.xuid ? String(profile.xuid) : null,
    expiresAt: typeof profile.expiresAt === 'number' ? profile.expiresAt : null
  };
}

function hasLegacyRefreshToken(profile: LegacyLauncherProfile['microsoft'] | undefined): profile is LegacyMicrosoftProfile & { refreshToken: string } {
  return typeof profile?.refreshToken === 'string' && profile.refreshToken.trim().length > 0;
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
