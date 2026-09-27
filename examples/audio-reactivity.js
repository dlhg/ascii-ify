// ─── Audio Reactivity Model ───────────────────────────────────
// A scene's reactivity is a list of routes:
//
//   { target: 'crtGlow', source: 'kick', depth: 0.35, smooth: 0.08, curve: 'linear', bipolar: false, enabled: true }
//
// `target` is an ASCII parameter ('crtGlow', 'depthScale', …) or a scene-filter
// control ('scene.brightness', 'scene.hue', …). `source` is an audio signal
// ('rms', 'bass', 'kick', 'centroid', …). `depth` is a fraction of the target's
// span (its slider range), negative to invert; `smooth` is a slew in seconds.
//
// The list is plain JSON (toJSON / load), so profiles, saved patches and a
// future control UI all edit the same thing. ASCII targets run through the
// engine's modulation matrix; scene targets ride on ScenePopup.setMod().

import { PARAM_RANGES } from '../src/data/defaults.js';

export const SOURCES = [
  { id: 'rms', label: 'Loudness', kind: 'level' },
  { id: 'bass', label: 'Bass', kind: 'level' },
  { id: 'lowmid', label: 'Low mids', short: 'Low mid', kind: 'level' },
  { id: 'mid', label: 'Mids', kind: 'level' },
  { id: 'high', label: 'Highs', kind: 'level' },
  { id: 'centroid', label: 'Brightness of sound', short: 'Tone', kind: 'level' },
  { id: 'kick', label: 'Kick', kind: 'hit' },
  { id: 'snare', label: 'Snare', kind: 'hit' },
  { id: 'hat', label: 'Hat', kind: 'hit' },
  { id: 'onset', label: 'Any hit', kind: 'hit' },
];

// Scene targets: `span` is what depth 1.0 means, in the control's own units.
// ASCII targets use their slider range from PARAM_RANGES as the span.
export const TARGETS = {
  'scene.brightness': { label: 'Brightness', group: 'Scene look', kind: 'scene', key: 'brightness', span: 2 },
  'scene.contrast': { label: 'Contrast', group: 'Scene look', kind: 'scene', key: 'contrast', span: 2 },
  'scene.saturate': { label: 'Saturation', group: 'Scene look', kind: 'scene', key: 'saturate', span: 2 },
  'scene.hue': { label: 'Hue shift', group: 'Scene look', kind: 'scene', key: 'hue', span: 180 },
  'scene.blur': { label: 'Blur', group: 'Scene look', kind: 'scene', key: 'blur', span: 10 },
  'scene.speed': { label: 'Scene speed', group: 'Scene look', kind: 'scene', key: 'speed', span: 2 },

  crtGlow: { label: 'Glow', group: 'CRT', kind: 'ascii' },
  crtScanlines: { label: 'Scanlines', group: 'CRT', kind: 'ascii' },
  crtDistortion: { label: 'Warp', group: 'CRT', kind: 'ascii' },
  crtFlicker: { label: 'Flicker', group: 'CRT', kind: 'ascii' },

  fontSize: { label: 'Glyph size', group: 'Glyphs', kind: 'ascii', jagged: true },
  density: { label: 'Glyph spacing', group: 'Glyphs', kind: 'ascii', jagged: true },
  fade: { label: 'Fade', group: 'Glyphs', kind: 'ascii' },
  sourceOpacity: { label: 'Source image', group: 'Glyphs', kind: 'ascii' },
  speed: { label: 'Pattern speed', group: 'Motion', kind: 'ascii' },
  patternMix: { label: 'Pattern mix', group: 'Motion', kind: 'ascii', needs: 'pattern' },
  colorCycleRate: { label: 'Color cycle speed', group: 'Motion', kind: 'ascii', needs: 'colorCycle' },
  edgeThreshold: { label: 'Edge threshold', group: 'Edges', kind: 'ascii', needs: 'edgeDetect' },

  depthScale: { label: 'Depth', group: '3D', kind: 'ascii', needs: '3d' },
  perspective: { label: 'Perspective', group: '3D', kind: 'ascii', needs: '3d' },
  cameraZ: { label: 'Camera distance', group: '3D', kind: 'ascii', needs: '3d' },
  rotationX: { label: 'Rotation X', group: '3D', kind: 'ascii', needs: '3d' },
  rotationY: { label: 'Rotation Y', group: '3D', kind: 'ascii', needs: '3d' },
  rotationZ: { label: 'Rotation Z', group: '3D', kind: 'ascii', needs: '3d' },
  depthOpacity: { label: 'Depth shading', group: '3D', kind: 'ascii', needs: '3d' },
};

