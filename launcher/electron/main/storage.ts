import fs from 'node:fs/promises';
import { DEFAULT_BACKEND_URL } from './constants';
import type { LauncherPaths } from './paths';
import { clampRam, getRamInfo } from './ram';
import { clearMicrosoftRefreshToken, readMicrosoftRefreshToken, saveMicrosoftRefreshToken } from './secureTokenStorage';

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
  refreshToken: string;
  xuid: string | null;
  expiresAt: number | null;
};

export type PublicMicrosoftProfile = Omit<MicrosoftProfile, 'refreshToken'>;

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

export type PublicLauncherProfile = Omit<LauncherProfile, 'microsoft'> & {
  microsoft: PublicMicrosoftProfile | null;
};

type PersistedMicrosoftProfile = PublicMicrosoftProfile & {
  refreshToken?: string;
};

type PersistedLauncherProfile = Omit<LauncherProfile, 'microsoft'> & {
  microsoft: PersistedMicrosoftProfile | null;
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

export function toPublicProfile(profile: LauncherProfile): PublicLauncherProfile {
  if (!profile.microsoft) {
    return profile;
  }

  const { refreshToken: _refreshToken, ...microsoft } = profile.microsoft;
  return {
    ...profile,
    microsoft
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
    const profile = JSON.parse(raw) as Partial<PersistedLauncherProfile>;
    const storedMicrosoft = normalizeStoredMicrosoftProfile(profile.microsoft);
    let refreshToken = await readMicrosoftRefreshToken(paths);
    let migratedLegacyToken = false;

    if (!refreshToken && storedMicrosoft?.refreshToken) {
      refreshToken = storedMicrosoft.refreshToken;
      migratedLegacyToken = true;
    }

    const microsoft = storedMicrosoft
      ? buildMicrosoftProfile(storedMicrosoft, refreshToken)
      : null;

    const normalized: LauncherProfile = {
      nickname: profile.nickname ?? '',
      accountMode: profile.accountMode === 'microsoft' && microsoft ? 'microsoft' : 'offline',
      microsoft: profile.accountMode === 'microsoft' ? microsoft : null,
      lastPlayedAt: profile.lastPlayedAt ?? null,
      lastSessionSeconds: Math.max(0, Number(profile.lastSessionSeconds) || 0),
      totalPlaySeconds: Math.max(0, Number(profile.totalPlaySeconds) || 0),
      launchCount: Math.max(0, Number(profile.launchCount) || 0),
      setupComplete: profile.setupComplete ?? true
    };

    if (migratedLegacyToken && normalized.microsoft?.refreshToken) {
      await persistProfile(paths, normalized);
    }

    return normalized;
  } catch {
    return defaultProfile();
  }
}

export async function saveProfile(paths: LauncherPaths, profile: LauncherProfile): Promise<LauncherProfile> {
  const existingToken = profile.microsoft?.refreshToken?.trim()
    ? profile.microsoft.refreshToken
    : await readMicrosoftRefreshToken(paths);
  const microsoft = normalizeMicrosoftProfile(profile.microsoft, existingToken);
  const accountMode = profile.accountMode === 'microsoft' && microsoft ? 'microsoft' : 'offline';

  const normalized: LauncherProfile = {
    nickname: profile.nickname.trim(),
    accountMode,
    microsoft: accountMode === 'microsoft' ? microsoft : null,
    lastPlayedAt: profile.lastPlayedAt ?? null,
    lastSessionSeconds: Math.max(0, Math.round(Number(profile.lastSessionSeconds) || 0)),
    totalPlaySeconds: Math.max(0, Math.round(Number(profile.totalPlaySeconds) || 0)),
    launchCount: Math.max(0, Math.round(Number(profile.launchCount) || 0)),
    setupComplete: profile.setupComplete
  };

  await persistProfile(paths, normalized);
  return normalized;
}

async function persistProfile(paths: LauncherPaths, profile: LauncherProfile): Promise<void> {
  if (profile.microsoft?.refreshToken) {
    await saveMicrosoftRefreshToken(paths, profile.microsoft.refreshToken);
  } else {
    await clearMicrosoftRefreshToken(paths);
  }

  await writeJson(paths.profileFile, {
    nickname: profile.nickname,
    accountMode: profile.accountMode,
    microsoft: profile.microsoft ? toPublicMicrosoftProfile(profile.microsoft) : null,
    lastPlayedAt: profile.lastPlayedAt,
    lastSessionSeconds: profile.lastSessionSeconds,
    totalPlaySeconds: profile.totalPlaySeconds,
    launchCount: profile.launchCount,
    setupComplete: profile.setupComplete
  });
}

function toPublicMicrosoftProfile(profile: MicrosoftProfile): PublicMicrosoftProfile {
  const { refreshToken: _refreshToken, ...publicProfile } = profile;
  return publicProfile;
}

function normalizeStoredMicrosoftProfile(
  profile: PersistedMicrosoftProfile | LauncherProfile['microsoft'] | undefined
): PersistedMicrosoftProfile | null {
  if (!profile?.name || !profile.uuid) return null;

  return {
    name: String(profile.name),
    uuid: String(profile.uuid),
    xuid: profile.xuid ? String(profile.xuid) : null,
    expiresAt: typeof profile.expiresAt === 'number' ? profile.expiresAt : null,
    refreshToken: profile.refreshToken ? String(profile.refreshToken) : undefined
  };
}

function buildMicrosoftProfile(
  profile: PersistedMicrosoftProfile,
  refreshToken: string | null
): MicrosoftProfile | null {
  if (!refreshToken) return null;

  return {
    name: profile.name,
    uuid: profile.uuid,
    refreshToken,
    xuid: profile.xuid,
    expiresAt: profile.expiresAt
  };
}

function normalizeMicrosoftProfile(
  profile: LauncherProfile['microsoft'] | undefined,
  refreshToken: string | null | undefined
): MicrosoftProfile | null {
  const stored = normalizeStoredMicrosoftProfile(profile);
  if (!stored) return null;

  const token = profile?.refreshToken?.trim() || refreshToken?.trim();
  if (!token) return null;

  return buildMicrosoftProfile(stored, token);
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
