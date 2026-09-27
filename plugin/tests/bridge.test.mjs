import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const directory = fileURLToPath(new URL('../build/native/VST3/Release/ASCII Visuals.vst3', import.meta.url));
const executable = fileURLToPath(new URL('../build/native/bin/Release/ascii-bridge-fixture', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t) {
  const child = spawn(executable, [directory], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.stdin.write('q');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited;
    clearTimeout(timeout);
  });
  const lines = createInterface({ input: child.stdout });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture startup timed out')), 5000);
    lines.once('line', line => { clearTimeout(timeout); resolve(line); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(stderr || 'Fixture exited')); });
  });
  const levels = async () => (await fetch(new URL('levels', url))).json();
  return { child, url, levels, command: text => child.stdin.write(text) };
}

test('real native bridge serves bundled visuals, isolates instances and handles audio lifecycle', { timeout: 20000 }, async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  assert.notEqual(new URL(first.url).port, new URL(second.url).port);
  await first.levels();
  await delay(100);
  const bass = await first.levels();
  assert.equal(bass.active, true);
  assert.ok(bass.bass > bass.high * 4);
  const page = await fetch(first.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ASCII Visuals/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(new URL('/levels', first.url))).status, 404);
  assert.equal((await fetch(new URL('../index.html', first.url))).status, 404);
  assert.equal((await fetch(new URL('levels', first.url), { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(new URL('levels', first.url), { method: 'POST' })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = http.get(new URL('levels', first.url), { headers: { Host: 'example.com' } }, res => {
      res.resume(); resolve(res.statusCode);
    });
    req.on('error', reject);
  });
  assert.equal(wrongHost, 403);
  first.command('b');
  await delay(80);
  assert.equal((await first.levels()).bypass, true);
  assert.equal((await first.levels()).bass, 0);
  assert.equal((await second.levels()).bypass, false);
  first.command('r');
  await delay(80);
  assert.equal((await first.levels()).active, true);
  first.command('p');
  await delay(50);
  await first.levels();
  await delay(450);
  const stale = await first.levels();
  assert.equal(stale.active, false);
  assert.equal(stale.rms, 0);
  first.command('r');
  await delay(80);
  assert.equal((await first.levels()).active, true);
});

test('browser renders the native audio stream and reports disconnects', { timeout: 30000 }, async t => {
  const { chromium } = await import('@playwright/test');
  const live = await fixture(t);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); t.diagnostic(error.message); });
  await page.goto(live.url);
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'live').catch(async error => {
    t.diagnostic(await page.locator('#status').textContent());
    await page.screenshot({ path: fileURLToPath(new URL('../build/preview.png', import.meta.url)) });
    throw error;
  });
  await page.waitForFunction(() => document.querySelector('#bass').value > 0.5);
  assert.equal(await page.locator('canvas').count() >= 2, true, 'ASCII renderer must create its output');
  await page.screenshot({ path: fileURLToPath(new URL('../build/preview.png', import.meta.url)) });
  await page.selectOption('#scene', 'bars');
  live.command('h');
  await page.waitForFunction(() => document.querySelector('#high').value > 0.5 && document.querySelector('#bass').value < 0.3);
  await page.click('#hide');
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('hidden')), true);
  await page.keyboard.press('h');
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('hidden')), false);
  live.command('b');
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'bypass');
  live.command('r');
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'live');
  live.command('s');
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'silent');
  const exited = once(live.child, 'exit');
  live.command('q');
  await exited;
  await page.waitForFunction(() => document.querySelector('#status').dataset.state === 'disconnected');
  await page.waitForFunction(() => document.querySelector('#bass').value === 0);
  assert.equal(await page.locator('#bass').evaluate(el => el.value), 0);
  assert.deepEqual(errors, []);
});
