import { describe, expect, it } from 'vitest';
import { minecraftFovOptionValue } from '../../electron/main/game';

describe('minecraftFovOptionValue', () => {
  it('maps launcher FOV to Minecraft options.txt value', () => {
    expect(minecraftFovOptionValue(70)).toBe('0');
    expect(minecraftFovOptionValue(30)).toBe('-1');
    expect(minecraftFovOptionValue(110)).toBe('1');
  });

  it('clamps invalid FOV values', () => {
    expect(minecraftFovOptionValue(10)).toBe('-1');
    expect(minecraftFovOptionValue(140)).toBe('1');
  });
});
