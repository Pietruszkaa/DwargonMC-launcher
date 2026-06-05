import { describe, expect, it } from 'vitest';
import { offlineUuid, validateNickname } from '../../electron/main/validation';

describe('nickname validation', () => {
  it('accepts Minecraft-safe offline nicknames', () => {
    expect(validateNickname('Dwargon_123')).toBeNull();
  });

  it('rejects unsafe nicknames', () => {
    expect(validateNickname('ab')).toMatch(/3-16/);
    expect(validateNickname('../admin')).toMatch(/3-16/);
  });
});

describe('offlineUuid', () => {
  it('generates deterministic v3-style offline UUIDs', () => {
    expect(offlineUuid('Steve')).toBe('5627dd98-e6be-3c21-b8a8-e92344183641');
    expect(offlineUuid('Steve')).toBe(offlineUuid('Steve'));
  });
});
