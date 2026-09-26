import { PARAM_RANGES } from './data/defaults.js';
import { clamp, lerp } from './utils.js';

const TWO_PI = Math.PI * 2;

// ─── Shared input source (for mouseX / mouseY / scroll automation) ───────
// All normalized 0..1. Mouse y is flipped so up = 1 (max); scroll is an
// accumulator that each wheel tick nudges (scroll up = toward 1).
const SCROLL_STEP = 0.04;
const pointer = { x: 0.5, y: 0.5, scroll: 0.5 };
let pointerBound = false;

function ensurePointerTracking() {
  if (pointerBound || typeof window === 'undefined') return;
  pointerBound = true;
  const move = (e) => {
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    if (cx == null || cy == null) return;
    pointer.x = clamp(cx / window.innerWidth, 0, 1);
    pointer.y = clamp(1 - cy / window.innerHeight, 0, 1);
  };
  const wheel = (e) => {
    pointer.scroll = clamp(pointer.scroll - Math.sign(e.deltaY) * SCROLL_STEP, 0, 1);
  };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('touchmove', move, { passive: true });
  window.addEventListener('wheel', wheel, { passive: true });
}

// ─── External signal registry (audio, MIDI, …) ──────────────────────────
// A signal is a named function returning a normalized 0..1 value. Names are
// plain strings (e.g. 'audio:bass') so automation definitions stay serializable.
const signals = new Map();

/** Register a named 0..1 signal usable as an automation `type`. Returns an unregister fn. */
export function registerSignal(name, read) {
  signals.set(name, read);
  return () => { if (signals.get(name) === read) signals.delete(name); };
}

