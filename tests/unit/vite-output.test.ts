import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('vite electron output', () => {
  it('uses relative renderer assets so Electron loadFile works', async () => {
    const html = await fs.readFile(path.join(process.cwd(), 'dist', 'index.html'), 'utf8');

    expect(html).not.toContain('src="/assets/');
    expect(html).not.toContain('href="/assets/');
    expect(html).toContain('src="./assets/');
    expect(html).toContain('href="./assets/');
  });
});
