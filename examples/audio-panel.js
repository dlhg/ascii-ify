// ─── Audio Panel ──────────────────────────────────────────────
// Live view and control of how sound drives a scene.
//   • Input: file / mic / transport
//   • Signals: live meters for everything the analyzer hears
//   • Routes: source → target rows with amount, smoothing, curve, and a live
//     trace showing the raw signal against what it becomes after smoothing
//   • Autosaves per scene in the browser; "Reset" returns to the scene default
//
// Renders as a right-hand drawer in the scene window, or pops out into its own
// window (drag it to a second monitor and leave the visuals fullscreen on the
// first). Everything keeps running in the scene window; the popup is just a
// surface, so there is nothing to sync.

import { SOURCES, TARGETS, targetInfo, targetActive, listTargets, savePatch, clearPatch } from './audio-reactivity.js';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; }
.surface { color: #cfd3e6; font-size: 11px; background: #0b0b15; height: 100%; display: flex; flex-direction: column; }
.drawer .surface { border-left: 1px solid #23253d; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #23253d; }
header h1 { margin: 0; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; flex: 1; color: #fff; }
.icon { cursor: pointer; padding: 3px 7px; border: 1px solid #2c2f4d; border-radius: 4px; color: #9aa0cf; user-select: none; }
.icon:hover { background: #1a1c33; color: #fff; }
.scroll { overflow-y: auto; flex: 1; padding-bottom: 12px; }
section { padding: 10px 12px; border-bottom: 1px solid #1a1c2e; }
section h2 { margin: 0 0 8px; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #6e74a8; display: flex; align-items: center; justify-content: space-between; }
button, .btn { font: inherit; color: inherit; cursor: pointer; padding: 5px 9px; background: #15172c; border: 1px solid #2f3256; border-radius: 4px; }
button:hover, .btn:hover { background: #20234a; }
button.on { background: #3a1626; border-color: #ff5a7a; color: #ffd0da; }
button.on::before { content: '● '; color: #ff5a7a; }
input[type=file] { display: none; }
.row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.row.wrap { flex-wrap: wrap; }
.muted { color: #7a80b0; }
.grow { flex: 1; min-width: 0; }
input[type=range] { accent-color: #7f86ff; width: 100%; margin: 0; }
select { font: inherit; color: #e4e6f5; background: #15172c; border: 1px solid #2f3256; border-radius: 4px; padding: 3px 4px; max-width: 100%; }

.meters { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; }
.meter { display: flex; align-items: center; gap: 6px; }
.meter .name { width: 56px; color: #8b90b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { flex: 1; height: 7px; background: #171930; border-radius: 4px; overflow: hidden; }
.bar i { display: block; height: 100%; width: 0; background: #7f86ff; }
.meter.hit .bar i { background: #ff5a7a; }

.route { border: 1px solid #23253d; border-radius: 6px; padding: 8px; margin-bottom: 8px; background: #0e0f1c; }
.route.off { opacity: .5; }
.route .top { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; }
.route .top select { min-width: 0; }
.route .top .src { flex: 0 0 96px; }
.route .top .tgt { flex: 1; }
.route .arrow { color: #6e74a8; }
.route label.k { width: 48px; color: #8b90b8; flex: none; }
.route .val { width: 52px; text-align: right; flex: none; color: #cfd3e6; }
.route canvas { width: 100%; height: 34px; display: block; background: #090a14; border-radius: 4px; margin-top: 4px; }
.route .live { display: flex; align-items: center; gap: 6px; margin-top: 6px; color: #8b90b8; }
.route .live .bar { height: 5px; }
.hint { margin-top: 5px; color: #e0b15a; }
.del { color: #9aa0cf; cursor: pointer; padding: 0 5px; }
.del:hover { color: #ff5a7a; }
.checks { display: flex; gap: 12px; margin-top: 4px; }
footer { padding: 9px 12px; border-top: 1px solid #23253d; display: flex; gap: 6px; align-items: center; }
footer .state { flex: 1; color: #7a80b0; }
`;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const fmtMs = (s) => (s <= 0 ? 'off' : s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(1)} s`);
const fmtTime = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
const HISTORY = 240;

export class AudioPanel {
  /**
   * @param {object} o
   * @param {Reactivity} o.reactivity
   * @param {object} o.dock            createAudioDock() result (input handling)
   * @param {string} o.sceneName       key for saved patches
   * @param {() => object[]} o.defaults  the scene's default routes
   * @param {AsciiIfy} o.ascii
   */
  constructor({ reactivity, dock, sceneName, defaults, ascii, custom = false }) {
    this.rx = reactivity;
    this.dock = dock;
    this.audio = dock.audio;
    this.ascii = ascii;
    this.sceneName = sceneName;
    this.defaults = defaults;
    this._rows = new Map();     // route id → row refs
    this._win = window;
    this._popup = null;
    this._raf = 0;
    this._saveTimer = 0;
    this._custom = custom;
    this._muteSave = false;
    this._last = performance.now();

    // Drawer host in the scene window
    this._host = el('div');
    this._host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:380px;z-index:9997;display:none;';
    this._host.className = 'drawer';
    this._shadow = this._host.attachShadow({ mode: 'closed' });
    this._addStyle(this._shadow);

    this._surface = el('div', 'surface');
    this._shadow.appendChild(this._surface);
    this._build();
    document.body.appendChild(this._host);

    this.rx.onChange((_, kind) => {
      if (kind === 'structure') this._renderRoutes();
      this._touch();
    });
    this._renderRoutes();
    window.addEventListener('beforeunload', () => this._popup?.close());
  }

  get visible() { return this._host.style.display !== 'none' || !!this._popup; }

  toggle() { this.visible ? this.hide() : this.show(); }

  show() {
    if (this._popup) { this._popup.focus(); return; }
    this._host.style.display = 'block';
    this.dock.setHidden(true);
    this._startLoop();
  }

  hide() {
    if (this._popup) this._popIn();
    this._host.style.display = 'none';
    this.dock.setHidden(false);
    this._stopLoop();
  }

  // ─── Layout ────────────────────────────────────────────────────────

  _addStyle(root) {
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
  }

  _build() {
    const s = this._surface;
    s.innerHTML = '';

    // Header
    const header = el('header');
    header.appendChild(el('h1', null, 'Audio'));
    this._popBtn = el('span', 'icon', 'Pop out ↗');
    this._popBtn.title = 'Move to its own window (e.g. a second monitor)';
    this._popBtn.addEventListener('click', () => (this._popup ? this._popIn() : this._popOut()));
    const close = el('span', 'icon', '×');
    close.title = 'Close (`)';
    close.addEventListener('click', () => this.hide());
    header.append(this._popBtn, close);
    s.appendChild(header);

    const scroll = el('div', 'scroll');
    s.appendChild(scroll);

    // Input
    const input = el('section');
    input.appendChild(el('h2', null, 'Input'));
    const r1 = el('div', 'row');
    const load = el('label', 'btn', 'Load audio');
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'audio/*';
    file.addEventListener('change', () => this.dock.useFile(file.files[0]));
    load.appendChild(file);
    this._micBtn = el('button', null, 'Use mic');
    this._micBtn.addEventListener('click', () => this.dock.toggleMic());
    r1.append(load, this._micBtn);
    input.appendChild(r1);

    this._transport = el('div', 'row');
    this._playBtn = el('button', null, '▶');
    this._playBtn.addEventListener('click', () => {
      const p = this.dock.player;
      p.paused ? p.play() : p.pause();
    });
    this._seek = document.createElement('input');
    this._seek.type = 'range'; this._seek.min = 0; this._seek.max = 1000; this._seek.value = 0;
    this._seek.className = 'grow';
    this._seek.addEventListener('input', () => {
      const p = this.dock.player;
      if (Number.isFinite(p.duration)) p.currentTime = (this._seek.value / 1000) * p.duration;
    });
    this._time = el('span', 'muted', '0:00');
    this._transport.append(this._playBtn, this._seek, this._time);
    input.appendChild(this._transport);
    this._status = el('div', 'muted');
    input.appendChild(this._status);
    scroll.appendChild(input);

    // Signals
    const sig = el('section');
    sig.appendChild(el('h2', null, 'What it hears'));
    const grid = el('div', 'meters');
    this._meters = SOURCES.map((src) => {
      const m = el('div', `meter ${src.kind}`);
      const bar = el('div', 'bar');
      const fill = document.createElement('i');
      bar.appendChild(fill);
      m.append(el('span', 'name', src.short || src.label), bar);
      grid.appendChild(m);
      return { id: src.id, fill };
    });
    sig.appendChild(grid);
    scroll.appendChild(sig);

    // Master
    const master = el('section');
    master.appendChild(el('h2', null, 'Reactivity'));
    const mr = el('div', 'row');
    this._master = document.createElement('input');
    this._master.type = 'range'; this._master.min = 0; this._master.max = 3; this._master.step = 0.05;
    this._master.value = this.dock.reactivity;
    this._masterVal = el('span', 'val', `${Math.round(this.dock.reactivity * 100)}%`);
    this._master.addEventListener('input', () => {
      const k = Number(this._master.value);
      this.dock.setReactivity(k);
      this._masterVal.textContent = `${Math.round(k * 100)}%`;
    });
    mr.append(this._master, this._masterVal);
    master.appendChild(mr);
    master.appendChild(el('div', 'muted', 'Scales every route at once.'));
    scroll.appendChild(master);

    // Routes
    const routes = el('section');
    const h2 = el('h2', null, 'Routes');
    const add = el('button', null, '+ Add');
    add.addEventListener('click', () => {
      this.rx.addRoute({ target: 'crtGlow', source: 'kick', depth: 0.3, smooth: 0.1 });
    });
    h2.appendChild(add);
    routes.appendChild(h2);
    this._list = el('div');
    routes.appendChild(this._list);
    scroll.appendChild(routes);

    // Footer
    const foot = el('footer');
    this._state = el('span', 'state', this._custom ? 'Saved for this scene' : 'Scene default');
    const reset = el('button', null, 'Reset');
    reset.title = 'Discard changes and go back to this scene\'s default routes';
    reset.addEventListener('click', () => {
      clearTimeout(this._saveTimer);
      clearPatch(this.sceneName);
      this._muteSave = true;
      this.rx.load(this.defaults());
      this._muteSave = false;
      this._custom = false;
      this._state.textContent = 'Scene default';
    });
    const copy = el('button', null, 'Copy JSON');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(this.rx.toJSON(), null, 2)); this._state.textContent = 'Copied'; }
      catch { this._state.textContent = 'Copy blocked'; }
    });
    foot.append(this._state, copy, reset);
    s.appendChild(foot);
  }

  // ─── Routes list ───────────────────────────────────────────────────

  _renderRoutes() {
    this._list.innerHTML = '';
    this._rows.clear();
    if (!this.rx.routes.length) {
      this._list.appendChild(el('div', 'muted', 'No routes. Add one to make the scene react.'));
      return;
    }
    for (const route of this.rx.routes) this._list.appendChild(this._routeRow(route));
  }

  _routeRow(route) {
    const rx = this.rx;
    const row = el('div', 'route');
    const set = (patch) => rx.updateRoute(route.id, patch);

    // top: enable, source → target, delete
    const top = el('div', 'top');
    const on = document.createElement('input');
    on.type = 'checkbox'; on.checked = route.enabled;
    on.addEventListener('change', () => set({ enabled: on.checked }));

    const src = document.createElement('select');
    src.className = 'src';
    for (const s of SOURCES) {
      const o = el('option', null, s.label);
      o.value = s.id; o.selected = s.id === route.source;
      src.appendChild(o);
    }
    src.addEventListener('change', () => set({ source: src.value }));

    const tgt = document.createElement('select');
    tgt.className = 'tgt';
    const groups = new Map();
    for (const id of listTargets(this.ascii, this.rx.scene)) {
      const info = targetInfo(id);
      if (!groups.has(info.group)) groups.set(info.group, el('optgroup'));
      const g = groups.get(info.group);
      g.label = info.group;
      const o = el('option', null, info.label + (targetActive(id, this.ascii) ? '' : ' (off here)'));
      o.value = id; o.selected = id === route.target;
      g.appendChild(o);
    }
    groups.forEach((g) => tgt.appendChild(g));
    tgt.addEventListener('change', () => set({ target: tgt.value }));

    const del = el('span', 'del', '×');
    del.title = 'Remove route';
    del.addEventListener('click', () => rx.removeRoute(route.id));
    top.append(on, src, el('span', 'arrow', '→'), tgt, del);
    row.appendChild(top);

    // amount
    const amt = this._slider('Amount', -100, 100, 1, Math.round(route.depth * 100), (v) => `${v > 0 ? '+' : ''}${v}%`, (v) => set({ depth: v / 100 }));
    row.appendChild(amt.el);

    // smoothing
    const sm = this._slider('Smooth', 0, 1500, 10, Math.round(route.smooth * 1000), (v) => fmtMs(v / 1000), (v) => set({ smooth: v / 1000 }));
    row.appendChild(sm.el);

    // options
    const checks = el('div', 'checks');
    const curve = document.createElement('select');
    for (const c of [['linear', 'Linear'], ['exp', 'Punchy (exp)'], ['log', 'Sensitive (log)']]) {
      const o = el('option', null, c[1]); o.value = c[0]; o.selected = route.curve === c[0];
      curve.appendChild(o);
    }
    curve.addEventListener('change', () => set({ curve: curve.value }));
    const bipol = el('label');
    const bc = document.createElement('input');
    bc.type = 'checkbox'; bc.checked = route.bipolar;
    bc.addEventListener('change', () => set({ bipolar: bc.checked }));
    bipol.append(bc, document.createTextNode(' Swing ±'));
    bipol.title = 'Centre on the current value: quiet pulls down, loud pushes up';
    checks.append(curve, bipol);
    row.appendChild(checks);

    // live: input bar + target value + trace
    const live = el('div', 'live');
    const bar = el('div', 'bar'); const fill = document.createElement('i'); bar.appendChild(fill);
    const value = el('span', 'val muted', '');
    live.append(el('span', null, 'in'), bar, el('span', null, '→'), value);
    row.appendChild(live);
    const canvas = document.createElement('canvas');
    canvas.width = HISTORY; canvas.height = 34;
    row.appendChild(canvas);

    const hint = el('div', 'hint');
    row.appendChild(hint);

    const refs = { row, fill, value, canvas, hint, raw: new Array(HISTORY).fill(0), smooth: new Array(HISTORY).fill(0), y: 0 };
    this._rows.set(route.id, refs);
    row.classList.toggle('off', !route.enabled);
    this._updateHint(route, refs);
    on.addEventListener('change', () => row.classList.toggle('off', !on.checked));
    return row;
  }

  _slider(label, min, max, step, value, fmt, onInput) {
    const wrap = el('div', 'row');
    const lab = el('label', 'k', label);
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    const val = el('span', 'val', fmt(value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      onInput(v);
      const id = [...this._rows.entries()].find(([, r]) => r.row.contains(input))?.[0];
      const route = this.rx.routes.find((r) => r.id === id);
      if (route) this._updateHint(route, this._rows.get(id));
    });
    wrap.append(lab, input, val);
    return { el: wrap, input };
  }

  _updateHint(route, refs) {
    const info = targetInfo(route.target);
    const msgs = [];
    if (!targetActive(route.target, this.ascii)) msgs.push(`${info.label} does nothing here: ${info.needs === '3d' ? '3D mode' : info.needs} is off in this scene.`);
    if (info.jagged && route.smooth < 0.3) msgs.push('Glyph grid rebuilds on every change: use 300 ms+ smoothing or it will look jagged.');
    refs.hint.textContent = msgs.join(' ');
    refs.hint.style.display = msgs.length ? 'block' : 'none';
  }

  // ─── Live updates ──────────────────────────────────────────────────

  _startLoop() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = () => {
      this._frame();
      this._raf = this._win.requestAnimationFrame(tick);
    };
    this._raf = this._win.requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._raf) this._win.cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _frame() {
    const now = performance.now();
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;

    // input state
    const d = this.dock;
    this._micBtn.classList.toggle('on', d.micOn);
    this._micBtn.textContent = d.micOn ? 'Mic on' : 'Use mic';
    const p = d.player;
    const hasFile = !!p.currentSrc;
    this._transport.style.display = hasFile ? 'flex' : 'none';
    if (hasFile) {
      this._playBtn.textContent = p.paused ? '▶' : '❚❚';
      if (document.activeElement !== this._seek && Number.isFinite(p.duration)) {
        this._seek.value = (p.currentTime / p.duration) * 1000;
      }
      this._time.textContent = `${fmtTime(p.currentTime)} / ${fmtTime(p.duration)}`;
    }
    this._status.textContent = d.status.startsWith('drop a file')
      ? 'Drop an audio file on the scene, or use the mic.'
      : this._popup && d.status.includes('blocked')
        ? 'Mic blocked: allow it in the main window\'s address bar.'
        : d.status;

    // meters
    for (const m of this._meters) m.fill.style.width = `${Math.round(this.audio.value(m.id) * 100)}%`;

    // routes
    for (const route of this.rx.routes) {
      const refs = this._rows.get(route.id);
      if (!refs) continue;
      const { input, value } = this.rx.readout(route);
      refs.fill.style.width = `${Math.round(input * 100)}%`;
      refs.value.textContent = value == null ? '' : Number(value).toFixed(Math.abs(value) >= 100 ? 0 : 2);

      refs.y += (input - refs.y) * (route.smooth > 0 ? 1 - Math.exp(-dt / route.smooth) : 1);
      refs.raw.push(input); refs.raw.shift();
      refs.smooth.push(refs.y); refs.smooth.shift();
      this._trace(refs, route);
    }
  }

  _trace(refs, route) {
    const c = refs.canvas;
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const line = (arr, color, width) => {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = (i / (arr.length - 1)) * w;
        const y = h - 2 - arr[i] * (h - 4);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    };
    line(refs.raw, 'rgba(140,146,200,0.35)', 1);            // what the analyzer says
    line(refs.smooth, route.enabled ? '#7f86ff' : '#4a4f78', 1.6); // what the scene gets
  }

  // ─── Saving ────────────────────────────────────────────────────────

  _touch() {
    if (this._muteSave) return;
    this._custom = true;
    this._state.textContent = 'Saving…';
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const ok = savePatch(this.sceneName, this.rx.toJSON());
      this._state.textContent = ok ? 'Saved for this scene' : 'Could not save';
    }, 300);
  }

  // ─── Pop out ───────────────────────────────────────────────────────

  _popOut() {
    const popup = window.open('', 'ascii-audio', 'width=420,height=820,resizable=yes');
    if (!popup) { this._status.textContent = 'Pop-up blocked: allow pop-ups for this page.'; return; }
    popup.document.write(
      '<!DOCTYPE html><html><head><title>ascii-ify audio</title>' +
      '<style>html,body{margin:0;height:100%;background:#0b0b15;overflow:hidden}</style></head><body></body></html>'
    );
    popup.document.close();

    const host = popup.document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = popup.document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    this._surface.remove();
    shadow.appendChild(this._surface);
    popup.document.body.appendChild(host);

    this._popup = popup;
    this._host.style.display = 'none';
    this._popBtn.textContent = 'Pop in ↙';

    // Animate with the popup's own frame clock so it keeps running while the scene window is busy.
    this._stopLoop();
    this._win = popup;
    this._startLoop();
    this.dock.setHidden(true);
    popup.addEventListener('beforeunload', () => this._popIn(true));
  }

  _popIn(closed = false) {
    if (!this._popup) return;
    const popup = this._popup;
    this._popup = null;
    this._stopLoop();
    this._win = window;
    this._surface.remove();
    this._shadow.appendChild(this._surface);
    this._popBtn.textContent = 'Pop out ↗';
    if (!closed) popup.close();
    // Back in the scene window as the drawer
    this._host.style.display = 'block';
    this._startLoop();
  }
}
