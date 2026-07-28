const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function requireText(source, expected, file) {
  if (!source.includes(expected)) {
    throw new Error(`${file} is missing required workflow contract: ${expected}`);
  }
}

function forbidText(source, forbidden, file) {
  if (source.includes(forbidden)) {
    throw new Error(`${file} contains forbidden workflow contract: ${forbidden}`);
  }
}

const pagesFile = '.github/workflows/pages.yml';
const monitorFile = '.github/workflows/pages-monitor.yml';
const pages = read(pagesFile);
const monitor = read(monitorFile);

[
  'pull_request:',
  'branches: [main]',
  'npm run verify',
  'npm run build',
  'npm run check:dist',
  'actions/checkout@v6',
  'actions/setup-node@v6',
  'node-version: 20.19.0',
  'actions/configure-pages@v5',
  'actions/upload-pages-artifact@v4',
  'path: dist',
  'actions/deploy-pages@v4',
  'pages: write',
  'id-token: write',
  "if: github.event_name != 'pull_request'",
  'node scripts/smoke-deployment.js',
].forEach((expected) => requireText(pages, expected, pagesFile));

[
  'schedule:',
  'cron: "17 * * * *"',
  'workflow_dispatch:',
  'actions/checkout@v6',
  'actions/setup-node@v6',
  'node-version: 20.19.0',
  'https://xuhangc897-arch.github.io/brain-ai-platform/',
  'node scripts/smoke-deployment.js',
].forEach((expected) => requireText(monitor, expected, monitorFile));

for (const [file, source] of [
  [pagesFile, pages],
  [monitorFile, monitor],
]) {
  forbidText(source, 'pull_request_target:', file);
  forbidText(source, 'permissions: write-all', file);
}

console.log('GitHub workflow contracts passed.');
