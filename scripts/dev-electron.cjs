const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tsc = spawn('npx', ['tsc', '-p', 'tsconfig.electron.json', '--watch', '--preserveWatchOutput'], {
  cwd: root,
  shell: process.platform === 'win32',
  stdio: 'inherit'
});

let electronStarted = false;

setTimeout(() => {
  if (electronStarted) return;
  electronStarted = true;
  const child = spawn('npx', ['electron', '.'], {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173'
    }
  });

  child.on('exit', (code) => {
    tsc.kill();
    process.exit(code ?? 0);
  });
}, 2500);