export function isInputAutomation(type) {
  return type === 'mod' || type === 'mouseX' || type === 'mouseY' || type === 'scroll' || signals.has(type)
    || (typeof type === 'string' && type.startsWith('audio:'));
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function random01(seed, index) {
  let x = (seed + Math.imul(index + 1, 374761393)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function noise(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  return lerp(random01(seed, i), random01(seed, i + 1), smoothstep(f));
}

function normalizeAutomation(key, currentValue, options = {}) {
  if (typeof currentValue !== 'number' || !Number.isFinite(currentValue)) {
    throw new TypeError(`Cannot automate non-numeric parameter "${key}"`);
  }

  const range = PARAM_RANGES[key] || null;
  const base = options.base ?? currentValue;
  const hasBounds = options.min != null || options.max != null;
  const fallbackAmount = range ? (range.max - range.min) * 0.1 : Math.max(Math.abs(base) * 0.25, 1);
  const amount = Math.abs(options.amount ?? fallbackAmount);

  let min = hasBounds ? (options.min ?? base - amount) : base - amount;
  let max = hasBounds ? (options.max ?? base + amount) : base + amount;
  if (min > max) [min, max] = [max, min];

  if (range) {
    min = clamp(min, range.min, range.max);
    max = clamp(max, range.min, range.max);
  }

  const type = options.type || options.mode || 'sine';
  if (isInputAutomation(type)) ensurePointerTracking();

  if (type === 'mod') {
    // Matrix mode: value = base + Σ depth × shaped(source) × span, clamped to the range.
    const routes = (options.routes || []).map(normalizeRoute);
    routes.forEach(r => { if (isInputAutomation(r.source)) ensurePointerTracking(); });
    return {
      type, base,
      min: range ? range.min : -1e9,
      max: range ? range.max : 1e9,
      amount: 0, relative: false, rate: 0, phase: 0,
      seed: options.seed ?? hashString(key),
      routes,
    };
  }

  return {
    type,
    base,
    min,
    max,
    amount,
    relative: !hasBounds,
    rate: Math.max(0, Number(options.rate ?? 1)),
    phase: Number(options.phase ?? 0),
    seed: options.seed ?? hashString(key),
  };
}

const CURVES = ['linear', 'exp', 'log'];

function normalizeRoute(route = {}) {
  if (!route.source || typeof route.source !== 'string') {
    throw new TypeError('A route needs a `source` (e.g. "audio:kick", "sine", "mouseX")');
  }
  return {
    source: route.source,
    depth: Number.isFinite(route.depth) ? route.depth : 0.5, // fraction of the parameter's range; negative inverts
    smooth: Math.max(0, Number(route.smooth ?? 0)),           // seconds of slew
    curve: CURVES.includes(route.curve) ? route.curve : 'linear',
    bipolar: !!route.bipolar,                                 // signal spans -1..1 instead of 0..1
    rate: Math.max(0, Number(route.rate ?? 1)),               // LFO sources only
    phase: Number(route.phase ?? 0),
    seed: route.seed ?? hashString(route.source),
  };
}

function shape(n, curve) {
  return curve === 'exp' ? n * n : curve === 'log' ? Math.sqrt(n) : n;
}

function copyItem(item) {
  return item.routes ? { ...item, routes: item.routes.map(r => ({ ...r })) } : { ...item };
}

export class AutomationSet {
  constructor(setter) {
    this._setter = setter;
    this._items = new Map();
    this._state = new Map();   // per-route smoothing state, kept out of serialized output
    this._lastTime = null;
  }

  get size() {
    return this._items.size;
  }

  set(key, currentValue, options = {}) {
    // Re-automating an automated key: anchor to its base, not the in-flight value
    const existing = this._items.get(key);
    if (existing && options.base == null) options = { ...options, base: existing.base };
    // A UI re-automating a matrix item without routes must not wipe them
    if (existing?.type === 'mod' && options.type === 'mod' && !options.routes) {
      options = { ...options, routes: existing.routes };
    }
    const item = normalizeAutomation(key, currentValue, options);
    this._items.set(key, item);
    this._state.delete(key);
    return this.get(key);
  }

  /** Add a modulation route to a parameter (creating its matrix if needed). */
  route(key, currentValue, route) {
    const existing = this._items.get(key);
    const routes = existing?.type === 'mod' ? existing.routes.map(r => ({ ...r })) : [];
    routes.push(normalizeRoute(route));
    return this.set(key, currentValue, { type: 'mod', base: existing?.base, routes });
  }

  /** Remove a route by index or source name. Drops the automation when none remain. */
  unroute(key, which, restore = true) {
    const item = this._items.get(key);
    if (!item || item.type !== 'mod') return false;
    const index = typeof which === 'number' ? which : item.routes.findIndex(r => r.source === which);
    if (index < 0 || index >= item.routes.length) return false;
    item.routes.splice(index, 1);
    this._state.get(key)?.splice(index, 1);
    if (item.routes.length === 0) this.delete(key, restore);
    return true;
  }

  has(key) {
    return this._items.has(key);
  }

  get(key) {
    const item = this._items.get(key);
    return item ? copyItem(item) : null;
  }

  all() {
    const out = {};
    for (const [key, item] of this._items) out[key] = copyItem(item);
    return out;
  }

  updateBase(key, value) {
    const item = this._items.get(key);
    if (!item || typeof value !== 'number' || !Number.isFinite(value)) return;

    const span = item.max - item.min;
    item.base = value;
    if (item.relative && span > 0) {
      item.min = value - span / 2;
      item.max = value + span / 2;
      const range = PARAM_RANGES[key];
      if (range) {
        item.min = clamp(item.min, range.min, range.max);
        item.max = clamp(item.max, range.min, range.max);
      }
    }
  }

  delete(key, restore = true) {
    const item = this._items.get(key);
    if (!item) return false;
    this._items.delete(key);
    this._state.delete(key);
    if (restore) this._setter(key, item.base, true);
    return true;
  }

  clear(restore = true) {
    for (const key of [...this._items.keys()]) this.delete(key, restore);
  }

  apply(time) {
    if (this._items.size === 0) return;
    const dt = this._lastTime == null ? 0 : clamp(time - this._lastTime, 0, 0.1);
    this._lastTime = time;
    for (const [key, item] of this._items) {
      const value = item.type === 'mod' ? this._modValue(key, item, time, dt) : this._valueAt(item, time);
      this._setter(key, value, true);
    }
  }

  _modValue(key, item, time, dt) {
    const range = PARAM_RANGES[key];
    const span = range ? range.max - range.min : Math.max(Math.abs(item.base), 1);
    let state = this._state.get(key);
    if (!state) this._state.set(key, state = []);

    let v = item.base;
    for (let i = 0; i < item.routes.length; i++) {
      const r = item.routes[i];
      let n = clamp(signalAt(r.source, time * r.rate + r.phase, r.seed), 0, 1);
      if (r.smooth > 0 && state[i] !== undefined) {
        n = state[i] + (n - state[i]) * (dt > 0 ? 1 - Math.exp(-dt / r.smooth) : 1);
      }
      state[i] = n;
      n = shape(n, r.curve);
      v += r.depth * (r.bipolar ? n * 2 - 1 : n) * span;
    }
    return clamp(v, item.min, item.max);
  }

  _valueAt(item, time) {
    const n = signalAt(item.type, time * item.rate + item.phase, item.seed);
    return lerp(item.min, item.max, n);
  }
}

/** Normalized 0..1 value of any source: LFO waveform, pointer input, or registered signal. */
function signalAt(type, cycle, seed) {
  switch (type) {
    case 'triangle': {
      const f = ((cycle % 1) + 1) % 1;
      return f < 0.5 ? f * 2 : 2 - f * 2;
    }
    case 'noise': return noise(seed, cycle);
    case 'mouseX': return pointer.x;
    case 'mouseY': return pointer.y;
    case 'scroll': return pointer.scroll;
    case 'sine': return (Math.sin(cycle * TWO_PI) + 1) / 2;
    default: {
      const read = signals.get(type);
      if (read) return clamp(read(), 0, 1);
      // Audio signal whose analyzer isn't running yet: rest at min
      if (typeof type === 'string' && type.startsWith('audio:')) return 0;
      return (Math.sin(cycle * TWO_PI) + 1) / 2; // unknown types fall back to sine
    }
  }
}
