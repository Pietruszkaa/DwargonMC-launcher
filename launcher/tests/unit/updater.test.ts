import { describe, expect, it } from 'vitest';
import { compareVersions, parseLatestRelease, parseSha256Sums } from '../../electron/main/updater';

describe('launcher updater helpers', () => {
  it('compares semver-like versions', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('v1.1.2', '1.1.2')).toBe(0);
    expect(compareVersions('1.1.1', '1.1.2')).toBe(-1);
  });

  it('extracts executable and sha assets from latest release', () => {
    const status = parseLatestRelease(
      {
        tag_name: 'v1.2.0',
        name: 'DwargonMC Launcher v1.2.0',
        html_url: 'https://github.com/release',
        body: 'Zmiany',
        assets: [
          { name: 'DwargonMC Launcher 1.2.0.exe', browser_download_url: 'https://download/exe' },
          { name: 'SHA256SUMS.txt', browser_download_url: 'https://download/sha' }
        ]
      },
      '1.1.2'
    );

    expect(status.available).toBe(true);
    expect(status.latestVersion).toBe('1.2.0');
    expect(status.downloadUrl).toBe('https://download/exe');
    expect(status.downloadName).toBe('DwargonMC Launcher 1.2.0.exe');
    expect(status.sha256Url).toBe('https://download/sha');
  });

  it('does not treat release page as a downloadable executable', () => {
    const status = parseLatestRelease(
      {
        tag_name: 'v1.2.0',
        html_url: 'https://github.com/release',
        assets: []
      },
      '1.1.2'
    );

    expect(status.available).toBe(true);
    expect(status.releaseUrl).toBe('https://github.com/release');
    expect(status.downloadUrl).toBeNull();
  });

  it('extracts SHA256 for matching release asset name', () => {
    const raw = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  other.exe',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  DwargonMC Launcher 1.2.0.exe'
    ].join('\n');

    expect(parseSha256Sums(raw, 'DwargonMC Launcher 1.2.0.exe')).toBe('b'.repeat(64));
  });
});
