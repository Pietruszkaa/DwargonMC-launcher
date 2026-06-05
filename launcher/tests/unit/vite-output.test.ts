import { describe, expect, it } from 'vitest';
import config from '../../vite.config';

describe('vite electron output', () => {
  it('uses relative renderer assets so Electron loadFile works', () => {
    expect(config).toMatchObject({
      base: './'
    });
  });
});
