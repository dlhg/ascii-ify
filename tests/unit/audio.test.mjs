import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioAnalyzer } from '../../src/audio.js';
import { AutomationSet } from '../../src/automation.js';

// Synthetic source: 1024 bins over 0..22050 Hz (~21.5 Hz/bin)
const BINS = 1024;
const SR = 44100;
function makeSource() {
  const src = {
    sampleRate: SR,
    binCount: BINS,
    spectrum: new Uint8Array(BINS),
    waveform: new Uint8Array(2048).fill(128),
    next: new Uint8Array(BINS),
    pull() { src.spectrum.set(src.next); },
  };
  return src;
}
const fill = (arr, hz0, hz1, v) => {
  const binHz = SR / 2 / BINS;
  for (let i = Math.floor(hz0 / binHz); i < Math.ceil(hz1 / binHz); i++) arr[i] = v;
};

function rig() {
  let t = 0;
  const audio = new AudioAnalyzer({ clock: () => t });
  const src = makeSource();
  audio.useSource(src);
  const step = (ms = 16) => { t += ms; audio.update(t); };
  return { audio, src, step };
}

test('bass band responds to low energy, not high', () => {
  const { audio, src, step } = rig();
  fill(src.next, 30, 140, 200);
  for (let i = 0; i < 30; i++) step();
  assert.ok(audio.levels.bass > 0.8, `bass=${audio.levels.bass}`);
  assert.ok(audio.levels.high < 0.05, `high=${audio.levels.high}`);
});

test('band release is slower than attack', () => {
  const { audio, src, step } = rig();
  fill(src.next, 30, 140, 200);
  for (let i = 0; i < 30; i++) step();
  src.next.fill(0);
  step();
  assert.ok(audio.levels.bass > 0.5, 'still ringing one frame after cut');
  for (let i = 0; i < 120; i++) step();
  assert.ok(audio.levels.bass < 0.05, 'eventually released');
});

test('kick onset fires on a bass transient, once, then decays', () => {
  const { audio, src, step } = rig();
  let fired = 0;
  audio.on('kick', () => fired++);
  for (let i = 0; i < 40; i++) step();       // silence
  fill(src.next, 30, 140, 220);
  step();                                     // hit
  assert.equal(fired, 1);
  assert.ok(audio.levels.kick >= 0.5);
  for (let i = 0; i < 10; i++) step();        // sustained, no new flux
  assert.equal(fired, 1);
  for (let i = 0; i < 60; i++) step();
  assert.ok(audio.levels.kick < 0.05);
});

test('steady tone does not retrigger onsets', () => {
  const { audio, src, step } = rig();
  fill(src.next, 30, 140, 180);
  step();
  const before = audio.triggerCount('kick');
  for (let i = 0; i < 200; i++) step();
  assert.equal(audio.triggerCount('kick'), before);
});

test('centroid rises with brighter content', () => {
  const dark = rig();
  fill(dark.src.next, 100, 300, 200);
  for (let i = 0; i < 40; i++) dark.step();
  const bright = rig();
  fill(bright.src.next, 4000, 8000, 200);
  for (let i = 0; i < 40; i++) bright.step();
  assert.ok(bright.audio.levels.centroid > dark.audio.levels.centroid + 0.3);
});

test('audio:* types drive automation through the registry', () => {
  const { audio, src, step } = rig();
  fill(src.next, 30, 140, 200);
  for (let i = 0; i < 30; i++) step();
  const values = {};
  const set = new AutomationSet((k, v) => { values[k] = v; });
  set.set('crtGlow', 0, { type: 'audio:bass', min: 0, max: 1 });
  set.apply(0);
  assert.ok(values.crtGlow > 0.8);
});

test('audio type with no analyzer rests at min instead of crashing', () => {
  const values = {};
  const set = new AutomationSet((k, v) => { values[k] = v; });
  set.set('crtGlow', 0, { type: 'audio:nonexistent', min: 0.2, max: 1 });
  set.apply(0);
  assert.equal(values.crtGlow, 0.2);
});

test('destroy unregisters signals', () => {
  const { audio } = rig();
  audio.destroy();
  const values = {};
  const set = new AutomationSet((k, v) => { values[k] = v; });
  set.set('crtGlow', 0, { type: 'audio:bass', min: 0.2, max: 1 });
  set.apply(0);
  assert.equal(values.crtGlow, 0.2);
});

test('mic-style noise floor does not trigger onsets', () => {
  const { audio, src, step } = rig();
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let f = 0; f < 600; f++) {
    for (let i = 0; i < BINS; i++) src.next[i] = 18 + Math.floor(rand() * 14);   // hiss: 18..31
    step();
  }
  assert.equal(audio.triggerCount('kick'), 0);
  assert.equal(audio.triggerCount('snare'), 0);
  assert.equal(audio.triggerCount('hat'), 0);
});

test('a real hit still triggers on top of a noisy floor', () => {
  const { audio, src, step } = rig();
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const noise = () => { for (let i = 0; i < BINS; i++) src.next[i] = 18 + Math.floor(rand() * 14); };
  for (let f = 0; f < 120; f++) { noise(); step(); }
  noise(); fill(src.next, 30, 140, 210); step();
  assert.equal(audio.triggerCount('kick'), 1);
});
