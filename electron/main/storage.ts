import fs from 'node:fs/promises';
import { DEFAULT_BACKEND_URL } from './constants';
import type { LauncherPaths } from './paths';
import { clampRam, getRamInfo } from './ram';

export type Language = 'pl' | 'en';

export type LauncherSettings = {
  backendUrl: string;
  ramMb: number;
  fov: number;
  closeOnLaunch: boolean;
  autoConnect: boolean;
  showLogs: boolean;
  javaPath: string;
  language: Language;
};

export type LauncherProfile = {
  nickname: string;
  lastPlayedAt: string | null;
};

export function defaultSettings(): LauncherSettings {
  const ram = getRamInfo();

  return {
    backendUrl: DEFAULT_BACKEND_URL,
    ramMb: ram.defaultRamMb,
    fov: 70,
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
    lastPlayedAt: null
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
    fov: Math.min(Math.max(Number(settings.fov) || 70, 30), 110),
    language: settings.language === 'en' ? 'en' : 'pl'
  };
}

export async function saveSettings(paths: LauncherPaths, settings: LauncherSettings): Promise<LauncherSettings> {
  const normalized: LauncherSettings = {
    ...settings,
    backendUrl: normalizeBackendUrl(settings.backendUrl),
    ramMb: clampRam(settings.ramMb),
    fov: Math.min(Math.max(Number(settings.fov) || 70, 30), 110),
    language: settings.language === 'en' ? 'en' : 'pl'
  };

  return writeJson(paths.settingsFile, normalized);
}

export async function readProfile(paths: LauncherPaths): Promise<LauncherProfile> {
  return readJson(paths.profileFile, defaultProfile());
}

export async function saveProfile(paths: LauncherPaths, profile: LauncherProfile): Promise<LauncherProfile> {
  return writeJson(paths.profileFile, {
    nickname: profile.nickname.trim(),
    lastPlayedAt: profile.lastPlayedAt ?? null
  });
}

export function normalizeBackendUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_BACKEND_URL;
  return trimmed.replace(/\/+$/, '');
}
