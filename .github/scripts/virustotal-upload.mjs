import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.VIRUSTOTAL_API_KEY;
const filePath = process.env.DWARGONMC_RELEASE_EXE;
const outputFile = process.env.VIRUSTOTAL_NOTES_FILE || 'launcher/release/VIRUSTOTAL.md';

if (!apiKey) {
  console.log('VirusTotal scan skipped: VIRUSTOTAL_API_KEY secret is not configured.');
  process.exit(0);
}

if (!filePath) {
  throw new Error('DWARGONMC_RELEASE_EXE is not set.');
}

const fileBuffer = await fs.readFile(filePath);
const fileName = path.basename(filePath);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
const uploadUrl = await getUploadUrl(apiKey);
const analysisId = await uploadFile(apiKey, uploadUrl, fileName, fileBuffer);
const fileUrl = `https://www.virustotal.com/gui/file/${sha256}`;

await writeNotes(
  [
    '## VirusTotal',
    '',
    `- Plik: \`${fileName}\``,
    `- SHA256: \`${sha256}\``,
    `- Raport: ${fileUrl}`,
    `- Analysis ID: \`${analysisId}\``,
    '',
    'Raport moze byc przetwarzany jeszcze przez chwile po publikacji release.',
    ''
  ].join('\n')
);

console.log(`VirusTotal report: ${fileUrl}`);

async function getUploadUrl(key) {
  const response = await fetch('https://www.virustotal.com/api/v3/files/upload_url', {
    headers: {
      'x-apikey': key
    }
  });

  if (!response.ok) {
    throw new Error(`VirusTotal upload_url failed: HTTP ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  if (typeof payload.data !== 'string') {
    throw new Error('VirusTotal upload_url response did not contain data URL.');
  }

  return payload.data;
}

async function uploadFile(key, url, name, buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), name);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-apikey': key
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`VirusTotal file upload failed: HTTP ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const analysisId = payload?.data?.id;
  if (typeof analysisId !== 'string') {
    throw new Error('VirusTotal file upload response did not contain analysis id.');
  }

  return analysisId;
}

async function writeNotes(content) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, content, 'utf8');
}
