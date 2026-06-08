const fs = require('node:fs');
const path = require('node:path');

const candidates = [
  path.join(__dirname, '..', 'node_modules', 'request', 'package.json'),
  path.join(__dirname, '..', '..', 'node_modules', 'request', 'package.json'),
];

let patched = false;

for (const file of candidates) {
  console.log(`Checking: ${file}`);

  if (!fs.existsSync(file)) {
    console.log(`Not found: ${file}`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  data.dependencies = {
    ...data.dependencies,
    'form-data': '2.5.5',
  };

  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Patched request dependency form-data to 2.5.5: ${file}`);

  patched = true;
}

if (!patched) {
  console.error('Could not find request/package.json in launcher or root node_modules.');
  process.exit(1);
}
