import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomationSet, registerSignal } from '../../src/automation.js';

let a = 0, b = 0;
registerSignal('test:a', () => a);
registerSignal('test:b', () => b);

function rig() {
  const values = {};
  const set = new AutomationSet((k, v) => { values[k] = v; });
  return { set, values };
}

test('single route: base + depth × signal × range', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0.2, { source: 'test:a', depth: 0.5 });   // range 0..1
  a = 0;   set.apply(0);    assert.equal(values.crtGlow, 0.2);
  a = 1;   set.apply(0.1);  assert.ok(Math.abs(values.crtGlow - 0.7) < 1e-9);
});

test('multiple routes sum on one parameter', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0.1, { source: 'test:a', depth: 0.3 });
  set.route('crtGlow', 0.1, { source: 'test:b', depth: 0.4 });
  a = 1; b = 1; set.apply(0);
  assert.ok(Math.abs(values.crtGlow - 0.8) < 1e-9);
});

test('depth is a fraction of the parameter range; negative inverts', () => {
  const { set, values } = rig();
  set.route('fontSize', 30, { source: 'test:a', depth: -0.2 });  // range 1..48 → span 47
  a = 1; set.apply(0);
  assert.ok(Math.abs(values.fontSize - (30 - 0.2 * 47)) < 1e-9);
});

test('result clamps to the parameter range', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0.9, { source: 'test:a', depth: 1 });
  a = 1; set.apply(0);
  assert.equal(values.crtGlow, 1);
});

test('bipolar routes swing both ways around base', () => {
  const { set, values } = rig();
  set.route('rotationZ', 0, { source: 'test:a', depth: 0.1, bipolar: true }); // span 6.28
  a = 0; set.apply(0); assert.ok(values.rotationZ < 0);
  a = 1; set.apply(0.1); assert.ok(values.rotationZ > 0);
  a = 0.5; set.apply(0.2); assert.ok(Math.abs(values.rotationZ) < 1e-9);
});

test('smoothing slews toward the signal instead of jumping', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0, { source: 'test:a', depth: 1, smooth: 0.5 });
  a = 0; set.apply(0);
  a = 1; set.apply(0.016);
  assert.ok(values.crtGlow > 0 && values.crtGlow < 0.1, `first step ${values.crtGlow}`);
  for (let t = 0.032; t < 3; t += 0.016) set.apply(t);
  assert.ok(values.crtGlow > 0.95);
});

test('curves shape the response', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0, { source: 'test:a', depth: 1, curve: 'exp' });
  a = 0.5; set.apply(0);
  assert.ok(Math.abs(values.crtGlow - 0.25) < 1e-9);
});

test('LFO sources work as routes', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0, { source: 'sine', depth: 1, rate: 1 });
  set.apply(0.25);   // sine peak
  assert.ok(values.crtGlow > 0.99);
});

test('manual set() updates the base while routes are active', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0.1, { source: 'test:a', depth: 0.2 });
  set.updateBase('crtGlow', 0.4);
  a = 1; set.apply(0);
  assert.ok(Math.abs(values.crtGlow - 0.6) < 1e-9);
});

test('unroute by source; last route removal restores base', () => {
  const { set, values } = rig();
  set.route('crtGlow', 0.3, { source: 'test:a', depth: 0.2 });
  set.route('crtGlow', 0.3, { source: 'test:b', depth: 0.2 });
  assert.equal(set.unroute('crtGlow', 'test:a'), true);
  assert.equal(set.get('crtGlow').routes.length, 1);
  set.unroute('crtGlow', 0);
  assert.equal(set.has('crtGlow'), false);
  assert.equal(values.crtGlow, 0.3);
});

test('definitions serialize and round-trip without runtime state', () => {
  const { set } = rig();
  set.route('crtGlow', 0.2, { source: 'test:a', depth: 0.5, smooth: 0.1, curve: 'exp' });
  a = 1; set.apply(0); set.apply(0.05);
  const json = JSON.parse(JSON.stringify(set.all()));
  assert.equal(json.crtGlow.type, 'mod');
  assert.deepEqual(Object.keys(json.crtGlow.routes[0]).sort(),
    ['bipolar', 'curve', 'depth', 'phase', 'rate', 'seed', 'smooth', 'source']);
  const { set: set2, values } = rig();
  set2.set('crtGlow', 0.2, json.crtGlow);
  a = 1; set2.apply(0);
  assert.ok(values.crtGlow > 0.2);
});

test('re-automating a matrix item without routes keeps its routes', () => {
  const { set } = rig();
  set.route('crtGlow', 0.2, { source: 'test:a', depth: 0.5 });
  set.set('crtGlow', 0.2, { type: 'mod', amount: 0.1 });
  assert.equal(set.get('crtGlow').routes.length, 1);
});

test('route without a source throws', () => {
  const { set } = rig();
  assert.throws(() => set.route('crtGlow', 0, { depth: 1 }), TypeError);
});
