import test from 'node:test';
import assert from 'node:assert/strict';
import { Reactivity } from '../../examples/audio-reactivity.js';
import { profileFor, sceneKind } from '../../examples/audio-profiles.js';

function rig(params = {}) {
  const engine = new Map();   // "target|source" → route
  const p = { crtGlow: 0, crtEnabled: false, crtScanlines: 0.3, speed: 1, depthScale: 100, ...params };
  const ascii = {
    get: (k) => p[k],
    set: (o) => Object.assign(p, o),
    route: (k, r) => engine.set(`${k}|${r.source}`, r),
    unroute: (k, s) => engine.delete(`${k}|${s}`),
  };
  const mods = {};
  const scene = { setMod: (k, fn) => { if (fn) mods[k] = fn; else delete mods[k]; } };
  const levels = { rms: 0, kick: 0, bass: 0, centroid: 0.5 };
  const audio = { value: (n) => levels[n] ?? 0 };
  return { ascii, scene, audio, engine, mods, levels, p, rx: new Reactivity({ ascii, scene, audio }) };
}

test('ascii routes go to the engine with depth × intensity', () => {
  const { rx, engine } = rig();
  rx.load([{ target: 'crtGlow', source: 'kick', depth: 0.4 }]);
  assert.equal(engine.get('crtGlow|audio:kick').depth, 0.4);
  rx.setIntensity(0.5);
  assert.equal(engine.get('crtGlow|audio:kick').depth, 0.2);
  rx.setIntensity(0);
  assert.equal(engine.get('crtGlow|audio:kick').depth, 0);
});

test('glow route switches the CRT pass on without scanlines', () => {
  const { rx, p } = rig();
  rx.load([{ target: 'crtGlow', source: 'rms', depth: 0.3 }]);
  assert.equal(p.crtEnabled, true);
  assert.equal(p.crtScanlines, 0);
});

test('scene routes sum into one offset per control, scaled by span and intensity', () => {
  const { rx, mods, levels } = rig();
  rx.load([
    { target: 'scene.brightness', source: 'rms', depth: 0.25, smooth: 0 },
    { target: 'scene.brightness', source: 'kick', depth: 0.25, smooth: 0 },
  ]);
  levels.rms = 1; levels.kick = 1;
  assert.ok(Math.abs(mods.brightness() - 1.0) < 1e-9);   // (0.25+0.25) × span 2
  rx.setIntensity(0.5);
  assert.ok(Math.abs(mods.brightness() - 0.5) < 1e-9);
});

test('idle (no signal) adds nothing to the scene', () => {
  const { rx, mods } = rig();
  rx.load([{ target: 'scene.brightness', source: 'rms', depth: 0.5, smooth: 0 }]);
  assert.equal(mods.brightness(), 0);
});

test('bipolar routes are neutral at the midpoint', () => {
  const { rx, mods, levels } = rig();
  rx.load([{ target: 'scene.hue', source: 'centroid', depth: 0.5, bipolar: true, smooth: 0 }]);
  assert.equal(mods.hue(), 0);
  levels.centroid = 1;
  assert.ok(Math.abs(mods.hue() - 90) < 1e-9);            // 0.5 × span 180
});

test('disabled routes are removed; removing a route clears its engine entry', () => {
  const { rx, engine } = rig();
  rx.load([{ target: 'crtGlow', source: 'kick', depth: 0.3 }]);
  const id = rx.routes[0].id;
  rx.updateRoute(id, { enabled: false });
  assert.equal(engine.size, 0);
  rx.updateRoute(id, { enabled: true });
  assert.equal(engine.size, 1);
  rx.removeRoute(id);
  assert.equal(engine.size, 0);
});

test('routes to parameters the scene lacks are skipped', () => {
  const { rx } = rig();
  rx.load([{ target: 'nonexistent', source: 'rms', depth: 0.3 }, { target: 'crtGlow', source: 'rms', depth: 0.3 }]);
  assert.equal(rx.routes.length, 1);
});

test('toJSON round-trips into load()', () => {
  const a = rig();
  a.rx.load([{ target: 'scene.contrast', source: 'snare', depth: 0.2, smooth: 0.05, curve: 'exp' }]);
  const json = JSON.parse(JSON.stringify(a.rx.toJSON()));
  assert.equal(json.routes[0].id, undefined);
  const b = rig();
  b.rx.load(json.routes, { intensity: json.intensity });
  assert.equal(b.rx.routes[0].curve, 'exp');
});

test('every profile only uses known-safe shapes; games never touch scene speed', () => {
  const ascii = { get: (k) => ({ renderMode: '3d', pattern: 'x', patternMix: 0.3, colorCycle: true, edgeDetect: true })[k] };
  for (const name of ['galaxy', 'fireworks', 'cityscape', 'snake', 'plasma-bloom', 'chess', 'unknown-scene']) {
    const routes = profileFor(name, ascii);
    assert.ok(routes.length > 0, name);
    for (const r of routes) {
      assert.ok(r.target && r.source && Number.isFinite(r.depth), `${name}: ${JSON.stringify(r)}`);
      assert.equal(r.when, undefined);
    }
  }
  for (const name of ['snake', 'flappy', 'chess', 'life']) {
    assert.equal(sceneKind(name), 'gentle');
    assert.ok(!profileFor(name, ascii).some((r) => r.target === 'scene.speed'), name);
  }
  assert.deepEqual(profileFor('audio-reactive', ascii), []);
});
