import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSetup, defaultRoutes } from '../web/mappings.js';

const route = { source: 'bass', target: 'fontSize', depth: -0.2, smooth: 0.1, curve: 'exp', enabled: true, bipolar: false };
const setup = () => ({ version: 1, scene: 'galaxy', patches: { galaxy: { routes: [{ ...route }], bases: { fontSize: 10 }, intensity: 1.5, enabled: false } } });
test('export/import preserves disabled mappings, reverse response and resting values', () => {
  assert.deepEqual(cleanSetup(JSON.parse(JSON.stringify(setup())), ['galaxy']), setup());
});
test('invalid imports are rejected before changing the active mappings', () => {
  for (const change of [
    s => { s.scene = 'missing'; },
    s => { s.patches.galaxy.routes[0].source = 'kick'; },
    s => { s.patches.galaxy.routes[0].depth = NaN; },
    s => { s.patches.galaxy.routes[0].target = '__proto__'; },
    s => { s.patches.galaxy.routes.push({ ...route }); },
    s => { s.patches.galaxy.intensity = -1; },
    s => { s.patches.galaxy.bases.fontSize = Infinity; },
  ]) {
    const value = setup(); change(value);
    assert.throws(() => cleanSetup(value, ['galaxy']));
  }
});
test('scene presets use only signals delivered by the plugin', () => {
  assert.deepEqual(defaultRoutes([{ source: 'kick' }, { source: 'bass', target: 'fontSize' }]), [{ source: 'bass', target: 'fontSize' }]);
  assert.ok(defaultRoutes([]).length);
});
