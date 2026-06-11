import { describe, expect, it } from 'vitest';
import { normalizeSha256, parseJavaVersion, recommendedJavaForMinecraft } from '../../electron/main/java';

describe('parseJavaVersion', () => {
  it('reads modern Java versions', () => {
    expect(parseJavaVersion('openjdk version "21.0.5" 2024-10-15')).toBe(21);
    expect(parseJavaVersion('java version "22"')).toBe(22);
  });

  it('returns null when version output is unknown', () => {
    expect(parseJavaVersion('not java')).toBeNull();
  });

  it('normalizes valid SHA256 checksums', () => {
    expect(normalizeSha256(`${'A'.repeat(64)}\n`)).toBe('a'.repeat(64));
  });

  it('rejects invalid SHA256 checksums', () => {
    expect(normalizeSha256('not-a-hash')).toBeNull();
    expect(normalizeSha256('a'.repeat(63))).toBeNull();
    expect(normalizeSha256('g'.repeat(64))).toBeNull();
  });

  it('maps Minecraft versions to recommended Java versions', () => {
    expect(recommendedJavaForMinecraft('1.16.5')).toEqual({ major: 8, label: '8' });
    expect(recommendedJavaForMinecraft('1.17')).toEqual({ major: 16, label: '16' });
    expect(recommendedJavaForMinecraft('1.17.1')).toEqual({ major: 16, label: '16' });
    expect(recommendedJavaForMinecraft('1.20.4')).toEqual({ major: 17, label: '17' });
    expect(recommendedJavaForMinecraft('1.20.5')).toEqual({ major: 21, label: '21' });
    expect(recommendedJavaForMinecraft('1.21.11')).toEqual({ major: 21, label: '21' });
    expect(recommendedJavaForMinecraft('26.1')).toEqual({ major: 25, label: '25' });
  });
});
