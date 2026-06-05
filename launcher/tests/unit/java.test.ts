import { describe, expect, it } from 'vitest';
import { parseJavaVersion } from '../../electron/main/java';

describe('parseJavaVersion', () => {
  it('reads modern Java versions', () => {
    expect(parseJavaVersion('openjdk version "21.0.5" 2024-10-15')).toBe(21);
    expect(parseJavaVersion('java version "22"')).toBe(22);
  });

  it('returns null when version output is unknown', () => {
    expect(parseJavaVersion('not java')).toBeNull();
  });
});
