import fs from 'node:fs/promises';

const tag = process.env.GITHUB_REF_NAME || '';
const version = tag.replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Tag ${tag} is not a supported semver version.`);
}

await updateJson('package.json', (json) => {
  json.version = version;
});

await updateJson('launcher/package.json', (json) => {
  json.version = version;
});

await updateJson('launcher/package-lock.json', (json) => {
  json.version = version;
  if (json.packages?.['']) {
    json.packages[''].version = version;
  }
});

await fs.appendFile(process.env.GITHUB_ENV, `DWARGONMC_RELEASE_VERSION=${version}\n`, 'utf8');
console.log(`Release version applied from ${tag}: ${version}`);

async function updateJson(file, mutate) {
  const raw = await fs.readFile(file, 'utf8');
  const json = JSON.parse(raw);
  mutate(json);
  await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}
