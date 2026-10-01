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
const senderExecutable = fileURLToPath(new URL('../build/native/bin/Release/ascii-link-sender', import.meta.url));
const { version: pluginVersion } = JSON.parse(await readFile(new URL('../version.json', import.meta.url), 'utf8'));
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
  // The device's own track: { live, bypass, values: [rms, bass, mid, high, kick, snare, hat] }.
  const levels = async () => (await (await fetch(new URL('../../signals', url))).json()).sources.find(s => s.kind === 'local');
  return { child, url, levels, command: text => child.stdin.write(text) };
}
// A Link Audio peer standing in for Live, publishing "Kick Drum" (60 Hz bursts),
// "Hats" (8 kHz) and "Pad \"Wide\"" under a unique peer name.
async function sender(t) {
  const peer = `ASCII Test Live ${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
  const child = spawn(senderExecutable, [peer], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.stdin.write('q');
    await exited;
  });
  await new Promise((resolve, reject) => {
    createInterface({ input: child.stdout }).once('line', resolve);
    child.once('exit', () => reject(new Error('Sender exited')));
  });
  return peer;
}
// Choose from a picker opened by the button with this accessible label.
async function pick(page, label, group, item) {
  await page.getByLabel(label, { exact: true }).last().click();
  const sheet = page.locator('.picker');
  const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  if (group) await sheet.locator('.picker-group').filter({ has: page.locator('.picker-name', { hasText: exact(group) }) }).first().click();
  await sheet.locator('.picker-item').filter({ has: page.locator('.picker-name', { hasText: exact(item) }) }).first().click();
  await sheet.waitFor({ state: 'detached' });
}

test('real native bridge serves bundled visuals, isolates instances and handles audio lifecycle', { timeout: 20000 }, async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  assert.notEqual(new URL(first.url).port, new URL(second.url).port);
  await first.levels();
  await delay(100);
  const bass = await first.levels();
  assert.equal(bass.live, true);
  assert.ok(bass.values[1] > bass.values[3] * 4);
  const page = await fetch(first.url);
  assert.equal(page.status, 200);
  assert.deepEqual(await (await fetch(new URL('../../info', first.url))).json(), { pluginVersion });
  assert.match(await page.text(), /ASCII Visuals/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(page.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(new URL('/signals', first.url))).status, 404);
  assert.equal((await fetch(new URL('../index.html', first.url))).status, 404);
  assert.equal((await fetch(new URL('../../signals', first.url), { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(new URL('../../signals', first.url), { method: 'POST' })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const req = http.get(new URL('../../signals', first.url), { headers: { Host: 'example.com' } }, res => {
      res.resume(); resolve(res.statusCode);
    });
    req.on('error', reject);
  });
  assert.equal(wrongHost, 403);
  first.command('b');
  await delay(80);
  assert.equal((await first.levels()).bypass, true);
  assert.equal((await first.levels()).values[1], 0);
  assert.equal((await second.levels()).bypass, false);
  first.command('r');
  await delay(80);
  assert.equal((await first.levels()).live, true);
  first.command('p');
  await delay(50);
  await first.levels();
  await delay(450);
  const stale = await first.levels();
  assert.equal(stale.live, false);
  assert.equal(stale.values[0], 0);
  first.command('r');
  await delay(80);
  assert.equal((await first.levels()).live, true);
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
  await page.waitForFunction(version => document.querySelector('#build-version').textContent === `Web v${version} · Plugin v${version}`, pluginVersion);
  assert.match(await page.locator('#build-version').getAttribute('title'), /Web build: \d{4}-\d{2}-\d{2}T/);
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
  await pick(page, 'Visual parameter', 'Layer 1', 'Glyph size');
  await pick(page, 'Input signal', null, 'Bass');
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
  await page.waitForFunction(() => document.querySelector('#mapping-note').textContent.includes('Not an ASCII'));
  assert.match(await page.locator('#mapping-note').textContent(), /Not an ASCII/);
  assert.equal(await page.locator('.route').count(), 1);
  await page.getByLabel('Remove mapping', { exact: true }).click();
  await page.waitForFunction(() => Math.abs(window.asciiIfyHost.current.app.ascii.layers[0].get('fontSize') - 10) < 0.01);
  await page.click('#add-mapping');
  await pick(page, 'Visual parameter', 'Scene look', 'Brightness');
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
  assert.equal(await page.getByLabel('Visual parameter', { exact: true }).textContent(), 'All layers · Glyph size');
  await page.getByLabel('Visual parameter', { exact: true }).click();
  await page.locator('.picker-search').fill('glyph size');
  const glyphSizes = (await page.locator('.picker-item .picker-name').allTextContents()).filter(n => n.endsWith('Glyph size'));
  assert.equal(glyphSizes[0], 'All layers · Glyph size');
  assert.ok(!glyphSizes.includes('Glyphs · Glyph size'), 'layered scenes hide the overridden global glyph size');
  await page.keyboard.press('Escape');
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
  await pick(page, 'Visual parameter', 'Layer 1', 'Glyph size');
  await pick(page, 'Input signal', null, 'Level');
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
  assert.equal(await page.getByLabel('Visual parameter', { exact: true }).textContent(), 'All layers · Glyph size');
  assert.equal(await page.getByLabel('Resting value', { exact: true }).inputValue(), '12');
  const oldSetup = { version: 1, scene: 'galaxy', patches: { galaxy: {
    routes: [{ target: 'fontSize', source: 'rms', depth: 0.1, smooth: 0, curve: 'linear', enabled: true, bipolar: false }],
    bases: { fontSize: 10 }, intensity: 1, enabled: true,
  } } };
  await page.locator('#import-mappings').setInputFiles({ name: 'old-mapping.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldSetup)) });
  await page.waitForFunction(() => {
    const session = window.asciiIfyHost.current;
    return session?.rx.routes[0]?.target === 'layer.all.fontSize' && session.app.ascii.layers.every(l => l.getAutomation('fontSize')?.base === 10 && l.get('fontSize') > 11);
  });
  assert.equal(await page.getByLabel('Visual parameter', { exact: true }).textContent(), 'All layers · Glyph size');
  assert.doesNotMatch(await page.locator('#routes').textContent(), /This scene uses layers/);
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
  assert.equal(scenes.length, 55);
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

test('any Live track shared over Link Audio can drive a parameter', { timeout: 60000 }, async t => {
  const { chromium } = await import('@playwright/test');
  const live = await fixture(t);
  const peer = await sender(t);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(live.url);
  await page.waitForFunction(() => window.asciiIfyHost.current?.id === 'galaxy');
  await page.click('#clear-mappings');
  await page.click('#add-mapping');
  await pick(page, 'Visual parameter', 'Scene look', 'Brightness');
  await page.getByLabel('Resting value', { exact: true }).fill('0.5');
  await page.getByLabel('Resting value', { exact: true }).press('Tab');
  await page.getByLabel('Amount', { exact: true }).evaluate(el => { el.value = '0.4'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.getByLabel('Smoothing', { exact: true }).evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });

  // The picker lists the peer's tracks, streams them while open, and names hits.
  await page.getByLabel('Input signal', { exact: true }).click();
  const sheet = page.locator('.picker');
  await sheet.locator('.picker-section', { hasText: `${peer} tracks` }).waitFor();
  await page.waitForFunction(() => /Live tracks? available over Link Audio/.test(document.querySelector('.picker-note').textContent));
  assert.deepEqual(await sheet.locator('.picker-group .picker-name').allTextContents().then(names => names.filter(n => ['Hats', 'Kick Drum', 'Pad "Wide"'].includes(n))),
    ['Hats', 'Kick Drum', 'Pad "Wide"']);
  await sheet.locator('.picker-group').filter({ hasText: 'Hats' }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('.picker-group')].some(g => g.textContent.includes('Hats') && g.querySelector('meter').value > 0.1),
    null, { timeout: 15000 });
  await sheet.locator('.picker-search').fill('kick drum kick');
  assert.equal(await sheet.locator('.picker-item .picker-name').first().textContent(), 'Kick Drum · Kick hits');
  await page.keyboard.press('Enter');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await page.getByLabel('Input signal', { exact: true }).textContent(), 'Kick Drum · Kick hits');
  const route = await page.evaluate(() => window.asciiIfyHost.current.rx.routes[0].source);
  assert.equal(route, `link/${encodeURIComponent(peer)}/Kick%20Drum/kick`);

  // Kick hits from that track now move the scene's brightness above its resting value.
  await page.waitForFunction(() => window.asciiIfyHost.current.app.scene.effective('brightness') > 0.8, null, { timeout: 15000 });
  // Tracks previewed in the picker stop streaming once no page asks for them (2 s).
  let signals;
  for (let i = 0; i < 40; i++) {
    signals = await (await fetch(new URL('../../signals', live.url))).json();
    if (!signals.sources.find(s => s.peer === peer && s.name === 'Pad "Wide"').subscribed) break;
    await delay(100);
  }
  assert.equal(signals.sources.find(s => s.peer === peer && s.name === 'Pad "Wide"').subscribed, false, 'unused tracks are not streamed');
  assert.equal(signals.sources.find(s => s.peer === peer && s.name === 'Kick Drum').subscribed, true);

  // Exported mappings name the track, not a session id, and group headers follow the input.
  await page.click('#add-mapping');
  await page.selectOption('#group-by', 'input');
  assert.deepEqual(await page.locator('.route-group').allTextContents(), ['Kick Drum', 'This device (Plugin track)']);
  const download = page.waitForEvent('download');
  await page.click('#export-mappings');
  const exported = JSON.parse(await readFile(await (await download).path()));
  assert.equal(exported.version, 2);
  assert.ok(exported.patches.galaxy.routes.some(r => r.source === route));
  assert.deepEqual(errors, []);
});
