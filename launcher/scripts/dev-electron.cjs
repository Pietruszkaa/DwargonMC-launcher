const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const electronBin = path.join(root, 'node_modules', 'electron', 'cli.js');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const mainFile = path.join(root, 'dist-electron', 'main', 'main.js');
const devServerUrl = 'http://127.0.0.1:5173';

const tsc = spawn(process.execPath, [tscBin, '-p', 'tsconfig.electron.json', '--watch', '--preserveWatchOutput'], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe']
});

let electronStarted = false;
let tscHadError = false;
let viteReady = false;
let vite = null;

ensureVite();

tsc.stdout.on('data', (data) => {
  const text = data.toString();
  process.stdout.write(text);
  if (/Found \d+ errors?/.test(text)) tscHadError = !/Found 0 errors?/.test(text);
  if (!tscHadError && fs.existsSync(mainFile) && viteReady) startElectron();
});

tsc.stderr.on('data', (data) => {
  process.stderr.write(data);
});

tsc.on('exit', (code) => {
  if (!electronStarted) process.exit(code ?? 1);
});

const fallback = setInterval(() => {
  if (!tscHadError && fs.existsSync(mainFile) && viteReady) startElectron();
}, 500);

async function ensureVite() {
  if (await devServerResponds()) {
    viteReady = true;
    startElectron();
    return;
  }

  vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: root,
    stdio: 'inherit'
  });

  vite.on('exit', (code) => {
    if (!electronStarted) {
      tsc.kill();
      process.exit(code ?? 1);
    }
  });

  const wait = setInterval(async () => {
    if (!(await devServerResponds())) return;
    clearInterval(wait);
    viteReady = true;
    startElectron();
  }, 500);
}

function startElectron() {
  if (electronStarted) return;
  if (!viteReady || !fs.existsSync(mainFile) || tscHadError) return;
  electronStarted = true;
  clearInterval(fallback);

  const ensureElectron = spawnSync(process.execPath, [path.join(__dirname, 'ensure-electron.cjs')], {
    cwd: root,
    stdio: 'inherit'
  });
  if (ensureElectron.status !== 0) {
    tsc.kill();
    vite?.kill();
    process.exit(ensureElectron.status ?? 1);
  }

  const child = spawn(process.execPath, [electronBin, '.'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173'
    }
  });

  child.on('exit', (code) => {
    tsc.kill();
    vite?.kill();
    process.exit(code ?? 0);
  });
}

function devServerResponds() {
  return new Promise((resolve) => {
    const request = http.get(devServerUrl, (response) => {
      response.resume();
      resolve(true);
    });

    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}
