import os from 'node:os';

export type RamInfo = {
  totalRamMb: number;
  maxRamMb: number;
  defaultRamMb: number;
};

export function getRamInfo(): RamInfo {
  const totalRamMb = Math.floor(os.totalmem() / 1024 / 1024);
  const maxRamMb = Math.max(2048, Math.floor(totalRamMb * 0.75));
  const defaultRamMb = totalRamMb <= 8192 ? 3072 : totalRamMb <= 12288 ? 6144 : 8192;

  return {
    totalRamMb,
    maxRamMb,
    defaultRamMb: clampRam(defaultRamMb, maxRamMb)
  };
}

export function clampRam(valueMb: number, maxRamMb = getRamInfo().maxRamMb): number {
  const normalized = Number.isFinite(valueMb) ? Math.round(valueMb / 256) * 256 : 3072;
  return Math.min(Math.max(normalized, 2048), maxRamMb);
}
