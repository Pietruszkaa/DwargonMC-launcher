import { describe, expect, it } from 'vitest';
import { clampRam } from '../../electron/main/ram';

describe('clampRam', () => {
  it('keeps RAM inside launcher limits', () => {
    expect(clampRam(1024, 8192)).toBe(2048);
    expect(clampRam(99999, 8192)).toBe(8192);
    expect(clampRam(4100, 8192)).toBe(4096);
  });
});
