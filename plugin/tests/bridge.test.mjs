import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

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
  const levels = async () => (await fetch(new URL('../../levels', url))).json();
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
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(page.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(new URL('/levels', first.url))).status, 404);
  assert.equal((await fetch(new URL('../index.html', first.url))).status, 404);
  assert.equal((await fetch(new URL('../../levels', first.url), { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(new URL('../../levels', first.url), { method: 'POST' })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = http.get(new URL('../../levels', first.url), { headers: { Host: 'example.com' } }, res => {
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
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  assert.equal(await page.frameLocator('#scene-frame').locator('canvas').count() >= 2, true, 'ASCII renderer must create its output');
  await page.screenshot({ path: fileURLToPath(new URL('../build/preview.png', import.meta.url)) });
  await page.selectOption('#scene', 'cityscape');
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'cityscape');
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

test('mappings change real parameters, disable cleanly, and survive scene changes and export/import', { timeout: 60000 }, async t => {
  const { chromium } = await import('@playwright/test');
  const live = await fixture(t);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(live.url);
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  await page.click('#clear-mappings');
  await page.click('#add-mapping');
  await page.getByLabel('Input signal', { exact: true }).selectOption('bass');
  await page.getByLabel('Resting value', { exact: true }).fill('10');
  await page.getByLabel('Resting value', { exact: true }).press('Tab');
  async function slide(label, value) {
    await page.getByLabel(label, { exact: true }).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  }
  await slide('Smoothing', '0');
  await slide('Amount', '0.2');
  await page.waitForFunction(() => window.asciiIfyHost.current.app.ascii.layers[0].get('fontSize') > 14);
  assert.equal(await page.evaluate(() => window.asciiIfyHost.current.app.ascii.layers[0].getAutomation('fontSize').routes.length), 1);
  assert.equal(await page.evaluate(() => window.asciiIfyHost.current.app.ascii.layers[1].get('fontSize')), 4);
  await page.uncheck('#react-enabled');
  await page.waitForFunction(() => Math.abs(window.asciiIfyHost.current.app.ascii.layers[0].get('fontSize') - 10) < 0.01);
  await page.check('#react-enabled');
  await slide('Amount', '-0.1');
  await page.waitForFunction(() => window.asciiIfyHost.current.app.ascii.layers[0].get('fontSize') < 8);
  await page.getByLabel('Response curve', { exact: true }).selectOption('exp');
  await page.selectOption('#scene', 'cityscape');
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'cityscape');
  await page.selectOption('#scene', 'galaxy');
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  assert.equal(await page.locator('.route').count(), 1);
  assert.equal(await page.getByLabel('Amount', { exact: true }).inputValue(), '-0.1');
  assert.equal(await page.getByLabel('Response curve', { exact: true }).inputValue(), 'exp');
  assert.equal(await page.getByLabel('Resting value', { exact: true }).inputValue(), '10');
  await page.reload();
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  assert.equal(await page.getByLabel('Amount', { exact: true }).inputValue(), '-0.1');
  const downloaded = page.waitForEvent('download');
  await page.click('#export-mappings');
  const file = await downloaded;
  const exported = await readFile(await file.path());
  assert.equal(JSON.parse(exported).patches.galaxy.routes[0].depth, -0.1);
  await page.click('#clear-mappings');
  assert.equal(await page.locator('.route').count(), 0);
  await page.locator('#import-mappings').setInputFiles({ name: 'mappings.json', mimeType: 'application/json', buffer: exported });
  await page.waitForFunction(() => window.asciiIfyHost.current?.rx.routes.length === 1);
  assert.equal(await page.getByLabel('Amount', { exact: true }).inputValue(), '-0.1');
  await page.locator('#import-mappings').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  assert.match(await page.locator('#mapping-note').textContent(), /Not an ASCII/);
  assert.equal(await page.locator('.route').count(), 1);
  await page.getByLabel('Remove mapping', { exact: true }).click();
  await page.waitForFunction(() => Math.abs(window.asciiIfyHost.current.app.ascii.layers[0].get('fontSize') - 10) < 0.01);
  await page.click('#add-mapping');
  await page.getByLabel('Visual parameter', { exact: true }).selectOption('scene.brightness');
  await page.getByLabel('Resting value', { exact: true }).fill('0.5');
  await page.getByLabel('Resting value', { exact: true }).press('Tab');
  await slide('Smoothing', '0');
  await slide('Amount', '0.3');
  await page.waitForFunction(() => window.asciiIfyHost.current.app.scene.effective('brightness') > 0.7);
  await page.click('#clear-mappings');
  assert.equal(await page.evaluate(() => window.asciiIfyHost.current.app.scene.effective('brightness')), 0.5);
  assert.deepEqual(errors, []);
});

test('all-layer mappings preserve mixed bases, export/import, and coexist with individual mappings', { timeout: 60000 }, async t => {
  const { chromium } = await import('@playwright/test');
  const live = await fixture(t);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(live.url);
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  await page.click('#clear-mappings');
  const bases = await page.evaluate(() => window.asciiIfyHost.current.app.ascii.layers.map(l => l.get('fontSize')));
  await page.click('#add-mapping');
  await page.getByLabel('Visual parameter', { exact: true }).selectOption('layer.all.fontSize');
  assert.equal(await page.getByLabel('Resting value', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Resting value', { exact: true }).getAttribute('placeholder'), 'Mixed');
  await page.waitForFunction(bases => window.asciiIfyHost.current.app.ascii.layers.every((l, i) => l.get('fontSize') > bases[i] + 1), bases);
  const download = page.waitForEvent('download');
  await page.click('#export-mappings');
  const exported = await readFile(await (await download).path());
  const patch = JSON.parse(exported).patches.galaxy;
  assert.equal(patch.routes[0].target, 'layer.all.fontSize');
  assert.deepEqual(bases.map((_, i) => patch.bases[`layer.${i}.fontSize`]), bases);
  await page.click('#add-mapping');
  // The new individual mapping uses the same input as the All layers mapping.
  await page.waitForFunction(() => window.asciiIfyHost.current.app.ascii.layers[0].getAutomation('fontSize').routes.length === 2);
  await page.getByLabel('Remove mapping', { exact: true }).first().click();
  await page.waitForFunction(bases => {
    const layers = window.asciiIfyHost.current.app.ascii.layers;
    return layers[0].get('fontSize') > bases[0] + 1 && layers.slice(1).every((l, i) => l.get('fontSize') === bases[i + 1]);
  }, bases);
  await page.locator('#import-mappings').setInputFiles({ name: 'all-layers.json', mimeType: 'application/json', buffer: exported });
  await page.waitForFunction(() => window.asciiIfyHost.current?.rx.routes[0]?.target === 'layer.all.fontSize');
  await page.uncheck('#react-enabled');
  await page.waitForFunction(bases => window.asciiIfyHost.current.app.ascii.layers.every((l, i) => l.get('fontSize') === bases[i]), bases);
  await page.getByLabel('Resting value', { exact: true }).fill('12');
  await page.getByLabel('Resting value', { exact: true }).press('Tab');
  await page.waitForFunction(() => window.asciiIfyHost.current.app.ascii.layers.every(l => l.get('fontSize') === 12));
  await page.selectOption('#scene', 'cityscape');
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'cityscape');
  await page.selectOption('#scene', 'galaxy');
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  assert.equal(await page.getByLabel('Visual parameter', { exact: true }).inputValue(), 'layer.all.fontSize');
  assert.equal(await page.getByLabel('Resting value', { exact: true }).inputValue(), '12');
  assert.deepEqual(errors, []);
});

test('every bundled scene renders with live mapping controls', { timeout: 180000 }, async t => {
  const { chromium } = await import('@playwright/test');
  const live = await fixture(t);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(live.url);
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  const scenes = await page.locator('#scene option').evaluateAll(options => options.map(o => o.value));
  assert.equal(scenes.length, 54);
  for (const id of scenes) {
    await page.selectOption('#scene', id);
    await page.waitForFunction(id => window.asciiIfyHost.current?.id === id && window.asciiIfyHost.current.app.ascii._time > 0.03, id).catch(error => {
      t.diagnostic(`${id}: ${errors.join('; ')}`); throw error;
    });
    assert.ok(await page.locator('.route').count() > 0, `${id} has editable mappings`);
    assert.equal(await page.frameLocator('#scene-frame').locator('#audio-dock').count(), 0, `${id} uses plugin audio only`);
    assert.deepEqual(errors, [], `${id} rendered without exceptions`);
  }
  t.diagnostic(`Rendered ${scenes.length} bundled scenes`);
  // Tall windows put blossom branches off the left edge: their palette indices must wrap.
  await page.setViewportSize({ width: 375, height: 900 });
  await page.selectOption('#scene', 'cherry-blossoms');
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'cherry-blossoms' && window.asciiIfyHost.current.app.ascii._time > 0.1);
  assert.deepEqual(errors, []);
  // Shared boilerplate still supports the original standalone audio examples.
  await page.goto(new URL('../../examples/galaxy.html?audio', live.url).href);
  await page.locator('#audio-dock').waitFor();
  assert.equal(await page.locator('#scene-frame').count(), 0);
  assert.deepEqual(errors, []);
});
