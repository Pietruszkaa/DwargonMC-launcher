const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(appRoot, '..');

function resolveElectronDir() {
  const candidates = [
    path.join(appRoot, 'node_modules', 'electron'),
    path.join(workspaceRoot, 'node_modules', 'electron'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  try {
    const packageJson = require.resolve('electron/package.json', {
      paths: [appRoot, workspaceRoot],
    });

    return path.dirname(packageJson);
  } catch {
    console.error('Electron package.json not found.');
    console.error('Checked:');
    for (const candidate of candidates) {
      console.error(`- ${candidate}`);
    }
    process.exit(1);
  }
}

const electronDir = resolveElectronDir();
const { version } = require(path.join(electronDir, 'package.json'));
const distDir = path.join(electronDir, 'dist');
const pathFile = path.join(electronDir, 'path.txt');

function platformPath() {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe';
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    default:
      return 'electron';
  }
}

function binaryReady() {
  const executable = platformPath();

  return (
    fs.existsSync(pathFile) &&
    fs.readFileSync(pathFile, 'utf8').trim() === executable &&
    fs.existsSync(path.join(distDir, executable))
  );
}

function findCachedZip(dir, zipName) {
  if (!fs.existsSync(dir)) return null;

  const direct = path.join(dir, zipName);
  if (fs.existsSync(direct)) return direct;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = findCachedZip(fullPath, zipName);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === zipName) {
      return fullPath;
    }
  }

  return null;
}

function extractZipSync(zipPath) {
  const executable = platformPath();

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  if (process.platform === 'win32') {
    const destination = distDir.replace(/'/g, "''");
    const archive = zipPath.replace(/'/g, "''");

    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destination}' -Force`,
      ],
      { stdio: 'inherit' },
    );

    if (result.status !== 0) {
      throw new Error('Expand-Archive failed while extracting Electron.');
    }
  } else {
    const result = spawnSync('unzip', ['-q', '-o', zipPath, '-d', distDir], {
      stdio: 'inherit',
    });

    if (result.status !== 0) {
      throw new Error('unzip failed while extracting Electron.');
    }
  }

  fs.writeFileSync(pathFile, executable, 'utf8');

  if (!binaryReady()) {
    throw new Error(`Electron archive extracted, but ${executable} is still missing.`);
  }
}

function main() {
  console.log(`Using Electron from: ${electronDir}`);

  if (binaryReady()) return;

  const installScript = path.join(electronDir, 'install.js');

  const install = spawnSync(process.execPath, [installScript], {
    cwd: appRoot,
    stdio: 'inherit',
  });

  if (binaryReady()) {
    process.exit(install.status ?? 0);
  }

  const zipName = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  const cacheRoot = process.env.electron_config_cache || path.join(os.homedir(), '.cache', 'electron');
  const zipPath = findCachedZip(cacheRoot, zipName);

  if (!zipPath) {
    console.error(`Electron binary is missing and ${zipName} was not found under ${cacheRoot}.`);
    process.exit(1);
  }

  console.log(`Extracting Electron from cache: ${zipPath}`);
  extractZipSync(zipPath);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
}