export function targetInfo(id) {
  return TARGETS[id] || { label: id, group: 'Other', kind: 'ascii' };
}

/** Whether a target's prerequisite is on in this scene (e.g. edges for edgeThreshold). */
export function targetActive(id, ascii) {
  const need = targetInfo(id).needs;
  if (!need) return true;
  if (need === '3d') return ascii.get('renderMode') === '3d';
  return !!ascii.get(need);
}

/** What depth 1.0 means for a target, in its own units. */
export function targetSpan(id) {
  const t = targetInfo(id);
  if (t.kind === 'scene') return t.span;
  const r = PARAM_RANGES[id];
  return r ? r.max - r.min : 1;
}

/** Target ids usable in this scene, in display order. */
export function listTargets(ascii, scene) {
  return Object.keys(TARGETS).filter((id) => {
    const t = TARGETS[id];
    return t.kind === 'scene' ? !!scene : typeof ascii.get(id) === 'number';
  });
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const shape = (n, curve) => (curve === 'exp' ? n * n : curve === 'log' ? Math.sqrt(n) : n);

/** One-pole smoothing with attack = release = tau (seconds), on wall-clock time. */
function slew(getTau) {
  let y = null;
  let last = performance.now();
  return (x) => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const tau = getTau();
    if (y === null || tau <= 0) return (y = x);
    y += (x - y) * (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);
    return y;
  };
}

let nextId = 1;

export class Reactivity {
  constructor({ ascii, scene, audio }) {
    this.ascii = ascii;
    this.scene = scene;
    this.audio = audio;
    this.routes = [];
    this.intensity = 1;
    this._applied = [];    // [target, engineSource] pairs currently on the engine
    this._sceneKeys = new Set();
    this._listeners = new Set();
  }

  /** Replace all routes (e.g. a profile or saved patch). Unknown targets are skipped. */
  load(routes, { intensity = this.intensity } = {}) {
    this.routes = routes.map((r) => ({
      id: nextId++, enabled: true, smooth: 0.1, curve: 'linear', bipolar: false, depth: 0.3, ...r,
    })).filter((r) => this._supports(r.target));
    this.intensity = intensity;
    this._rebuild();
    return this;
  }

  addRoute(route) {
    this.routes.push({ id: nextId++, enabled: true, smooth: 0.1, curve: 'linear', bipolar: false, depth: 0.3, ...route });
    this._rebuild();
    return this.routes[this.routes.length - 1];
  }

  updateRoute(id, patch) {
    const r = this.routes.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    const structural = ['enabled', 'source', 'target'].some((k) => k in patch);
    if (structural) this._rebuild();
    else {
      // depth / smooth / curve / bipolar: scene routes read them live; ASCII routes re-register
      if (targetInfo(r.target).kind === 'ascii' && r.enabled) this._applyAscii(r);
      this._listeners.forEach((fn) => fn(this, 'tweak'));
    }
    return r;
  }

  removeRoute(id) {
    this.routes = this.routes.filter((r) => r.id !== id);
    this._rebuild();
  }

  setIntensity(k) {
    this.intensity = Math.max(0, k);
    this._rebuild();
  }

