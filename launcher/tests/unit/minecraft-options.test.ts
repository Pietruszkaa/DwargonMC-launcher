import { describe, expect, it } from 'vitest';
import { parseOptions } from '../../electron/main/minecraftOptions';

describe('Minecraft options parser', () => {
  it('parses safe options and preserves values with colons', () => {
    const parsed = parseOptions('renderDistance:12\nbad key:value\nresourcePacks:[\"vanilla\"]\n');

    expect(parsed.values).toEqual({
      renderDistance: '12',
      resourcePacks: '[\"vanilla\"]'
    });
  });
});
