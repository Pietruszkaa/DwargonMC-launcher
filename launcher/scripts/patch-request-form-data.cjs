const fs = require('node:fs');
const path = require('node:path');

const candidates = [
  // standardowo, gdy instalujesz zależności w launcher/
  path.join(__dirname, '..', 'node_modules', 'request', 'package.json'),

  // gdy npm/workspaces hoistują zależności do root repo
  path.join(__dirname, '..', '..', 'node_modules', 'request', 'package.json'),
];

let patched = false;

for (const requestPackage of candidates) {
  if (!fs.existsSync(requestPackage)) {
    continue;
  }

  const data = JSON.parse(fs.readFileSync(requestPackage, 'utf8'));

  data.dependencies = {
    ...data.dependencies,
    'form-data': '2.5.5',
  };

  fs.writeFileSync(requestPackage, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Patched request dependency form-data to 2.5.5: ${requestPackage}`);

  patched = true;
}

if (!patched) {
  console.warn('request/package.json was not found. Nothing patched.');
}
