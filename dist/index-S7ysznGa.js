class j {
  constructor() {
    this._listeners = {};
  }
  on(t, e) {
    return this._listeners[t] || (this._listeners[t] = []), this._listeners[t].push(e), this;
  }
  off(t, e) {
    const s = this._listeners[t];
    return s ? (this._listeners[t] = s.filter((n) => n !== e), this) : this;
  }
  emit(t, ...e) {
    const s = this._listeners[t];
    if (s) for (const n of s) n(...e);
  }
}
const x = {
  enabled: !0,
  fontSize: 16,
  density: 1,
  charset: "density",
  colorScheme: "rainbow",
  background: "#08080c",
  fade: 0,
  speed: 1,
  pattern: null,
  patternMix: 0,
  colorCycle: !1,
  colorCycleRate: 0.5,
  sourceOpacity: 0,
  opacity: 1,
  blendMode: "replace",
  offsetX: 0,
  offsetY: 0,
  zIndex: 0,
  // Edge detection (per-layer)
  edgeDetect: !1,
  edgeThreshold: 0.15,
  edgeCharset: "box-light",
  // CRT post-processing (global)
  crtEnabled: !1,
  crtScanlines: 0.3,
  crtGlow: 0,
  crtDistortion: 0,
  crtFlicker: 0
}, N = {
  fontSize: { min: 1, max: 48, step: 0.5 },
  density: { min: 1, max: 4, step: 0.25 },
  fade: { min: 0, max: 1, step: 0.01 },
  speed: { min: 0.1, max: 5, step: 0.1 },
  patternMix: { min: 0, max: 1, step: 0.01 },
  colorCycleRate: { min: 0.1, max: 4, step: 0.1 },
  sourceOpacity: { min: 0, max: 1, step: 0.01 },
  opacity: { min: 0, max: 1, step: 0.01 },
  offsetX: { min: -2e3, max: 2e3, step: 1 },
  offsetY: { min: -2e3, max: 2e3, step: 1 },
  zIndex: { min: -100, max: 100, step: 1 },
  // Edge detection
  edgeThreshold: { min: 0, max: 1, step: 0.01 },
  // CRT
  crtScanlines: { min: 0, max: 1, step: 0.01 },
  crtGlow: { min: 0, max: 1, step: 0.01 },
  crtDistortion: { min: 0, max: 0.5, step: 0.01 },
  crtFlicker: { min: 0, max: 0.3, step: 0.01 }
}, F = [
  { name: "density", chars: " .·:;=+*#%@" },
  { name: "blocks", chars: " ░▒▓█" },
  { name: "braille", chars: "⠀⠁⠃⠇⠏⠟⠿⣿" },
  { name: "minimal", chars: " ·+*#" },
  { name: "binary", chars: " 01" }
], P = [
  {
    name: "box-light",
    chars: { h: "─", v: "│", dr: "┌", dl: "┐", ur: "└", ul: "┘", cross: "┼", diagR: "╱", diagL: "╲" }
  },
  {
    name: "box-heavy",
    chars: { h: "━", v: "┃", dr: "┏", dl: "┓", ur: "┗", ul: "┛", cross: "╋", diagR: "╱", diagL: "╲" }
  },
  {
    name: "box-double",
    chars: { h: "═", v: "║", dr: "╔", dl: "╗", ur: "╚", ul: "╝", cross: "╬", diagR: "╱", diagL: "╲" }
  },
  {
    name: "ascii",
    chars: { h: "-", v: "|", dr: "+", dl: "+", ur: "+", ul: "+", cross: "+", diagR: "/", diagL: "\\" }
  }
], E = [
  {
    name: "rainbow",
    fn: (a, t) => [(a * 360 + t * 40) % 360, 85, 35 + a * 40]
  },
  {
    name: "neon",
    fn: (a, t) => [[300, 180, 60][Math.floor(a * 2.99)] + Math.sin(t) * 20, 100, 40 + a * 30]
  },
  {
    name: "fire",
    fn: (a, t) => [a * 60 + Math.sin(t) * 10, 80 + a * 20, 15 + a * 55]
  },
  {
    name: "ocean",
    fn: (a, t) => [180 + a * 60 + Math.sin(t * 0.5) * 20, 75, 20 + a * 50]
  },
  {
    name: "acid",
    fn: (a, t) => [80 + a * 80 + Math.sin(t * 2) * 30, 100, 25 + a * 45]
  },
  {
    name: "vapor",
    fn: (a, t) => [260 + a * 100 + t * 25, 80, 35 + a * 40]
  },
  {
    name: "mono",
    fn: (a) => [0, 0, a * 85]
  }
], B = [
  {
    name: "plasma",
    fn(a, t, e, s, n, o) {
      const i = t * o, r = s / 2, c = n * o / 2;
      let h = Math.sin(a * 0.04 + e);
      return h += Math.sin(i * 0.03 + e * 1.3), h += Math.sin((a + i) * 0.025 + e * 0.7), h += Math.sin(Math.sqrt((a - r) ** 2 + (i - c) ** 2) * 0.04 + e * 1.1), (h + 4) / 8;
    }
  },
  {
    name: "spiral",
    fn(a, t, e, s, n, o) {
      const i = a - s / 2, r = t * o - n * o / 2, c = Math.sqrt(i * i + r * r), h = Math.atan2(r, i);
      return (Math.sin(h * 3 + c * 0.12 - e * 2) + 1) / 2;
    }
  },
  {
    name: "tunnel",
    fn(a, t, e, s, n, o) {
      const i = a - s / 2, r = t * o - n * o / 2, c = Math.max(Math.sqrt(i * i + r * r), 0.5), h = Math.atan2(r, i);
      return (Math.sin(30 / c + h * 2 + e * 3) + 1) / 2;
    }
  },
  {
    name: "waves",
    fn(a, t, e, s, n, o) {
      const i = t * o, r = [
        [s * 0.2, n * o * 0.3],
        [s * 0.8, n * o * 0.3],
        [s * 0.5, n * o * 0.8]
      ];
      let c = 0;
      for (const [h, _] of r)
        c += Math.sin(Math.sqrt((a - h) ** 2 + (i - _) ** 2) * 0.2 - e * 3);
      return (c / 3 + 1) / 2;
    }
  },
  {
    name: "kaleidoscope",
    fn(a, t, e, s, n, o) {
      const i = Math.abs(a - s / 2), r = Math.abs(t * o - n * o / 2), c = Math.sqrt(i * i + r * r), h = Math.PI / 6, _ = (Math.atan2(r, i) % h + h) % h, m = Math.cos(_) * c, f = Math.sin(_) * c;
      let l = Math.sin(m * 0.08 + e) * Math.cos(f * 0.08 + e * 0.7);
      return l += Math.sin(c * 0.06 - e * 1.5), (l + 2) / 4;
    }
  },
  {
    name: "diamond",
    fn(a, t, e, s, n, o) {
      const i = Math.abs(a - s / 2) + Math.abs(t * o - n * o / 2);
      return (Math.sin(i * 0.1 - e * 2) + Math.sin(i * 0.06 + e) + 2) / 4;
    }
  },
  {
    name: "moiré",
    fn(a, t, e, s, n, o) {
      const i = t * o, r = Math.sin(a * 0.1 + e * 0.5) + Math.sin(i * 0.1), c = Math.sin((a * Math.cos(e * 0.3) + i * Math.sin(e * 0.3)) * 0.1), h = Math.sin((a * Math.cos(e * 0.3 + 2) + i * Math.sin(e * 0.3 + 2)) * 0.08);
      return (r + c + h + 3) / 6;
    }
  },
  {
    name: "breathing",
    fn(a, t, e, s, n, o) {
      const i = a - s / 2, r = t * o - n * o / 2, c = Math.sqrt(i * i + r * r), h = Math.atan2(r, i), _ = Math.sin(e * 1.2) * 8 + 20, m = Math.sin(h * 5 + e * 2) * 3, f = Math.exp(-((c - _ - m) ** 2) / 60), l = (Math.sin(a * 0.1 + e * 0.5) * Math.sin(t * o * 0.08 + e * 0.3) + 1) * 0.08;
      return Math.min(1, f + l);
    }
  }
];
function $(a, t, e, s) {
  if (!A) {
    const h = document.createElement("canvas");
    h.width = 1, h.height = 1, A = h.getContext("2d");
  }
  A.font = `${e}px monospace`;
  const n = A.measureText("M").width * s, o = e * 1.35 * s, i = o / n, r = Math.floor(a / n), c = Math.floor(t / o);
  return { cols: r, rows: c, cw: n, ch: o, ar: i };
}
let A = null;
function q(a, t, e, s) {
  if (t <= 0 || e <= 0)
    return { brightness: new Float32Array(0), ctx: s };
  s || (s = document.createElement("canvas").getContext("2d", { willReadFrequently: !0 }));
  const n = s.canvas;
  (n.width !== t || n.height !== e) && (n.width = t, n.height = e), s.drawImage(a, 0, 0, t, e);
  const i = s.getImageData(0, 0, t, e).data, r = t * e, c = new Float32Array(r);
  for (let h = 0; h < r; h++) {
    const _ = h * 4;
    c[h] = (i[_] * 0.299 + i[_ + 1] * 0.587 + i[_ + 2] * 0.114) / 255;
  }
  return { brightness: c, ctx: s };
}
function G(a, t, e, s, n) {
  if (t <= 0 || e <= 0)
    return { magnitude: new Float32Array(0), direction: new Float32Array(0), ctx: s };
  s || (s = document.createElement("canvas").getContext("2d", { willReadFrequently: !0 }));
  const o = s.canvas;
  (o.width !== t || o.height !== e) && (o.width = t, o.height = e), s.drawImage(a, 0, 0, t, e);
  const r = s.getImageData(0, 0, t, e).data, c = t * e, h = new Float32Array(c);
  for (let l = 0; l < c; l++) {
    const d = l * 4;
    h[l] = (r[d] * 0.299 + r[d + 1] * 0.587 + r[d + 2] * 0.114) / 255;
  }
  const _ = new Float32Array(c), m = new Float32Array(c);
  let f = 0;
  for (let l = 0; l < e; l++)
    for (let d = 0; d < t; d++) {
      const u = l > 0 && d > 0 ? h[(l - 1) * t + d - 1] : 0, p = l > 0 ? h[(l - 1) * t + d] : 0, g = l > 0 && d < t - 1 ? h[(l - 1) * t + d + 1] : 0, y = d > 0 ? h[l * t + d - 1] : 0, M = d < t - 1 ? h[l * t + d + 1] : 0, b = l < e - 1 && d > 0 ? h[(l + 1) * t + d - 1] : 0, v = l < e - 1 ? h[(l + 1) * t + d] : 0, C = l < e - 1 && d < t - 1 ? h[(l + 1) * t + d + 1] : 0, S = -u + g - 2 * y + 2 * M - b + C, I = -u - 2 * p - g + b + 2 * v + C, w = Math.sqrt(S * S + I * I);
      _[l * t + d] = w, m[l * t + d] = Math.atan2(I, S), w > f && (f = w);
    }
  if (f > 0) {
    const l = 1 / f;
    for (let d = 0; d < c; d++)
      _[d] *= l, _[d] < n && (_[d] = 0);
  }
  return { magnitude: _, direction: m, ctx: s };
}
function U(a, t, e) {
  return a < t ? t : a > e ? e : a;
}
function H(a, t, e) {
  return a + (t - a) * e;
}
function K(a, t, e) {
  let s = t - a;
  return s > 180 && (s -= 360), s < -180 && (s += 360), ((a + s * e) % 360 + 360) % 360;
}
function O(a, t, e, s) {
  const n = new Array(t), o = t - 1;
  if (s.cycling) {
    const i = s.phase, r = Math.floor(i) % E.length, c = (r + 1) % E.length, h = i - Math.floor(i), _ = E[r], m = E[c];
    for (let f = 0; f < t; f++) {
      const l = o > 0 ? f / o : 0, [d, u, p] = _.fn(l, e), [g, y, M] = m.fn(l, e), b = K(d, g, h), v = u + (y - u) * h, C = p + (M - p) * h;
      n[f] = `hsl(${b} ${v}% ${C}%)`;
    }
  } else {
    const i = E[a];
    for (let r = 0; r < t; r++) {
      const c = o > 0 ? r / o : 0, [h, _, m] = i.fn(c, e);
      n[r] = `hsl(${h} ${_}% ${m}%)`;
    }
  }
  return n;
}
function X(a, t, e, s, n, o, i) {
  const { cols: r, rows: c, cw: h, ch: _, ar: m } = e, f = n.length - 1;
  a.textBaseline = "top";
  for (let l = 0; l < c; l++) {
    const d = l * _;
    for (let u = 0; u < r; u++) {
      let p = t[l * r + u];
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      const g = p * f | 0;
      if (g !== 0) {
        if (o > 0) {
          const y = 1 - o * (1 - V(u, l, i, m));
          if (y < 0.02) continue;
          a.globalAlpha = y;
        }
        a.fillStyle = s[g], a.fillText(n[g], u * h, d);
      }
    }
  }
  a.globalAlpha = 1;
}
function V(a, t, e, s) {
  const n = t * s;
  let o = Math.sin(a * 0.06 - e * 0.8);
  return o += Math.sin(n * 0.05 + e * 1.1), o += Math.sin((a + n) * 0.04 - e * 0.5), (o + 3) / 6;
}
function Y(a, t, e, s, n, o, i, r) {
  const { cols: c, rows: h, cw: _, ch: m, ar: f } = s, l = n.length - 1;
  a.textBaseline = "top";
  for (let d = 0; d < h; d++) {
    const u = d * m;
    for (let p = 0; p < c; p++) {
      const g = d * c + p, y = t[g];
      if (y < 0.02) continue;
      if (i > 0) {
        const v = 1 - i * (1 - J(p, d, r, f));
        if (v < 0.02) continue;
        a.globalAlpha = v;
      }
      const M = W(t, e, p, d, c, h, o), b = y * l | 0;
      a.fillStyle = n[b], a.fillText(M, p * _, u);
    }
  }
  a.globalAlpha = 1;
}
function W(a, t, e, s, n, o, i) {
  const r = k(t[s * n + e]), c = s > 0 && a[(s - 1) * n + e] > 0.02, h = s < o - 1 && a[(s + 1) * n + e] > 0.02, _ = e > 0 && a[s * n + e - 1] > 0.02, m = e < n - 1 && a[s * n + e + 1] > 0.02, f = (c ? 1 : 0) + (h ? 1 : 0), l = (_ ? 1 : 0) + (m ? 1 : 0);
  if (f >= 1 && l >= 1 && c && h && _ && m)
    return i.cross;
  if (h && m && !c && !_) return i.dr;
  if (h && _ && !c && !m) return i.dl;
  if (c && m && !h && !_) return i.ur;
  if (c && _ && !h && !m) return i.ul;
  switch (r) {
    case 0:
      return i.h;
    case 1:
      return i.diagR;
    case 2:
      return i.v;
    case 3:
      return i.diagL;
    default:
      return i.h;
  }
}
function k(a) {
  let t = (a * 180 / Math.PI + 90 + 180) % 180;
  return t < 22.5 || t >= 157.5 ? 0 : t < 67.5 ? 1 : t < 112.5 ? 2 : 3;
}
function J(a, t, e, s) {
  const n = t * s;
  let o = Math.sin(a * 0.06 - e * 0.8);
  return o += Math.sin(n * 0.05 + e * 1.1), o += Math.sin((a + n) * 0.04 - e * 0.5), (o + 3) / 6;
}
class Q {
  constructor() {
    this._glowCanvas = null, this._glowCtx = null, this._distCanvas = null, this._distCtx = null;
  }
  /**
   * Apply CRT effects to the canvas.
   * @param {CanvasRenderingContext2D} ctx - the main overlay canvas context
   * @param {HTMLCanvasElement} canvas - the main overlay canvas element
   * @param {number} time - animation time
   * @param {{ scanlines: number, glow: number, distortion: number, flicker: number }} params
   */
  apply(t, e, s, n) {
    const o = e.width, i = e.height;
    n.glow > 0 && this._applyGlow(t, e, o, i, n.glow), n.distortion > 0 && this._applyDistortion(t, e, o, i, n.distortion), n.scanlines > 0 && this._applyScanlines(t, o, i, n.scanlines), n.flicker > 0 && this._applyFlicker(t, o, i, s, n.flicker);
  }
  /**
   * Phosphor glow / bloom — blur a copy and composite additively.
   */
  _applyGlow(t, e, s, n, o) {
    this._glowCanvas || (this._glowCanvas = document.createElement("canvas"), this._glowCtx = this._glowCanvas.getContext("2d"));
    const i = s / 2 | 0, r = n / 2 | 0;
    (this._glowCanvas.width !== i || this._glowCanvas.height !== r) && (this._glowCanvas.width = i, this._glowCanvas.height = r);
    const c = this._glowCtx;
    c.clearRect(0, 0, i, r), c.drawImage(e, 0, 0, i, r);
    const h = Math.max(2, o * 12) | 0;
    c.filter = `blur(${h}px)`, c.drawImage(this._glowCanvas, 0, 0), c.filter = "none", t.save(), t.resetTransform(), t.globalCompositeOperation = "lighter", t.globalAlpha = o * 0.6, t.drawImage(this._glowCanvas, 0, 0, s, n), t.restore();
  }
  /**
   * Barrel distortion — warp pixels radially from center.
   */
  _applyDistortion(t, e, s, n, o) {
    const r = s * 0.5 | 0, c = n * 0.5 | 0;
    this._distCanvas || (this._distCanvas = document.createElement("canvas"), this._distCtx = this._distCanvas.getContext("2d", { willReadFrequently: !0 })), (this._distCanvas.width !== r || this._distCanvas.height !== c) && (this._distCanvas.width = r, this._distCanvas.height = c);
    const h = this._distCtx;
    h.clearRect(0, 0, r, c), h.drawImage(e, 0, 0, r, c);
    const _ = h.getImageData(0, 0, r, c), m = h.createImageData(r, c), f = _.data, l = m.data, d = r / 2, u = c / 2, p = Math.sqrt(d * d + u * u), g = o * 2;
    for (let y = 0; y < c; y++)
      for (let M = 0; M < r; M++) {
        const b = (M - d) / p, v = (y - u) / p, C = Math.sqrt(b * b + v * v), S = C * (1 + g * C * C), I = b / (C || 1) * S * p + d, w = v / (C || 1) * S * p + u, T = (y * r + M) * 4, L = Math.round(I), R = Math.round(w);
        if (L >= 0 && L < r && R >= 0 && R < c) {
          const z = (R * r + L) * 4;
          l[T] = f[z], l[T + 1] = f[z + 1], l[T + 2] = f[z + 2], l[T + 3] = f[z + 3];
        }
      }
    h.putImageData(m, 0, 0), t.save(), t.resetTransform(), t.clearRect(0, 0, s, n), t.drawImage(this._distCanvas, 0, 0, s, n), t.restore();
  }
  /**
   * Scanlines — semi-transparent dark horizontal bars.
   */
  _applyScanlines(t, e, s, n) {
    t.save(), t.resetTransform(), t.globalCompositeOperation = "multiply";
    const o = 3, i = n * 0.5;
    t.fillStyle = `rgba(0,0,0,${i})`;
    for (let r = 0; r < s; r += o)
      t.fillRect(0, r, e, 1);
    t.restore();
  }
  /**
   * Flicker — deterministic brightness variation per frame.
   * Uses sine waves instead of Math.random() for reproducible output.
   */
  _applyFlicker(t, e, s, n, o) {
    const i = (Math.sin(n * 47.3) * 0.5 + Math.sin(n * 73.1) * 0.5) * 0.5 + 0.5, r = o * i;
    r < 5e-3 || (t.save(), t.resetTransform(), t.globalCompositeOperation = "source-over", t.globalAlpha = r, t.fillStyle = "#000", t.fillRect(0, 0, e, s), t.restore());
  }
  destroy() {
    this._glowCanvas = null, this._glowCtx = null, this._distCanvas = null, this._distCtx = null;
  }
}
class it extends j {
  /**
   * @param {HTMLCanvasElement} sourceCanvas - the canvas to ASCII-ify
   * @param {object} [options] - configuration options
   */
  constructor(t, e = {}) {
    super(), this._source = t, this._running = !1, this._rafId = null, this._prevTime = 0, this._time = 0, this._colorPhase = 0, this._panel = null, this._transitioning = !1, this._enableTimer = null, this._params = { ...x, ...e }, this._layers = [], this._implicitMode = !0, this._soloLayer = null, this._sampleCtx = null, this._crt = null, this._canvas = document.createElement("canvas"), this._canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;", this._ctx = this._canvas.getContext("2d");
    const s = t.parentElement;
    s && (getComputedStyle(s).position === "static" && (s.style.position = "relative"), s.insertBefore(this._canvas, t.nextSibling)), this._updateSourceOpacity(), this._resizeObserver = new ResizeObserver(() => this._handleResize()), this._resizeObserver.observe(t), this._grid = null, this._handleResize();
  }
  /** The overlay canvas element */
  get canvas() {
    return this._canvas;
  }
  /** Readonly array of layers (bottom-to-top) */
  get layers() {
    return [...this._layers];
  }
  /**
   * Get a parameter value.
   * @param {string} key
   * @returns {*}
   */
  get(t) {
    return this._params[t];
  }
  /**
   * Set parameter(s).
   * @param {string|object} key - parameter name or { key: value } batch
   * @param {*} [value]
   */
  set(t, e) {
    if (typeof t == "object")
      for (const [s, n] of Object.entries(t)) this._setOne(s, n);
    else
      this._setOne(t, e);
  }
  _setOne(t, e) {
    const s = N[t];
    s && (e = U(e, s.min, s.max));
    const n = this._params[t];
    this._params[t] = e, t === "enabled" && this._updateEnabled(), t === "sourceOpacity" && this._updateSourceOpacity(), (t === "fontSize" || t === "density") && this._handleResize(), this._implicitMode && this._layers.length > 0 && ["fontSize", "density", "charset", "colorScheme", "pattern", "patternMix", "fade", "opacity", "blendMode", "offsetX", "offsetY", "zIndex", "edgeDetect", "edgeThreshold", "edgeCharset"].includes(t) && this._layers[0].set(t, e), n !== e && this.emit("paramchange", { key: t, value: e });
  }
  /**
   * Add a compositing layer.
   * @param {object} [options]
   * @returns {Layer}
   */
  addLayer(t = {}) {
    const e = Z();
    if (this._implicitMode && this._layers.length > 0)
      this._implicitMode = !1;
    else if (this._implicitMode && this._layers.length === 0) {
      const n = new e(this, {
        source: this._source,
        fontSize: this._params.fontSize,
        density: this._params.density,
        charset: this._params.charset,
        colorScheme: this._params.colorScheme,
        pattern: this._params.pattern,
        patternMix: this._params.patternMix,
        fade: this._params.fade,
        opacity: this._params.opacity,
        blendMode: "replace"
      });
      this._layers.push(n), this._implicitMode = !1;
    }
    const s = new e(this, {
      source: t.source || this._source,
      ...t
    });
    return this._layers.push(s), this.emit("layeradd", s), s;
  }
  /**
   * Remove a compositing layer.
   * @param {Layer} layer
   */
  removeLayer(t) {
    const e = this._layers.indexOf(t);
    e >= 0 && (this._soloLayer === t && (this._soloLayer = null), this._layers.splice(e, 1), t.destroy(), this.emit("layerremove", t));
  }
  /**
   * Solo a layer — only this layer will render.
   * Call again with the same layer (or null) to unsolo.
   * @param {Layer|null} layer
   */
  soloLayer(t) {
    this._soloLayer = this._soloLayer === t ? null : t, this.emit("paramchange", { key: "soloLayer", value: this._soloLayer });
  }
  /** Render a single frame */
  render() {
    const t = performance.now(), e = this._prevTime ? Math.min((t - this._prevTime) / 1e3, 0.05) : 0;
    this._prevTime = t, this._time += e * this._params.speed, this._params.colorCycle && (this._colorPhase += e * this._params.colorCycleRate), this._renderFrame(), this.emit("render", { time: this._time, dt: e });
  }
  /** Start the rAF loop */
  start() {
    if (this._running) return;
    this._running = !0, this._prevTime = performance.now();
    const t = () => {
      this._running && (this.render(), this._rafId = requestAnimationFrame(t));
    };
    this._rafId = requestAnimationFrame(t);
  }
  /** Stop the rAF loop */
  stop() {
    this._running = !1, this._rafId && (cancelAnimationFrame(this._rafId), this._rafId = null);
  }
  /** Show the built-in control panel */
  showPanel(t = {}) {
    if (this._panel) {
      this._panel.show();
      return;
    }
    import("./panel-suEH_esZ.js").then(({ ControlPanel: e }) => {
      this._panel = new e(this, t), this._panel.show();
    });
  }
  /** Hide the control panel */
  hidePanel() {
    this._panel && this._panel.hide();
  }
  /** Toggle the control panel visibility */
  togglePanel() {
    this._panel ? this._panel.toggle() : this.showPanel();
  }
  /** Destroy the instance — remove overlay, detach observers, stop loop */
  destroy() {
    this.stop(), clearTimeout(this._enableTimer), this._crt && (this._crt.destroy(), this._crt = null), this._panel && (this._panel.destroy(), this._panel = null), this._resizeObserver.disconnect(), this._canvas.parentElement && this._canvas.parentElement.removeChild(this._canvas), this._source.style.opacity = "";
    for (const t of this._layers) t.destroy();
    this._layers = [];
  }
  // ─── Internal ──────────────────────────────────────────
  _updateEnabled() {
    clearTimeout(this._enableTimer);
    const t = 700;
    this._params.enabled ? (this._canvas.style.display = "", this._canvas.style.opacity = "0", this._canvas.offsetHeight, this._canvas.style.transition = `opacity ${t}ms ease`, this._canvas.style.opacity = "1", this._source.style.transition = `opacity ${t}ms ease`, this._source.style.opacity = String(this._params.sourceOpacity), this._transitioning = !0, this._enableTimer = setTimeout(() => {
      this._canvas.style.transition = "", this._source.style.transition = "", this._transitioning = !1;
    }, t)) : (this._canvas.style.transition = `opacity ${t}ms ease`, this._canvas.style.opacity = "0", this._source.style.transition = `opacity ${t}ms ease`, this._source.style.opacity = "1", this._transitioning = !0, this._enableTimer = setTimeout(() => {
      this._canvas.style.display = "none", this._canvas.style.transition = "", this._source.style.transition = "", this._transitioning = !1;
    }, t));
  }
  _updateSourceOpacity() {
    this._params.enabled && (this._source.style.opacity = String(this._params.sourceOpacity));
  }
  _handleResize() {
    const t = this._source.offsetWidth || this._source.width, e = this._source.offsetHeight || this._source.height, s = devicePixelRatio || 1;
    this._canvas.width = t * s, this._canvas.height = e * s, this._canvas.style.width = t + "px", this._canvas.style.height = e + "px", this._ctx.setTransform(s, 0, 0, s, 0, 0), this._grid = $(t, e, this._params.fontSize, this._params.density), this._width = t, this._height = e, this.emit("resize", { cols: this._grid.cols, rows: this._grid.rows });
  }
  _renderFrame() {
    if (!this._params.enabled && !this._transitioning) return;
    const t = this._ctx, e = this._width, s = this._height, n = this._time;
    t.fillStyle = this._params.background, t.fillRect(0, 0, e, s), this._layers.length === 0 ? this._renderImplicit(t, e, s, n) : this._renderLayers(t, e, s, n), this._params.crtEnabled && (this._crt || (this._crt = new Q()), this._crt.apply(t, this._canvas, n, {
      scanlines: this._params.crtScanlines,
      glow: this._params.crtGlow,
      distortion: this._params.crtDistortion,
      flicker: this._params.crtFlicker
    }));
  }
  _renderImplicit(t, e, s, n) {
    const o = this._grid;
    if (o.cols <= 0 || o.rows <= 0) return;
    const i = this._resolveSchemeIndex(this._params.colorScheme);
    if (t.font = `${this._params.fontSize}px monospace`, this._params.edgeDetect) {
      const { magnitude: f, direction: l, ctx: d } = G(
        this._source,
        o.cols,
        o.rows,
        this._sampleCtx,
        this._params.edgeThreshold
      );
      this._sampleCtx = d;
      const u = this._resolveEdgeCharset(this._params.edgeCharset), p = O(i, 256, n, {
        cycling: this._params.colorCycle,
        phase: this._colorPhase
      });
      Y(t, f, l, o, p, u, this._params.fade, n);
      return;
    }
    const r = this._resolveChars(this._params.charset), { brightness: c, ctx: h } = q(this._source, o.cols, o.rows, this._sampleCtx);
    this._sampleCtx = h;
    const _ = this._params.pattern;
    if (_) {
      const f = this._resolvePattern(_);
      if (f) {
        const l = this._params.patternMix;
        for (let d = 0; d < o.rows; d++)
          for (let u = 0; u < o.cols; u++) {
            const p = d * o.cols + u, g = f(u, d, n, o.cols, o.rows, o.ar);
            c[p] = H(c[p], g, l);
          }
      }
    }
    const m = O(i, r.length, n, {
      cycling: this._params.colorCycle,
      phase: this._colorPhase
    });
    X(t, c, o, m, r, this._params.fade, n);
  }
  _renderLayers(t, e, s, n) {
    const o = [...this._layers].sort((i, r) => (i.get("zIndex") || 0) - (r.get("zIndex") || 0));
    for (const i of o) {
      if (this._soloLayer ? i !== this._soloLayer : !i.visible) continue;
      const r = $(e, s, i.get("fontSize"), i.get("density"));
      if (r.cols <= 0 || r.rows <= 0) continue;
      const c = i.source || this._source, h = i.get("colorScheme") || this._params.colorScheme, _ = this._resolveSchemeIndex(h), m = i.get("fade") ?? this._params.fade, f = i._ensureOffscreen(e, s), l = i._offCtx;
      if (l.clearRect(0, 0, e, s), l.font = `${i.get("fontSize")}px monospace`, i.get("edgeDetect")) {
        const { magnitude: g, direction: y, ctx: M } = G(
          c,
          r.cols,
          r.rows,
          i._sampleCtx,
          i.get("edgeThreshold")
        );
        i._sampleCtx = M;
        const b = this._resolveEdgeCharset(i.get("edgeCharset") || this._params.edgeCharset), v = O(_, 256, n, {
          cycling: this._params.colorCycle,
          phase: this._colorPhase
        });
        Y(l, g, y, r, v, b, m, n);
      } else {
        const { brightness: g, ctx: y } = q(c, r.cols, r.rows, i._sampleCtx);
        i._sampleCtx = y;
        const M = i.get("pattern");
        if (M) {
          const S = this._resolvePattern(M);
          if (S) {
            const I = i.get("patternMix");
            for (let w = 0; w < r.rows; w++)
              for (let T = 0; T < r.cols; T++) {
                const L = w * r.cols + T, R = S(T, w, n, r.cols, r.rows, r.ar);
                g[L] = H(g[L], R, I);
              }
          }
        }
        const b = i.get("charset") || this._params.charset, v = this._resolveChars(b), C = O(_, v.length, n, {
          cycling: this._params.colorCycle,
          phase: this._colorPhase
        });
        X(l, g, r, C, v, m, n);
      }
      const d = i.get("blendMode") || "replace";
      t.globalAlpha = i.get("opacity") ?? 1, t.globalCompositeOperation = d === "add" ? "lighter" : "source-over";
      const u = i.get("offsetX") || 0, p = i.get("offsetY") || 0;
      t.drawImage(f, u, p, e, s);
    }
    t.globalAlpha = 1, t.globalCompositeOperation = "source-over";
  }
  _resolveEdgeCharset(t) {
    const e = P.find((s) => s.name === t);
    return e ? e.chars : P[0].chars;
  }
  _resolveChars(t) {
    if (typeof t == "string") {
      const e = F.find((s) => s.name === t);
      return e ? e.chars : t;
    }
    return F[0].chars;
  }
  _resolveSchemeIndex(t) {
    if (typeof t == "number") return t;
    const e = E.findIndex((s) => s.name === t);
    return e >= 0 ? e : 0;
  }
  _resolvePattern(t) {
    const e = B.find((s) => s.name === t);
    return e ? e.fn : null;
  }
}
let D = null;
function Z() {
  if (!D)
    throw new Error("Layer system not initialized. Import layer.js first.");
  return D;
}
function tt(a) {
  D = a;
}
let et = 1;
class st {
  /**
   * @param {import('./ascii-ify.js').AsciiIfy} parent
   * @param {object} options
   */
  constructor(t, e = {}) {
    this.id = et++, this._parent = t, this.visible = e.visible ?? !0, this.source = e.source || null, this._params = {
      fontSize: e.fontSize ?? x.fontSize,
      density: e.density ?? x.density,
      charset: e.charset ?? null,
      colorScheme: e.colorScheme ?? null,
      pattern: e.pattern ?? x.pattern,
      patternMix: e.patternMix ?? x.patternMix,
      fade: e.fade ?? null,
      opacity: e.opacity ?? x.opacity,
      blendMode: e.blendMode ?? x.blendMode,
      offsetX: e.offsetX ?? x.offsetX,
      offsetY: e.offsetY ?? x.offsetY,
      zIndex: e.zIndex ?? x.zIndex,
      edgeDetect: e.edgeDetect ?? x.edgeDetect,
      edgeThreshold: e.edgeThreshold ?? x.edgeThreshold,
      edgeCharset: e.edgeCharset ?? x.edgeCharset
    }, this._sampleCtx = null, this._offscreen = null, this._offCtx = null;
  }
  /**
   * Get a parameter value.
   * @param {string} key
   * @returns {*}
   */
  get(t) {
    return t === "visible" ? this.visible : t === "source" ? this.source : this._params[t];
  }
  /**
   * Set parameter(s).
   * @param {string|object} key
   * @param {*} [value]
   */
  set(t, e) {
    if (typeof t == "object")
      for (const [s, n] of Object.entries(t)) this._setOne(s, n);
    else
      this._setOne(t, e);
  }
  _setOne(t, e) {
    if (t === "visible") {
      this.visible = !!e;
      return;
    }
    if (t === "source") {
      this.source = e;
      return;
    }
    const s = N[t];
    s && (e = U(e, s.min, s.max)), this._params[t] = e;
  }
  /** @internal Ensure the offscreen canvas exists at the right size */
  _ensureOffscreen(t, e) {
    if (this._offscreen || (this._offscreen = document.createElement("canvas"), this._offCtx = this._offscreen.getContext("2d")), this._offscreen.width !== t || this._offscreen.height !== e) {
      const s = devicePixelRatio || 1;
      this._offscreen.width = t * s, this._offscreen.height = e * s, this._offCtx.setTransform(s, 0, 0, s, 0, 0);
    }
    return this._offscreen;
  }
  /** @internal Cleanup */
  destroy() {
    this._offscreen = null, this._offCtx = null, this._sampleCtx = null, this._parent = null;
  }
}
tt(st);
export {
  it as A,
  F as C,
  P as E,
  st as L,
  N as P,
  E as a,
  B as b
};
//# sourceMappingURL=index-S7ysznGa.js.map
