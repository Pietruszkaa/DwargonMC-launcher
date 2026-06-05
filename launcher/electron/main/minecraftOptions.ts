import fs from 'node:fs/promises';
import path from 'node:path';
import type { LauncherPaths } from './paths';

export type MinecraftOptionsState = {
  exists: boolean;
  path: string;
  values: Record<string, string>;
  updatedAt: string | null;
};

type ParsedOptions = {
  lines: string[];
  values: Record<string, string>;
};

export async function readMinecraftOptions(paths: LauncherPaths): Promise<MinecraftOptionsState> {
  const optionsPath = minecraftOptionsPath(paths);

  try {
    const stat = await fs.stat(optionsPath);
    const raw = await fs.readFile(optionsPath, 'utf8');
    return {
      exists: true,
      path: optionsPath,
      values: parseOptions(raw).values,
      updatedAt: stat.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      path: optionsPath,
      values: {},
      updatedAt: null
    };
  }
}

export async function saveMinecraftOptions(
  paths: LauncherPaths,
  values: Record<string, string>
): Promise<MinecraftOptionsState> {
  const optionsPath = minecraftOptionsPath(paths);
  await fs.mkdir(path.dirname(optionsPath), { recursive: true });

  const current = await readRawOptions(optionsPath);
  if (current) {
    await fs.writeFile(`${optionsPath}.bak`, current, 'utf8');
  }

  const parsed = parseOptions(current ?? '');
  await fs.writeFile(optionsPath, serializeOptions(parsed, normalizeValues(values)), 'utf8');
  return readMinecraftOptions(paths);
}

export function parseOptions(raw: string): ParsedOptions {
  const values: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;

    const key = line.slice(0, separator);
    if (isSafeOptionKey(key)) values[key] = line.slice(separator + 1);
  }

  return { lines, values };
}

function minecraftOptionsPath(paths: LauncherPaths): string {
  return path.join(paths.minecraftDir, 'options.txt');
}

async function readRawOptions(optionsPath: string): Promise<string | null> {
  try {
    return await fs.readFile(optionsPath, 'utf8');
  } catch {
    return null;
  }
}

function serializeOptions(parsed: ParsedOptions, values: Record<string, string>): string {
  const used = new Set<string>();
  const lines = parsed.lines
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.indexOf(':');
      if (separator <= 0) return line;

      const key = line.slice(0, separator);
      if (!Object.prototype.hasOwnProperty.call(values, key)) return line;

      used.add(key);
      return `${key}:${values[key]}`;
    });

  for (const key of Object.keys(values).sort()) {
    if (!used.has(key)) lines.push(`${key}:${values[key]}`);
  }

  return `${lines.join('\n')}\n`;
}

function normalizeValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => isSafeOptionKey(key))
      .map(([key, value]) => [key, String(value).replace(/\r?\n/g, ' ').trim()])
  );
}

function isSafeOptionKey(key: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(key);
}
