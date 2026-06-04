'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const filesDir = path.join(rootDir, 'files');
const backgroundsDir = path.join(rootDir, 'backgrounds');
const manifestFile = path.join(rootDir, 'manifest.json');

async function main() {
  await fs.mkdir(filesDir, { recursive: true });
  await fs.mkdir(backgroundsDir, { recursive: true });
  const files = await buildEntries(filesDir);
  const backgrounds = await buildEntries(backgroundsDir);

  files.sort((a, b) => a.path.localeCompare(b.path));
  backgrounds.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    version: new Date().toISOString().replace(/[-:]/g, '').slice(0, 15),
    generatedAt: new Date().toISOString(),
    files,
    backgrounds
  };

  await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Generated ${manifestFile} with ${files.length} file(s) and ${backgrounds.length} background(s).`);
}

async function buildEntries(root) {
  const files = await walk(root);

  return Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(file);
      const relative = normalize(path.relative(root, file));

      return {
        name: path.basename(file),
        path: relative,
        size: stat.size,
        sha256: await sha256File(file)
      };
    })
  );
}

async function walk(root) {
  const output = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walk(absolute)));
    } else if (entry.isFile()) {
      output.push(absolute);
    }
  }

  return output;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function normalize(relative) {
  return relative.replaceAll(path.sep, '/');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
