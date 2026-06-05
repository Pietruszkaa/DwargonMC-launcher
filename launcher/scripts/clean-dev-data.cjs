const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'minecraft'),
  path.join(root, 'launcher-data')
];

async function removeTarget(target) {
  await fs.rm(target, { recursive: true, force: true });
  console.log(`removed ${path.relative(root, target)}`);
}

async function main() {
  await Promise.all(targets.map(removeTarget));
  console.log('dev data cleaned');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
