// ─── Demo groove: a synthetic song for previewing audio-driven scenes ─────
// Open any example with ?demo to drive its audio mappings from this until a
// microphone or file is connected (`live`). It produces the same signals as AudioAnalyzer (rms,
// bass, mid, high, kick, snare, hat, …) from a 16-bar loop at 120 BPM:
//   bars 1–4 intro (hats, pads) · 5–12 groove · 13–14 breakdown · 15–16 build.

import { registerSignal } from '../src/automation.js';

const IDS = ['rms', 'bass', 'lowmid', 'mid', 'high', 'centroid', 'kick', 'snare', 'hat', 'onset'];

export function demoGroove({ bpm = 120, live = null } = {}) {
  const beat = 60 / bpm;
  const start = performance.now() / 1000;
  const levels = Object.fromEntries(IDS.map(id => [id, 0]));
  const listeners = new Map();
  let lastFrame = -1, lastHits = { kick: -1, snare: -1, hat: -1 };

  // Seconds since the most recent hit on a grid of `step` beats, filtered by `keep(index)`.
  function since(t, step, keep) {
    let i = Math.floor(t / (beat * step));
    for (let n = 0; n < 64 && i >= 0; n++, i--) if (keep(i)) return { age: t - i * beat * step, index: i };
    return { age: Infinity, index: -1 };
  }

  function compute() {
    const frame = Math.floor(performance.now() / 8);
    if (frame === lastFrame) return;
    lastFrame = frame;
    const t = performance.now() / 1000 - start;
    const bar = Math.floor(t / (beat * 4)) % 16;
    const intro = bar < 4, groove = bar >= 4 && bar < 12, breakdown = bar === 12 || bar === 13, build = bar >= 14;
    const inBar = (t / (beat * 4)) % 1;

    const kickOn = groove;
    const kick = kickOn ? since(t, 1, () => true) : { age: Infinity };
    const snare = groove ? since(t, 1, i => i % 2 === 1)
      : build ? since(t, bar === 15 ? (inBar < 0.5 ? 0.5 : 0.25) : 1, () => true) : { age: Infinity };
    const hat = breakdown ? { age: Infinity } : since(t, 0.5, i => intro || i % 2 === 1);

    const env = (age, decay) => (age === Infinity ? 0 : Math.exp(-age / decay));
    const k = env(kick.age, 0.16), s = env(snare.age, 0.14) * (build ? 0.6 + 0.4 * inBar : 1), h = env(hat.age, 0.06) * 0.8;
    const pad = 0.5 + 0.5 * Math.sin(t * 0.7);
    const rise = build ? ((bar - 14) + inBar) / 2 : 0;

    levels.kick = k;
    levels.snare = s;
    levels.hat = h;
    levels.onset = Math.max(k, s, h);
    levels.bass = intro ? 0.12 : breakdown ? 0.05 + 0.1 * pad : build ? 0.15 : 0.35 + 0.6 * k;
    levels.lowmid = 0.2 + 0.3 * pad * (breakdown ? 1.3 : 1) + 0.2 * s;
    levels.mid = 0.25 + 0.35 * pad + 0.3 * s + (breakdown ? 0.15 : 0);
    levels.high = 0.15 + 0.5 * h + 0.6 * rise + (breakdown ? 0.25 * pad : 0);
    levels.centroid = 0.35 + 0.3 * levels.high - 0.2 * levels.bass + 0.3 * rise;
    levels.rms = Math.min(1, 0.15 + 0.35 * levels.bass + 0.25 * levels.mid + 0.15 * levels.high + (groove ? 0.15 : 0));

    for (const [name, age] of [['kick', kick.age], ['snare', snare.age], ['hat', hat.age]]) {
      const fired = age < 0.02 && age !== Infinity;
      if (fired && lastHits[name] !== Math.round((t - age) * 1000)) {
        lastHits[name] = Math.round((t - age) * 1000);
        listeners.get(name)?.forEach(fn => fn(levels[name]));
      }
    }
  }

  const value = id => {
    if (live?.connected) return live.value(id);
    compute();
    return levels[id] ?? 0;
  };
  // Registered after the live analyzer's own signals, so these win and hand over to it.
  IDS.forEach(id => registerSignal(`audio:${id}`, () => value(id)));

  return {
    connected: true,
    get levels() {
      if (live?.connected) return live.levels;
      compute();
      return levels;
    },
    value,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
  };
}
