import test from 'node:test';
import assert from 'node:assert/strict';
import { Layer } from '../../src/layer.js';
import { registerSignal } from '../../src/automation.js';
import { Reactivity } from '../../examples/audio-reactivity.js';
import { listTargets, baseTargets, routingEngine, targetInfo } from '../web/targets.js';
import { cleanPatch, patchForScene } from '../web/mappings.js';

test('layered scenes hide overridden globals and migrate old mappings without duplicates', () => {
  const ascii = { get: key => ({ fontSize: 16, density: 1, patternMix: 0, edgeThreshold: 0.15, fade: 0 })[key] };
  ascii.layers = [4, 10].map(fontSize => new Layer(ascii, { fontSize }));
  const choices = listTargets(ascii, null);
  for (const key of ['fontSize', 'density', 'patternMix', 'edgeThreshold']) {
    assert.ok(!choices.includes(key));
    assert.ok(choices.includes(`layer.all.${key}`));
  }
  assert.ok(choices.includes('fade'), 'global inherited fade remains available');
  const route = { target: 'fontSize', source: 'plugin/*/bass', depth: 0.1, smooth: 0, enabled: true, curve: 'linear', bipolar: false };
  const patch = { routes: [route], bases: { fontSize: 12, 'layer.1.fontSize': 9 }, enabled: true, intensity: 1 };
  const migrated = patchForScene(patch, ascii);
  assert.equal(migrated.routes[0].target, 'layer.all.fontSize');
  assert.deepEqual(migrated.bases, { 'layer.0.fontSize': 12, 'layer.1.fontSize': 9 });
  assert.deepEqual(cleanPatch(migrated), migrated);
  const explicit = { ...route, target: 'layer.all.fontSize', depth: 0.3 };
  const merged = patchForScene({ ...patch, routes: [route, explicit] }, ascii);
  assert.deepEqual(merged.routes, [explicit]);
  assert.deepEqual(patchForScene(migrated, ascii), migrated, 'migration is idempotent');
  ascii.layers = [];
  assert.ok(listTargets(ascii, null).includes('fontSize'));
  assert.deepEqual(patchForScene(patch, ascii), patch);
});

test('all-layer and individual routes sum independently and restore distinct resting values', () => {
  const ascii = { get: key => key === 'fade' ? 0 : undefined };
  ascii.layers = [4, 10, 16].map(fontSize => new Layer(ascii, { fontSize }));
  const stop = registerSignal('audio:bass', () => 1);
  const rx = new Reactivity({ ascii: routingEngine(ascii), audio: { value: () => 1 } });
  const values = () => { ascii.layers.forEach(l => l._applyAutomations(1)); return ascii.layers.map(l => l.get('fontSize')); };
  const close = expected => values().forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-8));
  try {
    const all = rx.addRoute({ target: 'layer.all.fontSize', source: 'bass', depth: 0.1, smooth: 0 });
    close([8.7, 14.7, 20.7]);
    const single = rx.addRoute({ target: 'layer.0.fontSize', source: 'bass', depth: 0.2, smooth: 0 });
    close([18.1, 14.7, 20.7]);
    rx.updateRoute(all.id, { depth: -0.05 });
    close([11.05, 7.65, 13.65]);
    rx.updateRoute(all.id, { enabled: false });
    close([13.4, 10, 16]);
    rx.updateRoute(all.id, { enabled: true });
    rx.removeRoute(single.id);
    close([1.65, 7.65, 13.65]);
    rx.setIntensity(0);
    close([4, 10, 16]);
    rx.load([]);
    close([4, 10, 16]);
    assert.ok(ascii.layers.every(l => l.getAutomation('fontSize') === null));
  } finally { stop(); }
});

