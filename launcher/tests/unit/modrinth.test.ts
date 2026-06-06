import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildLauncherPaths } from '../../electron/main/paths';
import { addonSlugFromFileName, fileLooksLikeProject, listInstalledModrinthProjects, installModrinthProject, searchFacets } from '../../electron/main/modrinth';
import { listPlayerAddonFiles } from '../../electron/main/sync';

const minecraft = {
  address: 'play.example.com',
  version: '1.21.1',
  loader: 'neoforge' as const,
  loaderVersion: null
};

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

afterEach(() => {
  vi.clearAllMocks();
});

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

  it('does not download an addon when the target file already exists', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-modrinth-install-'));
    const paths = buildLauncherPaths(root, root);
    await fs.mkdir(path.join(paths.minecraftDir, 'resourcepacks'), { recursive: true });
    await fs.writeFile(path.join(paths.minecraftDir, 'resourcepacks', 'pack.zip'), 'installed');

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        {
          project_id: 'pack-project',
          version_number: '1.0.0',
          version_type: 'release',
          status: 'listed',
          files: [
            {
              url: 'https://cdn.modrinth.test/pack.zip',
              filename: 'pack.zip',
              primary: true,
              hashes: {
                sha512: 'unused'
              }
            }
          ]
        }
      ]
    });

    await expect(
      installModrinthProject(paths, { projectId: 'pack-project', projectType: 'resourcepack' }, 'test', minecraft)
    ).resolves.toMatchObject({
      installed: false,
      fileName: 'pack.zip'
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('maps local addon filenames to installed Modrinth projects without API calls', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-modrinth-installed-'));
    const paths = buildLauncherPaths(root, root);
    await fs.mkdir(path.join(paths.minecraftDir, 'resourcepacks'), { recursive: true });
    await fs.writeFile(path.join(paths.minecraftDir, 'resourcepacks', 'pack.zip'), 'installed');

    const files = await listPlayerAddonFiles(paths.minecraftDir);

    expect(listInstalledModrinthProjects(files)).toEqual([
      {
        projectId: null,
        slug: 'pack',
        fileName: 'pack.zip',
        path: 'resourcepacks/pack.zip',
        kind: 'resourcepack',
        managed: false
      }
    ]);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('maps managed sync addon filenames to installed Modrinth projects', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-modrinth-managed-'));
    const paths = buildLauncherPaths(root, root);
    await fs.mkdir(path.join(paths.minecraftDir, 'mods'), { recursive: true });
    await fs.writeFile(path.join(paths.minecraftDir, 'mods', '_sodium-neoforge-0.6.13.jar'), 'managed sodium');

    const files = await listPlayerAddonFiles(paths.minecraftDir, { includeManaged: true });

    expect(listInstalledModrinthProjects(files)).toEqual([
      {
        projectId: null,
        slug: 'sodium',
        fileName: '_sodium-neoforge-0.6.13.jar',
        path: 'mods/_sodium-neoforge-0.6.13.jar',
        kind: 'mod',
        managed: true
      }
    ]);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('matches project slugs against managed filenames', () => {
    expect(addonSlugFromFileName('_sodium-neoforge-0.6.13+mc1.21.1.jar')).toBe('sodium');
    expect(fileLooksLikeProject('_sodium-neoforge-0.6.13+mc1.21.1.jar', 'sodium')).toBe(true);
  });

  it('does not download an addon when a managed sync file matches its slug', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dwargon-modrinth-install-managed-'));
    const paths = buildLauncherPaths(root, root);
    await fs.mkdir(path.join(paths.minecraftDir, 'mods'), { recursive: true });
    await fs.writeFile(path.join(paths.minecraftDir, 'mods', '_sodium-neoforge-0.6.13.jar'), 'managed sodium');

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        {
          project_id: 'sodium-project',
          version_number: '0.6.14',
          version_type: 'release',
          status: 'listed',
          files: [
            {
              url: 'https://cdn.modrinth.test/sodium-neoforge-0.6.14.jar',
              filename: 'sodium-neoforge-0.6.14.jar',
              primary: true,
              hashes: {
                sha512: 'unused'
              }
            }
          ]
        }
      ]
    });

    await expect(
      installModrinthProject(paths, { projectId: 'sodium-project', projectType: 'mod', slug: 'sodium' }, 'test', minecraft)
    ).resolves.toMatchObject({
      installed: false,
      fileName: 'sodium-neoforge-0.6.14.jar'
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
