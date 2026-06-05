import fs from 'node:fs/promises';
import { DEFAULT_BACKEND_URL } from './constants';
import type { LauncherPaths } from './paths';
import { clampRam, getRamInfo } from './ram';

export type Language = 'pl' | 'en';

export type LauncherSettings = {
  backendUrl: string;
  ramMb: number;
  closeOnLaunch: boolean;
  autoConnect: boolean;
  showLogs: boolean;
  javaPath: string;
  language: Language;
};

export type LauncherProfile = {
  nickname: string;
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
    autoConnect: true,
    showLogs: true,
    javaPath: '',
    language: 'pl'
  };
}

export function defaultProfile(): LauncherProfile {
  return {
    nickname: '',
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
    language: settings.language === 'en' ? 'en' : 'pl'
  };
}

export async function saveSettings(paths: LauncherPaths, settings: LauncherSettings): Promise<LauncherSettings> {
  const normalized: LauncherSettings = {
    ...settings,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    ramMb: clampRam(settings.ramMb),
    language: settings.language === 'en' ? 'en' : 'pl'
  };

  return writeJson(paths.settingsFile, normalized);
}

export async function readProfile(paths: LauncherPaths): Promise<LauncherProfile> {
  try {
    const raw = await fs.readFile(paths.profileFile, 'utf8');
    const profile = JSON.parse(raw) as Partial<LauncherProfile>;

    return {
      nickname: profile.nickname ?? '',
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
  return writeJson(paths.profileFile, {
    nickname: profile.nickname.trim(),
    lastPlayedAt: profile.lastPlayedAt ?? null,
    lastSessionSeconds: Math.max(0, Math.round(Number(profile.lastSessionSeconds) || 0)),
    totalPlaySeconds: Math.max(0, Math.round(Number(profile.totalPlaySeconds) || 0)),
    launchCount: Math.max(0, Math.round(Number(profile.launchCount) || 0)),
    setupComplete: profile.setupComplete
  });
}

export function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_BACKEND_URL;
  return trimmed.replace(/\/+$/, '');
}