test('all numeric layer properties are offered and exported bases retain each layer', () => {
  const ascii = { get: key => key === 'fade' ? 0.2 : undefined };
  ascii.layers = [4, 10].map(fontSize => new Layer(ascii, { fontSize }));
  const choices = listTargets(ascii, null);
  for (const key of ['fontSize', 'fontSizeSmoothing', 'density', 'fade', 'patternMix', 'edgeThreshold', 'opacity', 'offsetX', 'offsetY', 'zIndex']) {
    assert.ok(choices.includes(`layer.all.${key}`));
    assert.ok(choices.includes(`layer.0.${key}`));
  }
  assert.deepEqual(baseTargets(ascii, 'layer.all.fontSize'), ['layer.0.fontSize', 'layer.1.fontSize']);
  const patch = { intensity: 1, enabled: true, bases: { 'layer.0.fontSize': 4, 'layer.1.fontSize': 10 },
    routes: [{ target: 'layer.all.fontSize', source: 'plugin/*/bass', depth: 0.1, smooth: 0, curve: 'linear', bipolar: false, enabled: true }] };
  assert.deepEqual(cleanPatch(JSON.parse(JSON.stringify(patch))), patch);
  ascii.layers = [];
  assert.ok(!listTargets(ascii, null).some(id => id.startsWith('layer.all.')));
});

test('all-layer mappings follow layers added or removed in Appearance', () => {
  const ascii = { get: () => undefined };
  ascii.layers = [new Layer(ascii, { fontSize: 8 })];
  const engine = routingEngine(ascii);
  const stop = registerSignal('audio:bass', () => 1);
  try {
    engine.route('layer.all.fontSize', { source: 'audio:bass', depth: 0.1, smooth: 0 });
    const added = new Layer(ascii, { fontSize: 12 });
    ascii.layers = [...ascii.layers, added];
    assert.equal(engine.syncLayers(), true);
    added._applyAutomations(1);
    assert.ok(Math.abs(added.get('fontSize') - 16.7) < 1e-8);
    ascii.layers = [added];
    assert.equal(engine.syncLayers(), true);
    engine.unroute('layer.all.fontSize', 'audio:bass');
    assert.equal(added.get('fontSize'), 12);
    assert.equal(engine.syncLayers(), false);
  } finally { stop(); }
});

test('scene-declared controls are listed, labelled, validated and driven through the scene', () => {
  const control = { key: 'bass', label: 'Low mountains', min: 0, max: 1.5, step: 0.01, def: 0.2, custom: true };
  const mods = {};
  const scene = { title: 'Terrain', custom: [control], range: key => (key === 'bass' ? control : { key, min: 0, max: 2 }),
    setMod: (key, fn) => { if (fn) mods[key] = fn; else delete mods[key]; } };
  const ascii = { get: () => undefined, layers: [] };
  assert.equal(listTargets(ascii, scene)[0], 'scene.bass');
  assert.deepEqual(targetInfo('scene.bass', scene), { label: 'Low mountains', group: 'Terrain', kind: 'scene', key: 'bass', span: 1.5 });
  assert.equal(targetInfo('scene.bass', null).kind, 'ascii', 'unknown without the scene that declares it');
  const route = { target: 'scene.bass', source: 'plugin/*/bass', depth: 0.5, smooth: 0, curve: 'linear', bipolar: false, enabled: true };
  assert.deepEqual(cleanPatch({ intensity: 1, enabled: true, bases: { 'scene.bass': 0.4 }, routes: [route] }).routes, [route]);
  assert.throws(() => cleanPatch({ intensity: 1, enabled: true, bases: {}, routes: [{ ...route, target: 'scene.no-such!' }] }));
  const rx = new Reactivity({ ascii: routingEngine(ascii), scene, audio: { value: () => 1 } });
  rx.load([route]);
  assert.ok(Math.abs(mods.bass() - 0.75) < 1e-9, 'depth is a fraction of the control range');
  const bare = new Reactivity({ ascii: routingEngine(ascii), audio: { value: () => 1 } }).load([route]);
  assert.equal(bare.routes.length, 0, 'scenes without the control skip the route');
});
