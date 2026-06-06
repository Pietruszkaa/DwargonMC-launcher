const fs = require('node:fs');
const path = require('node:path');

const requestPackage = path.join(__dirname, '..', 'node_modules', 'request', 'package.json');

if (!fs.existsSync(requestPackage)) {
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(requestPackage, 'utf8'));
data.dependencies = {
  ...data.dependencies,
  'form-data': '2.5.5'
};

fs.writeFileSync(requestPackage, `${JSON.stringify(data, null, 2)}\n`);
console.log('Patched request dependency form-data to 2.5.5 for electron-builder.');
