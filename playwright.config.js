import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const currentPort = Number(process.env.ASCIIIFY_CURRENT_PORT || 5174);
const baselinePort = Number(process.env.ASCIIIFY_BASELINE_PORT || 5175);
const baselineDir = process.env.ASCIIIFY_BASELINE_DIR;

function q(value) {
  return JSON.stringify(value);
}

const webServer = [
  {
    command: `${q(process.execPath)} ${q(viteBin)} --host 127.0.0.1 --port ${currentPort}`,
    url: `http://127.0.0.1:${currentPort}/tests/fixtures/perf-bench.html`,
    cwd: root,
    reuseExistingServer: false,
    timeout: 120_000,
  },
];

if (baselineDir) {
  webServer.push({
    command: `${q(process.execPath)} ${q(viteBin)} --host 127.0.0.1 --port ${baselinePort}`,
    url: `http://127.0.0.1:${baselinePort}/src/index.js`,
    cwd: baselineDir,
    reuseExistingServer: false,
    timeout: 120_000,
  });
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
  },
  webServer,
});
