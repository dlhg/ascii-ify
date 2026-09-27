import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSetup, defaultRoutes } from '../web/mappings.js';

const route = { source: 'link/Live/Kick%20Drum/kick', target: 'fontSize', depth: -0.2, smooth: 0.1, curve: 'exp', enabled: true, bipolar: false };
const setup = () => ({ version: 2, scene: 'galaxy', patches: { galaxy: { routes: [{ ...route }], bases: { fontSize: 10 }, intensity: 1.5, enabled: false } } });
test('export/import preserves disabled mappings, reverse response and resting values', () => {
  assert.deepEqual(cleanSetup(JSON.parse(JSON.stringify(setup())), ['galaxy']), setup());
});
test('invalid imports are rejected before changing the active mappings', () => {
  for (const change of [
    s => { s.scene = 'missing'; },
    s => { s.patches.galaxy.routes[0].source = 'kick'; },
    s => { s.patches.galaxy.routes[0].source = 'link/Live/Drums/centroid'; },
    s => { s.patches.galaxy.routes[0].source = 'link/Live/%E0%A4%A/kick'; },
    s => { s.patches.galaxy.routes[0].depth = NaN; },
    s => { s.patches.galaxy.routes[0].target = '__proto__'; },
    s => { s.patches.galaxy.routes.push({ ...route }); },
    s => { s.patches.galaxy.intensity = -1; },
    s => { s.patches.galaxy.bases.fontSize = Infinity; },
    s => { s.version = 3; },
  ]) {
    const value = setup(); change(value);
    assert.throws(() => cleanSetup(value, ['galaxy']));
  }
});
test('version 1 files move to this device’s track', () => {
  const old = setup();
  old.version = 1;
  old.patches.galaxy.routes[0].source = 'bass';
  const clean = cleanSetup(old, ['galaxy']);
  assert.equal(clean.version, 2);
  assert.equal(clean.patches.galaxy.routes[0].source, 'plugin/*/bass');
  old.patches.galaxy.routes[0].source = 'plugin/*/bass';
  assert.throws(() => cleanSetup(old, ['galaxy']), 'v1 files could not name tracks');
});
test('old song signals load as timed signals', () => {
  const old = setup();
  old.patches.galaxy.routes[0].source = 'song/bar';
  assert.equal(cleanSetup(old, ['galaxy']).patches.galaxy.routes[0].source, 'song/ramp/1/bar/1');
  old.patches.galaxy.routes.push({ ...route, source: 'song/ramp/1/bar/1' });
  assert.throws(() => cleanSetup(old, ['galaxy']), 'a migrated key still counts as a duplicate');
});
test('scene presets use this device’s track and only signals the plugin measures', () => {
  assert.deepEqual(defaultRoutes([{ source: 'kick', target: 'crtGlow' }, { source: 'centroid', target: 'scene.hue' },
    { source: 'lowmid', target: 'fontSize' }, { source: 'mid', target: 'fontSize' }]),
  [{ source: 'plugin/*/kick', target: 'crtGlow' }, { source: 'plugin/*/mid', target: 'fontSize' }]);
  assert.ok(defaultRoutes([]).length);
});
