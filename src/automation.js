import { PARAM_RANGES } from './data/defaults.js';
import { clamp, lerp } from './utils.js';

const TWO_PI = Math.PI * 2;

// ─── Shared pointer source (for mouseX / mouseY automation) ──────────────
// Normalized 0..1 across the viewport; y is flipped so up = 1 (max).
const pointer = { x: 0.5, y: 0.5 };
let pointerBound = false;

function ensurePointerTracking() {
  if (pointerBound || typeof window === 'undefined') return;
  pointerBound = true;
  const update = (e) => {
    const cx = e.clientX ?? e.touches?.[0]?.clientX;
    const cy = e.clientY ?? e.touches?.[0]?.clientY;
    if (cx == null || cy == null) return;
    pointer.x = clamp(cx / window.innerWidth, 0, 1);
    pointer.y = clamp(1 - cy / window.innerHeight, 0, 1);
  };
  window.addEventListener('pointermove', update, { passive: true });
  window.addEventListener('touchmove', update, { passive: true });
}

export function isMouseAutomation(type) {
  return type === 'mouseX' || type === 'mouseY';
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
  if (isMouseAutomation(type)) ensurePointerTracking();

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

export class AutomationSet {
  constructor(setter) {
    this._setter = setter;
    this._items = new Map();
  }

  get size() {
    return this._items.size;
  }

  set(key, currentValue, options) {
    const item = normalizeAutomation(key, currentValue, options);
    this._items.set(key, item);
    return this.get(key);
  }

  has(key) {
    return this._items.has(key);
  }

  get(key) {
    const item = this._items.get(key);
    return item ? { ...item } : null;
  }

  all() {
    const out = {};
    for (const [key, item] of this._items) out[key] = { ...item };
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
    if (restore) this._setter(key, item.base, true);
    return true;
  }

  clear(restore = true) {
    for (const key of [...this._items.keys()]) this.delete(key, restore);
  }

  apply(time) {
    if (this._items.size === 0) return;
    for (const [key, item] of this._items) {
      this._setter(key, this._valueAt(item, time), true);
    }
  }

  _valueAt(item, time) {
    const cycle = time * item.rate + item.phase;
    const min = item.min;
    const max = item.max;
    let n;

    switch (item.type) {
      case 'triangle': {
        const f = ((cycle % 1) + 1) % 1;
        n = f < 0.5 ? f * 2 : 2 - f * 2;
        break;
      }
      case 'noise':
        n = noise(item.seed, cycle);
        break;
      case 'mouseX':
        n = pointer.x;
        break;
      case 'mouseY':
        n = pointer.y;
        break;
      case 'sine':
      default:
        n = (Math.sin(cycle * TWO_PI) + 1) / 2;
        break;
    }

    return lerp(min, max, n);
  }
}
