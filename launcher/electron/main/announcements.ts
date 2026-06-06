import fs from 'node:fs/promises';
import path from 'node:path';
import type { LauncherPaths } from './paths';

export type AnnouncementLevel = 'info' | 'warning' | 'maintenance' | 'update';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  level: AnnouncementLevel;
  date: string;
  link: string | null;
  expiresAt: string | null;
};

export type AnnouncementsStatus = {
  items: Announcement[];
  cached: boolean;
  error: string | null;
};

export async function getAnnouncements(paths: LauncherPaths, backendUrl: string): Promise<AnnouncementsStatus> {
  try {
    const remote = await fetchAnnouncements(backendUrl);
    await writeAnnouncementsCache(paths, remote);
    return { items: filterActiveAnnouncements(remote), cached: false, error: null };
  } catch (error) {
    const cached = await readAnnouncementsCache(paths);
    return {
      items: filterActiveAnnouncements(cached),
      cached: cached.length > 0,
      error: error instanceof Error ? error.message : 'Nie udało się pobrać komunikatów.'
    };
  }
}

export function normalizeAnnouncements(input: unknown): Announcement[] {
  const rawItems = Array.isArray(input) ? input : isObject(input) && Array.isArray(input.items) ? input.items : [];

  return rawItems
    .map((item): Announcement | null => {
      if (!isObject(item)) return null;

      const title = stringValue(item.title);
      const body = stringValue(item.body);
      if (!title || !body) return null;

      return {
        id: stringValue(item.id) || stableAnnouncementId(title, body),
        title,
        body,
        level: normalizeLevel(item.level),
        date: stringValue(item.date) || new Date(0).toISOString(),
        link: stringValue(item.link) || null,
        expiresAt: stringValue(item.expiresAt) || null
      };
    })
    .filter((item): item is Announcement => Boolean(item));
}

function filterActiveAnnouncements(items: Announcement[]): Announcement[] {
  const now = Date.now();
  return items
    .filter((item) => {
      if (!item.expiresAt) return true;
      const expiresAt = Date.parse(item.expiresAt);
      return Number.isNaN(expiresAt) || expiresAt > now;
    })
    .slice(0, 6);
}

async function fetchAnnouncements(backendUrl: string): Promise<Announcement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${backendUrl}/announcements.json`, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`Komunikaty: HTTP ${response.status}`);
    }
    return normalizeAnnouncements(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function readAnnouncementsCache(paths: LauncherPaths): Promise<Announcement[]> {
  try {
    const raw = await fs.readFile(cacheFile(paths), 'utf8');
    return normalizeAnnouncements(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeAnnouncementsCache(paths: LauncherPaths, items: Announcement[]): Promise<void> {
  await fs.mkdir(paths.launcherDataDir, { recursive: true });
  await fs.writeFile(cacheFile(paths), `${JSON.stringify({ items }, null, 2)}\n`, 'utf8');
}

function cacheFile(paths: LauncherPaths): string {
  return path.join(paths.launcherDataDir, 'announcements.json');
}

function normalizeLevel(level: unknown): AnnouncementLevel {
  return level === 'warning' || level === 'maintenance' || level === 'update' ? level : 'info';
}

function stableAnnouncementId(title: string, body: string): string {
  return `${title}:${body}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
