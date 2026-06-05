import { describe, expect, it } from 'vitest';
import { searchFacets } from '../../electron/main/modrinth';

describe('Modrinth helpers', () => {
  it('filters mods to Minecraft 1.21.1, NeoForge and client-side safe projects', () => {
    expect(searchFacets('mod')).toEqual([
      ['project_type:mod'],
      ['versions:1.21.1'],
      ['categories:neoforge'],
      ['client_side:required', 'client_side:optional'],
      ['server_side:unsupported', 'server_side:optional']
    ]);
  });

  it('filters resource packs by Minecraft version and minecraft category', () => {
    expect(searchFacets('resourcepack')).toEqual([
      ['project_type:resourcepack'],
      ['versions:1.21.1'],
      ['categories:minecraft']
    ]);
  });

  it('filters shaders by Minecraft version only', () => {
    expect(searchFacets('shader')).toEqual([
      ['project_type:shader'],
      ['versions:1.21.1']
    ]);
  });
});