  /** Subscribe to structural changes (for a UI). */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  toJSON() {
    return {
      intensity: this.intensity,
      routes: this.routes.map(({ id, _ease, ...r }) => r),
    };
  }

  /**
   * Live values for showing a route working: the raw signal, and the target's
   * current effective value.
   */
  readout(route) {
    const input = clamp01(this.audio.value(route.source));
    const info = targetInfo(route.target);
    let value = null;
    if (info.kind === 'ascii') value = this.ascii.get(route.target);
    else if (this.scene) value = this.scene._effective?.({ key: info.key, min: 0, max: 1e9 }) ?? null;
    return { input, value };
  }

  // ─── internals ───────────────────────────────────────────────────────

  _supports(target) {
    const info = targetInfo(target);
    if (info.kind === 'scene') return !!this.scene;
    return typeof this.ascii.get(target) === 'number';
  }

  _rebuild() {
    // Clear what we put on the engine, then re-add enabled ASCII routes.
    for (const [target, source] of this._applied) this.ascii.unroute(target, source);
    this._applied = [];

    const crt = this.routes.filter((r) => r.enabled && r.target.startsWith('crt'));
    if (crt.length && !this.ascii.get('crtEnabled')) {
      // Glow alone gets a scanline-free CRT pass; anything else keeps the default look.
      this.ascii.set(crt.every((r) => r.target === 'crtGlow') ? { crtEnabled: true, crtScanlines: 0 } : { crtEnabled: true });
    }
    for (const r of this.routes) {
      if (targetInfo(r.target).kind === 'ascii' && r.enabled) this._applyAscii(r);
    }

    // Scene targets: one summing function per control.
    if (this.scene) {
      for (const key of this._sceneKeys) this.scene.setMod(key, null);
      this._sceneKeys.clear();
      const byKey = new Map();
      for (const r of this.routes) {
        const info = targetInfo(r.target);
        if (info.kind !== 'scene' || !r.enabled) continue;
        r._ease = slew(() => r.smooth);
        if (!byKey.has(info.key)) byKey.set(info.key, []);
        byKey.get(info.key).push({ r, span: info.span });
      }
      for (const [key, list] of byKey) {
        this._sceneKeys.add(key);
        this.scene.setMod(key, () => {
          let sum = 0;
          for (const { r, span } of list) {
            const n = shape(r._ease(clamp01(this.audio.value(r.source))), r.curve);
            sum += r.depth * this.intensity * (r.bipolar ? n * 2 - 1 : n) * span;
          }
          return sum;
        });
      }
    }

    this._listeners.forEach((fn) => fn(this, 'structure'));
  }

  _applyAscii(r) {
    const source = `audio:${r.source}`;
    // Engine routes append; replace our previous route when a control is edited.
    if (this._applied.some(([t, s]) => t === r.target && s === source)) this.ascii.unroute(r.target, source);
    this.ascii.route(r.target, {
      source,
      depth: r.depth * this.intensity,
      smooth: r.smooth,
      curve: r.curve,
      bipolar: r.bipolar,
    });
    if (!this._applied.some(([t, s2]) => t === r.target && s2 === source)) this._applied.push([r.target, source]);
  }
}

// ─── Persistence: one saved patch per scene, in the browser ────────────
const storeKey = (scene) => `ascii-audio-patch:${scene}`;

export function loadPatch(scene) {
  try {
    const raw = localStorage.getItem(storeKey(scene));
    const patch = raw && JSON.parse(raw);
    return patch && Array.isArray(patch.routes) ? patch : null;
  } catch { return null; }
}

export function savePatch(scene, patch) {
  try { localStorage.setItem(storeKey(scene), JSON.stringify(patch)); return true; } catch { return false; }
}

export function clearPatch(scene) {
  try { localStorage.removeItem(storeKey(scene)); } catch { /* storage unavailable */ }
}
