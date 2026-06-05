import { describe, expect, it } from 'vitest';
import { normalizeAnnouncements } from '../../electron/main/announcements';

describe('normalizeAnnouncements', () => {
  it('keeps valid announcements and defaults unsafe fields', () => {
    expect(
      normalizeAnnouncements({
        items: [
          {
            title: '  Przerwa techniczna ',
            body: ' Serwer wraca wieczorem. ',
            level: 'maintenance',
            link: 'https://dwargonmc.pl'
          },
          {
            title: 'Bez tresci',
            body: ''
          },
          null
        ]
      })
    ).toEqual([
      {
        id: 'przerwa-techniczna-serwer-wraca-wieczorem',
        title: 'Przerwa techniczna',
        body: 'Serwer wraca wieczorem.',
        level: 'maintenance',
        date: '1970-01-01T00:00:00.000Z',
        link: 'https://dwargonmc.pl',
        expiresAt: null
      }
    ]);
  });

  it('accepts a plain array and falls back to info level', () => {
    expect(
      normalizeAnnouncements([
        {
          id: 'news',
          title: 'Nowosc',
          body: 'Test',
          level: 'other'
        }
      ])
    ).toEqual([
      {
        id: 'news',
        title: 'Nowosc',
        body: 'Test',
        level: 'info',
        date: '1970-01-01T00:00:00.000Z',
        link: null,
        expiresAt: null
      }
    ]);
  });
});
