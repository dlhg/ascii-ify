class j {
  constructor() {
    this._listeners = {};
  }
  on(t, e) {
    return this._listeners[t] || (this._listeners[t] = []), this._listeners[t].push(e), this;
  }
  off(t, e) {
    const s = this._listeners[t];
    return s ? (this._listeners[t] = s.filter((r) => r !== e), this) : this;
  }
  emit(t, ...e) {
    const s = this._listeners[t];
    if (s) for (const r of s) r(...e);
  }
}
const M = {
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
  blendMode: "replace"
}, F = {
  fontSize: { min: 1, max: 48, step: 0.5 },
  density: { min: 1, max: 4, step: 0.25 },
  fade: { min: 0, max: 1, step: 0.01 },
  speed: { min: 0.1, max: 5, step: 0.1 },
  patternMix: { min: 0, max: 1, step: 0.01 },
  colorCycleRate: { min: 0.1, max: 4, step: 0.1 },
  sourceOpacity: { min: 0, max: 1, step: 0.01 },
  opacity: { min: 0, max: 1, step: 0.01 }
}, A = [
  { name: "density", chars: " .·:;=+*#%@" },
  { name: "blocks", chars: " ░▒▓█" },
  { name: "braille", chars: "⠀⠁⠃⠇⠏⠟⠿⣿" },
  { name: "minimal", chars: " ·+*#" },
  { name: "binary", chars: " 01" }
], b = [
  {
    name: "rainbow",
    fn: (i, t) => [(i * 360 + t * 40) % 360, 85, 35 + i * 40]
  },
  {
    name: "neon",
    fn: (i, t) => [[300, 180, 60][Math.floor(i * 2.99)] + Math.sin(t) * 20, 100, 40 + i * 30]
  },
  {
    name: "fire",
    fn: (i, t) => [i * 60 + Math.sin(t) * 10, 80 + i * 20, 15 + i * 55]
  },
  {
    name: "ocean",
    fn: (i, t) => [180 + i * 60 + Math.sin(t * 0.5) * 20, 75, 20 + i * 50]
  },
  {
    name: "acid",
    fn: (i, t) => [80 + i * 80 + Math.sin(t * 2) * 30, 100, 25 + i * 45]
  },
  {
    name: "vapor",
    fn: (i, t) => [260 + i * 100 + t * 25, 80, 35 + i * 40]
  },
  {
    name: "mono",
    fn: (i) => [0, 0, i * 85]
  }
], H = [
  {
    name: "plasma",
    fn(i, t, e, s, r, n) {
      const a = t * n, o = s / 2, c = r * n / 2;
      let h = Math.sin(i * 0.04 + e);
      return h += Math.sin(a * 0.03 + e * 1.3), h += Math.sin((i + a) * 0.025 + e * 0.7), h += Math.sin(Math.sqrt((i - o) ** 2 + (a - c) ** 2) * 0.04 + e * 1.1), (h + 4) / 8;
    }
  },
  {
    name: "spiral",
    fn(i, t, e, s, r, n) {
      const a = i - s / 2, o = t * n - r * n / 2, c = Math.sqrt(a * a + o * o), h = Math.atan2(o, a);
      return (Math.sin(h * 3 + c * 0.12 - e * 2) + 1) / 2;
    }
  },
  {
    name: "tunnel",
    fn(i, t, e, s, r, n) {
      const a = i - s / 2, o = t * n - r * n / 2, c = Math.max(Math.sqrt(a * a + o * o), 0.5), h = Math.atan2(o, a);
      return (Math.sin(30 / c + h * 2 + e * 3) + 1) / 2;
    }
  },
  {
    name: "waves",
    fn(i, t, e, s, r, n) {
      const a = t * n, o = [
        [s * 0.2, r * n * 0.3],
        [s * 0.8, r * n * 0.3],
        [s * 0.5, r * n * 0.8]
      ];
      let c = 0;
      for (const [h, l] of o)
        c += Math.sin(Math.sqrt((i - h) ** 2 + (a - l) ** 2) * 0.2 - e * 3);
      return (c / 3 + 1) / 2;
    }
  },
  {
    name: "kaleidoscope",
    fn(i, t, e, s, r, n) {
      const a = Math.abs(i - s / 2), o = Math.abs(t * n - r * n / 2), c = Math.sqrt(a * a + o * o), h = Math.PI / 6, l = (Math.atan2(o, a) % h + h) % h, m = Math.cos(l) * c, _ = Math.sin(l) * c;
      let f = Math.sin(m * 0.08 + e) * Math.cos(_ * 0.08 + e * 0.7);
      return f += Math.sin(c * 0.06 - e * 1.5), (f + 2) / 4;
    }
  },
  {
    name: "diamond",
    fn(i, t, e, s, r, n) {
      const a = Math.abs(i - s / 2) + Math.abs(t * n - r * n / 2);
      return (Math.sin(a * 0.1 - e * 2) + Math.sin(a * 0.06 + e) + 2) / 4;
    }
  },
  {
    name: "moiré",
    fn(i, t, e, s, r, n) {
      const a = t * n, o = Math.sin(i * 0.1 + e * 0.5) + Math.sin(a * 0.1), c = Math.sin((i * Math.cos(e * 0.3) + a * Math.sin(e * 0.3)) * 0.1), h = Math.sin((i * Math.cos(e * 0.3 + 2) + a * Math.sin(e * 0.3 + 2)) * 0.08);
      return (o + c + h + 3) / 6;
    }
  },
  {
    name: "breathing",
    fn(i, t, e, s, r, n) {
      const a = i - s / 2, o = t * n - r * n / 2, c = Math.sqrt(a * a + o * o), h = Math.atan2(o, a), l = Math.sin(e * 1.2) * 8 + 20, m = Math.sin(h * 5 + e * 2) * 3, _ = Math.exp(-((c - l - m) ** 2) / 60), f = (Math.sin(i * 0.1 + e * 0.5) * Math.sin(t * n * 0.08 + e * 0.3) + 1) * 0.08;
      return Math.min(1, _ + f);
    }
  }
];
function L(i, t, e, s) {
  if (!S) {
    const h = document.createElement("canvas");
    h.width = 1, h.height = 1, S = h.getContext("2d");
  }
  S.font = `${e}px monospace`;
  const r = S.measureText("M").width * s, n = e * 1.35 * s, a = n / r, o = Math.floor(i / r), c = Math.floor(t / n);
  return { cols: o, rows: c, cw: r, ch: n, ar: a };
}
let S = null;
function P(i, t, e, s) {
  if (t <= 0 || e <= 0)
    return { brightness: new Float32Array(0), ctx: s };
  s || (s = document.createElement("canvas").getContext("2d", { willReadFrequently: !0 }));
  const r = s.canvas;
  (r.width !== t || r.height !== e) && (r.width = t, r.height = e), s.drawImage(i, 0, 0, t, e);
  const a = s.getImageData(0, 0, t, e).data, o = t * e, c = new Float32Array(o);
  for (let h = 0; h < o; h++) {
    const l = h * 4;
    c[h] = (a[l] * 0.299 + a[l + 1] * 0.587 + a[l + 2] * 0.114) / 255;
  }
  return { brightness: c, ctx: s };
}
function q(i, t, e) {
  return i < t ? t : i > e ? e : i;
}
function R(i, t, e) {
  return i + (t - i) * e;
}
function B(i, t, e) {
  let s = t - i;
  return s > 180 && (s -= 360), s < -180 && (s += 360), ((i + s * e) % 360 + 360) % 360;
}
function T(i, t, e, s) {
  const r = new Array(t), n = t - 1;
  if (s.cycling) {
    const a = s.phase, o = Math.floor(a) % b.length, c = (o + 1) % b.length, h = a - Math.floor(a), l = b[o], m = b[c];
    for (let _ = 0; _ < t; _++) {
      const f = n > 0 ? _ / n : 0, [u, p, d] = l.fn(f, e), [y, g, C] = m.fn(f, e), v = B(u, y, h), O = p + (g - p) * h, x = d + (C - d) * h;
      r[_] = `hsl(${v} ${O}% ${x}%)`;
    }
  } else {
    const a = b[i];
    for (let o = 0; o < t; o++) {
      const c = n > 0 ? o / n : 0, [h, l, m] = a.fn(c, e);
      r[o] = `hsl(${h} ${l}% ${m}%)`;
    }
  }
  return r;
}
function E(i, t, e, s, r, n, a) {
  const { cols: o, rows: c, cw: h, ch: l, ar: m } = e, _ = r.length - 1;
  i.textBaseline = "top";
  for (let f = 0; f < c; f++) {
    const u = f * l;
    for (let p = 0; p < o; p++) {
      let d = t[f * o + p];
      d = d < 0 ? 0 : d > 1 ? 1 : d;
      const y = d * _ | 0;
      if (y !== 0) {
        if (n > 0) {
          const g = 1 - n * (1 - D(p, f, a, m));
          if (g < 0.02) continue;
          i.globalAlpha = g;
        }
        i.fillStyle = s[y], i.fillText(r[y], p * h, u);
      }
    }
  }
  i.globalAlpha = 1;
}
function D(i, t, e, s) {
  const r = t * s;
  let n = Math.sin(i * 0.06 - e * 0.8);
  return n += Math.sin(r * 0.05 + e * 1.1), n += Math.sin((i + r) * 0.04 - e * 0.5), (n + 3) / 6;
}
class V extends j {
  /**
   * @param {HTMLCanvasElement} sourceCanvas - the canvas to ASCII-ify
   * @param {object} [options] - configuration options
   */
  constructor(t, e = {}) {
    super(), this._source = t, this._running = !1, this._rafId = null, this._prevTime = 0, this._time = 0, this._colorPhase = 0, this._panel = null, this._params = { ...M, ...e }, this._layers = [], this._implicitMode = !0, this._sampleCtx = null, this._canvas = document.createElement("canvas"), this._canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;", this._ctx = this._canvas.getContext("2d");
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
      for (const [s, r] of Object.entries(t)) this._setOne(s, r);
    else
      this._setOne(t, e);
  }
  _setOne(t, e) {
    const s = F[t];
    s && (e = q(e, s.min, s.max));
    const r = this._params[t];
    this._params[t] = e, t === "sourceOpacity" && this._updateSourceOpacity(), (t === "fontSize" || t === "density") && this._handleResize(), this._implicitMode && this._layers.length > 0 && ["fontSize", "density", "charset", "colorScheme", "pattern", "patternMix", "fade", "opacity", "blendMode"].includes(t) && this._layers[0].set(t, e), r !== e && this.emit("paramchange", { key: t, value: e });
  }
  /**
   * Add a compositing layer.
   * @param {object} [options]
   * @returns {Layer}
   */
  addLayer(t = {}) {
    const e = N();
    if (this._implicitMode && this._layers.length > 0)
      this._implicitMode = !1;
    else if (this._implicitMode && this._layers.length === 0) {
      const r = new e(this, {
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
      this._layers.push(r), this._implicitMode = !1;
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
    e >= 0 && (this._layers.splice(e, 1), t.destroy(), this.emit("layerremove", t));
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
    import("./panel-BMlAviqM.js").then(({ ControlPanel: e }) => {
      this._panel = new e(this, t), this._panel.show();
    });
  }
  /** Hide the control panel */
  hidePanel() {
    this._panel && this._panel.hide();
  }
  /** Toggle the control panel */
  togglePanel() {
    this._panel && this._panel.visible ? this.hidePanel() : this.showPanel();
  }
  /** Destroy the instance — remove overlay, detach observers, stop loop */
  destroy() {
    this.stop(), this._panel && (this._panel.destroy(), this._panel = null), this._resizeObserver.disconnect(), this._canvas.parentElement && this._canvas.parentElement.removeChild(this._canvas), this._source.style.opacity = "";
    for (const t of this._layers) t.destroy();
    this._layers = [];
  }
  // ─── Internal ──────────────────────────────────────────
  _updateSourceOpacity() {
    this._source.style.opacity = String(this._params.sourceOpacity);
  }
  _handleResize() {
    const t = this._source.offsetWidth || this._source.width, e = this._source.offsetHeight || this._source.height, s = devicePixelRatio || 1;
    this._canvas.width = t * s, this._canvas.height = e * s, this._canvas.style.width = t + "px", this._canvas.style.height = e + "px", this._ctx.setTransform(s, 0, 0, s, 0, 0), this._grid = L(t, e, this._params.fontSize, this._params.density), this._width = t, this._height = e, this.emit("resize", { cols: this._grid.cols, rows: this._grid.rows });
  }
  _renderFrame() {
    const t = this._ctx, e = this._width, s = this._height, r = this._time;
    t.fillStyle = this._params.background, t.fillRect(0, 0, e, s), this._layers.length === 0 ? this._renderImplicit(t, e, s, r) : this._renderLayers(t, e, s, r);
  }
  _renderImplicit(t, e, s, r) {
    const n = this._grid;
    if (n.cols <= 0 || n.rows <= 0) return;
    const a = this._resolveChars(this._params.charset), o = this._resolveSchemeIndex(this._params.colorScheme), { brightness: c, ctx: h } = P(this._source, n.cols, n.rows, this._sampleCtx);
    this._sampleCtx = h;
    const l = this._params.pattern;
    if (l) {
      const _ = this._resolvePattern(l);
      if (_) {
        const f = this._params.patternMix;
        for (let u = 0; u < n.rows; u++)
          for (let p = 0; p < n.cols; p++) {
            const d = u * n.cols + p, y = _(p, u, r, n.cols, n.rows, n.ar);
            c[d] = R(c[d], y, f);
          }
      }
    }
    const m = T(o, a.length, r, {
      cycling: this._params.colorCycle,
      phase: this._colorPhase
    });
    t.font = `${this._params.fontSize}px monospace`, E(t, c, n, m, a, this._params.fade, r);
  }
  _renderLayers(t, e, s, r) {
    for (const n of this._layers) {
      if (!n.visible) continue;
      const a = L(e, s, n.get("fontSize"), n.get("density"));
      if (a.cols <= 0 || a.rows <= 0) continue;
      const o = n.source || this._source, { brightness: c, ctx: h } = P(o, a.cols, a.rows, n._sampleCtx);
      n._sampleCtx = h;
      const l = n.get("pattern");
      if (l) {
        const v = this._resolvePattern(l);
        if (v) {
          const O = n.get("patternMix");
          for (let x = 0; x < a.rows; x++)
            for (let w = 0; w < a.cols; w++) {
              const I = x * a.cols + w, $ = v(w, x, r, a.cols, a.rows, a.ar);
              c[I] = R(c[I], $, O);
            }
        }
      }
      const m = n.get("charset") || this._params.charset, _ = n.get("colorScheme") || this._params.colorScheme, f = this._resolveChars(m), u = this._resolveSchemeIndex(_), p = n.get("fade") ?? this._params.fade, d = T(u, f.length, r, {
        cycling: this._params.colorCycle,
        phase: this._colorPhase
      }), y = n._ensureOffscreen(e, s), g = n._offCtx;
      g.clearRect(0, 0, e, s), g.font = `${n.get("fontSize")}px monospace`, E(g, c, a, d, f, p, r);
      const C = n.get("blendMode") || "replace";
      t.globalAlpha = n.get("opacity") ?? 1, t.globalCompositeOperation = C === "add" ? "lighter" : "source-over", t.drawImage(y, 0, 0, e, s);
    }
    t.globalAlpha = 1, t.globalCompositeOperation = "source-over";
  }
  _resolveChars(t) {
    if (typeof t == "string") {
      const e = A.find((s) => s.name === t);
      return e ? e.chars : t;
    }
    return A[0].chars;
  }
  _resolveSchemeIndex(t) {
    if (typeof t == "number") return t;
    const e = b.findIndex((s) => s.name === t);
    return e >= 0 ? e : 0;
  }
  _resolvePattern(t) {
    const e = H.find((s) => s.name === t);
    return e ? e.fn : null;
  }
}
let z = null;
function N() {
  if (!z)
    throw new Error("Layer system not initialized. Import layer.js first.");
  return z;
}
function U(i) {
  z = i;
}
let G = 1;
class K {
  /**
   * @param {import('./ascii-ify.js').AsciiIfy} parent
   * @param {object} options
   */
  constructor(t, e = {}) {
    this.id = G++, this._parent = t, this.visible = e.visible ?? !0, this.source = e.source || null, this._params = {
      fontSize: e.fontSize ?? M.fontSize,
      density: e.density ?? M.density,
      charset: e.charset ?? null,
      colorScheme: e.colorScheme ?? null,
      pattern: e.pattern ?? M.pattern,
      patternMix: e.patternMix ?? M.patternMix,
      fade: e.fade ?? null,
      opacity: e.opacity ?? M.opacity,
      blendMode: e.blendMode ?? M.blendMode
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
      for (const [s, r] of Object.entries(t)) this._setOne(s, r);
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
    const s = F[t];
    s && (e = q(e, s.min, s.max)), this._params[t] = e;
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
U(K);
export {
  V as A,
  A as C,
  K as L,
  F as P,
  b as a,
  H as b
};
//# sourceMappingURL=index-DSor5TsT.js.map
