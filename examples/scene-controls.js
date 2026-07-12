// ─── Scene Controls: draggable popup for global source-scene adjustment ──────
//
// Adjusts the SOURCE canvas (the raw scene, i.e. what you'd see with the ASCII
// filter disabled) before it is sampled each frame. Because the sampler reads
// luminance, brightness/contrast flow through into the ASCII glyphs too, while
// hue/saturation recolor the underlying scene itself. Speed rescales time.
//
// Every control can be automated (sine/triangle/noise LFO, or driven live by
// mouse X / mouse Y / scroll) exactly like the main panel's parameters — the
// shared AutomationSet engine drives them. createApp() advances them each frame
// via tick().
//
// Self-contained (shadow DOM), so it drops into any example with zero styling
// conflicts. createApp() wires it in automatically.

import { AutomationSet, isInputAutomation } from '../src/automation.js';

// Generous ranges: brightness/contrast/saturation reach well past the usual
// 0..2 so scenes can be blown out or crushed hard, blur goes cinematic, and
// speed can hyper-drive. Defaults stay centered on the neutral value.
const CONTROLS = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 8,   step: 0.01, def: 1, unit: 'x', css: 'brightness' },
  { key: 'contrast',   label: 'Contrast',   min: 0, max: 8,   step: 0.01, def: 1, unit: 'x', css: 'contrast' },
  { key: 'saturate',   label: 'Saturation', min: 0, max: 8,   step: 0.01, def: 1, unit: 'x', css: 'saturate' },
  { key: 'hue',        label: 'Hue',        min: 0, max: 360, step: 1,    def: 0, unit: '°', css: 'hue-rotate', suffix: 'deg' },
  { key: 'blur',       label: 'Blur',       min: 0, max: 40,  step: 0.1,  def: 0, unit: 'px', css: 'blur', suffix: 'px' },
  { key: 'invert',     label: 'Invert',     min: 0, max: 1,   step: 0.01, def: 0, unit: '', css: 'invert' },
  { key: 'speed',      label: 'Speed',      min: 0, max: 8,   step: 0.01, def: 1, unit: 'x', css: null },
];

// AutomationSet looks up PARAM_RANGES by key and clamps against it; 'speed'
// collides with the global ascii speed range, so namespace every scene key.
const AUTO_PREFIX = 'scene_';
const WAVE_TYPES = ['sine', 'triangle', 'noise'];

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-monospace, 'Cascadia Code', 'Fira Code', Consolas, monospace; }

.launcher {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 9998;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  background: rgba(12, 12, 22, 0.78);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 6px;
  color: #8888a8;
  font: 700 8.5px/1 inherit;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.launcher:hover { color: #d0d0e0; border-color: rgba(255, 255, 255, 0.16); background: rgba(18, 18, 30, 0.9); }
.launcher.active { color: #ff6b35; border-color: rgba(255, 107, 53, 0.5); }
.launcher-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
.launcher.hidden { display: none; }

.popup {
  position: fixed;
  left: 16px;
  bottom: 60px;
  z-index: 9999;
  width: 232px;
  background: rgba(12, 12, 22, 0.82);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 7px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: #d0d0e0;
  user-select: none;
  display: none;
  overflow: hidden;
}
.popup.open { display: block; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px 9px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  cursor: grab;
  background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent);
}
.header.dragging { cursor: grabbing; }
.title { font: 700 9px/1 inherit; text-transform: uppercase; letter-spacing: 0.2em; color: #8888a8; }
.title-glow { color: #ff6b35; margin-right: 6px; }
.header-btns { display: flex; gap: 5px; }
.hbtn {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(24, 24, 38, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  color: #555578;
  font: 400 12px/1 inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.hbtn:hover { color: #d0d0e0; border-color: rgba(255, 255, 255, 0.16); background: rgba(20, 20, 42, 0.9); }
.reset-btn { font: 700 8px/1 inherit; letter-spacing: 0.06em; width: auto; padding: 0 7px; }

.body { padding: 11px 12px; }
.ctrl { margin-bottom: 9px; }
.ctrl:last-child { margin-bottom: 0; }
.ctrl-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
.ctrl-label { font: 500 8px/1 inherit; text-transform: uppercase; letter-spacing: 0.13em; color: #8888a8; }
.ctrl-head-val { display: flex; align-items: center; gap: 6px; }
.ctrl-val { font: 600 9.5px/1 inherit; color: #b0b0c8; }
.ctrl-val.modified { color: #ff6b35; }

.auto-btn {
  width: 18px; height: 16px; padding: 0;
  background: rgba(24, 24, 38, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  color: #555578;
  font: 700 10px/1 inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.auto-btn:hover { color: #ff6b35; border-color: rgba(255, 255, 255, 0.16); background: rgba(20, 20, 42, 0.9); }
.auto-btn.active { color: #ff6b35; border-color: rgba(255, 107, 53, 0.5); background: rgba(255, 107, 53, 0.12); box-shadow: 0 0 6px rgba(255, 107, 53, 0.4); }

.auto-panel {
  display: none;
  flex-direction: column;
  gap: 5px;
  margin-top: 6px;
  padding: 6px;
  background: rgba(20, 20, 42, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}
.auto-panel.open { display: flex; }

.auto-row { display: flex; align-items: center; gap: 5px; width: 100%; }
.auto-slider-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 40px; }
.auto-row.hidden { display: none; }
.auto-label { font: 600 7px/1 inherit; text-transform: uppercase; letter-spacing: 0.08em; color: #6a6a90; }

.auto-select {
  flex: 1; min-width: 0; height: 22px;
  background: rgba(24, 24, 38, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  color: #b0b0c8;
  font: 600 9px/1 inherit;
}
.auto-select.muted { opacity: 0.4; }

.auto-mini-btn {
  flex: none; height: 22px; padding: 0 6px;
  background: rgba(24, 24, 38, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  color: #555578;
  font: 700 9px/1 inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.auto-mini-btn:hover { color: #ff6b35; border-color: rgba(255, 255, 255, 0.16); background: rgba(20, 20, 42, 0.9); }
.auto-mini-btn.active { color: #ff6b35; border-color: rgba(255, 107, 53, 0.5); background: rgba(255, 107, 53, 0.12); box-shadow: 0 0 6px rgba(255, 107, 53, 0.4); }

.auto-slider { width: 100%; height: 14px; }
.auto-val { font: 600 8px/1 inherit; color: #8a8ab0; text-align: right; }

input[type=range] {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 14px; margin: 0;
  background: transparent; cursor: pointer;
}
input[type=range]::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: #14142a; border: 1px solid rgba(255, 255, 255, 0.06);
}
input[type=range]::-moz-range-track {
  height: 4px; border-radius: 2px;
  background: #14142a; border: 1px solid rgba(255, 255, 255, 0.06);
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 12px; height: 12px; margin-top: -5px;
  border-radius: 50%; background: #ff6b35;
  border: 2px solid #12121e;
  box-shadow: 0 0 6px rgba(255, 107, 53, 0.4);
}
input[type=range]::-moz-range-thumb {
  width: 12px; height: 12px;
  border-radius: 50%; background: #ff6b35;
  border: 2px solid #12121e;
  box-shadow: 0 0 6px rgba(255, 107, 53, 0.4);
}

.divider { height: 1px; background: rgba(255, 255, 255, 0.06); margin: 11px 0; }
`;

export class ScenePopup {
  /**
   * @param {HTMLElement} parent - element to mount into (usually document.body)
   * @param {object} [opts]
   * @param {() => void} [opts.onChange] - called whenever a value changes
   */
  constructor(parent, { onChange = null } = {}) {
    this._onChange = onChange;
    this.values = {};
    for (const c of CONTROLS) this.values[c.key] = c.def;

    // Shared LFO / input-driven automation engine. The setter writes automated
    // values back into `this.values` (clamped to the slider range) and reflects
    // them in the UI. Keyed by namespaced scene keys — see AUTO_PREFIX.
    this._cfgByKey = {};
    for (const c of CONTROLS) this._cfgByKey[c.key] = c;
    this._time = 0;
    this._automations = new AutomationSet((autoKey, value, automated) => {
      this._applyAutomatedValue(autoKey, value, automated);
    });

    this._host = document.createElement('div');
    this._shadow = this._host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this._shadow.appendChild(style);

    this._build();
    (parent || document.body).appendChild(this._host);
  }

  _build() {
    // Launcher
    this._launcher = document.createElement('button');
    this._launcher.className = 'launcher';
    this._launcher.innerHTML = '<span class="launcher-dot"></span>Scene';
    this._launcher.addEventListener('click', () => this.toggle());
    this._shadow.appendChild(this._launcher);

    // Popup
    this._popup = document.createElement('div');
    this._popup.className = 'popup';
    this._popup.innerHTML = `
      <div class="header">
        <span class="title"><span class="title-glow">◐</span>Scene</span>
        <div class="header-btns">
          <button class="hbtn reset-btn" title="Reset all">RESET</button>
          <button class="hbtn close-btn" title="Close">×</button>
        </div>
      </div>
      <div class="body"></div>
    `;
    this._shadow.appendChild(this._popup);

    this._header = this._popup.querySelector('.header');
    this._body = this._popup.querySelector('.body');
    this._rows = {};

    CONTROLS.forEach((c, i) => {
      if (c.key === 'speed') {
        const div = document.createElement('div');
        div.className = 'divider';
        this._body.appendChild(div);
      }
      const ctrl = document.createElement('div');
      ctrl.className = 'ctrl';
      ctrl.innerHTML = `
        <div class="ctrl-head">
          <span class="ctrl-label">${c.label}</span>
          <div class="ctrl-head-val">
            <span class="ctrl-val"></span>
            <button class="auto-btn" title="Automate this control">~</button>
          </div>
        </div>
        <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}">
      `;
      const input = ctrl.querySelector('input');
      const val = ctrl.querySelector('.ctrl-val');
      const autoBtn = ctrl.querySelector('.auto-btn');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        this.values[c.key] = v;
        // Dragging a live control re-centers its automation wobble.
        if (this._automations.has(this._autoKey(c))) {
          this._automations.updateBase(this._autoKey(c), v);
        }
        this._updateRow(c);
        if (this._onChange) this._onChange();
      });
      autoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._toggleAuto(c);
      });
      this._body.appendChild(ctrl);
      this._rows[c.key] = { input, val, autoBtn, cfg: c };
      this._buildAutoPanel(ctrl, c);
      this._updateRow(c);
      this._syncAutoUI(c);
    });

    this._popup.querySelector('.close-btn').addEventListener('click', () => this.close());
    this._popup.querySelector('.reset-btn').addEventListener('click', () => this.reset());

    this._enableDrag();
  }

  _updateRow(c) {
    const row = this._rows[c.key];
    const v = this.values[c.key];
    if (parseFloat(row.input.value) !== v) row.input.value = String(v);
    row.val.textContent = `${this._fmt(c, v)}${c.unit}`;
    row.val.classList.toggle('modified', Math.abs(v - c.def) > 1e-6);
  }

  _fmt(c, v) {
    return c.step >= 1 ? String(Math.round(v)) : v.toFixed(2);
  }

  // ─── Automation ────────────────────────────────────────
  _autoKey(c) { return AUTO_PREFIX + c.key; }
  _getAuto(c) { return this._automations.get(this._autoKey(c)); }
  _defaultAmount(c) { return (c.max - c.min) * 0.1; }
  _maxAmount(c) { return (c.max - c.min) / 2; }
  _amountStep(c) {
    const a = this._defaultAmount(c);
    if (a >= 10) return 1;
    if (a >= 1) return 0.1;
    return 0.01;
  }

  _buildAutoPanel(ctrl, c) {
    const panel = document.createElement('div');
    panel.className = 'auto-panel';

    const type = document.createElement('select');
    type.className = 'auto-select';
    for (const t of WAVE_TYPES) {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      type.appendChild(opt);
    }
    const mkInputBtn = (label, title) => {
      const b = document.createElement('button');
      b.className = 'auto-mini-btn';
      b.textContent = label; b.title = title;
      return b;
    };
    const mouseX = mkInputBtn('X', 'Drive with mouse X position');
    const mouseY = mkInputBtn('Y', 'Drive with mouse Y position');
    const scroll = mkInputBtn('Scrl', 'Drive with the scroll wheel');

    const amount = document.createElement('input');
    amount.className = 'auto-slider';
    amount.type = 'range';
    amount.min = '0';
    amount.max = String(this._maxAmount(c));
    amount.step = String(this._amountStep(c));
    const rate = document.createElement('input');
    rate.className = 'auto-slider';
    rate.type = 'range';
    rate.min = '0'; rate.max = '5'; rate.step = '0.01';
    const amountVal = h('span', 'auto-val', '');
    const rateVal = h('span', 'auto-val', '');

    type.addEventListener('change', () => this._updateAutoFromUI(c, type.value));
    amount.addEventListener('input', () => this._updateAutoFromUI(c));
    rate.addEventListener('input', () => this._updateAutoFromUI(c));
    mouseX.addEventListener('click', () => this._toggleInput(c, 'mouseX'));
    mouseY.addEventListener('click', () => this._toggleInput(c, 'mouseY'));
    scroll.addEventListener('click', () => this._toggleInput(c, 'scroll'));

    const typeRow = h('div', 'auto-row');
    typeRow.append(h('span', 'auto-label', 'Wave'), type, mouseX, mouseY, scroll);
    const amountRow = h('div', 'auto-row auto-slider-row');
    amountRow.append(h('span', 'auto-label', 'Amt'), amount, amountVal);
    const rateRow = h('div', 'auto-row auto-slider-row');
    rateRow.append(h('span', 'auto-label', 'Rate'), rate, rateVal);

    panel.append(typeRow, amountRow, rateRow);
    ctrl.appendChild(panel);

    Object.assign(this._rows[c.key], {
      panel, type, mouseX, mouseY, scroll, amount, rate, amountVal, rateVal, rateRow,
    });
  }

  _toggleAuto(c) {
    if (this._getAuto(c)) {
      this._automations.delete(this._autoKey(c)); // restores base value
    } else {
      this._automations.set(this._autoKey(c), this.values[c.key], {
        type: this._rows[c.key].type.value || 'sine',
        amount: this._defaultAmount(c),
        rate: 0.5,
      });
    }
    this._syncAutoUI(c);
  }

  _toggleInput(c, inputType) {
    const cur = this._getAuto(c);
    const next = cur && cur.type === inputType ? this._rows[c.key].type.value : inputType;
    this._updateAutoFromUI(c, next);
  }

  _updateAutoFromUI(c, typeOverride) {
    const row = this._rows[c.key];
    const cur = this._getAuto(c);
    const type = typeOverride
      ?? (isInputAutomation(cur && cur.type) ? cur.type : row.type.value);
    this._automations.set(this._autoKey(c), this.values[c.key], {
      type,
      base: cur ? cur.base : undefined,
      phase: cur ? cur.phase : undefined,
      seed: cur ? cur.seed : undefined,
      amount: Math.max(0, Number(row.amount.value || this._defaultAmount(c))),
      rate: Math.max(0, Number(row.rate.value || 0)),
    });
    this._syncAutoUI(c);
  }

  _syncAutoUI(c) {
    const row = this._rows[c.key];
    const auto = this._getAuto(c);
    row.autoBtn.classList.toggle('active', !!auto);
    row.panel.classList.toggle('open', !!auto);
    if (!auto) return;

    const type = auto.type || 'sine';
    const isInput = isInputAutomation(type);
    if (!isInput) row.type.value = type;
    row.mouseX.classList.toggle('active', type === 'mouseX');
    row.mouseY.classList.toggle('active', type === 'mouseY');
    row.scroll.classList.toggle('active', type === 'scroll');
    row.type.classList.toggle('muted', isInput);
    // Rate is meaningless when tracking a live input.
    row.rateRow.classList.toggle('hidden', isInput);

    const amount = auto.amount ?? ((auto.max - auto.min) / 2);
    const rate = auto.rate ?? 0;
    row.amount.value = String(Math.round(amount * 1000) / 1000);
    row.rate.value = String(Math.round(rate * 1000) / 1000);
    row.amountVal.textContent = this._fmt(c, amount);
    row.rateVal.textContent = rate.toFixed(2);
  }

  // Called by the AutomationSet setter each frame for automated controls (and
  // once on delete, to restore the base value).
  _applyAutomatedValue(autoKey, value, automated) {
    const key = autoKey.slice(AUTO_PREFIX.length);
    const c = this._cfgByKey[key];
    if (!c) return;
    this.values[key] = Math.max(c.min, Math.min(c.max, value));
    this._updateRow(c);
    if (this._onChange) this._onChange();
  }

  /** Advance automations by `dt` seconds (called once per frame). */
  tick(dt) {
    if (this._automations.size === 0) return;
    this._time += dt;
    this._automations.apply(this._time);
  }

  _enableDrag() {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const x = ox + (e.clientX - sx);
      const y = oy + (e.clientY - sy);
      this._popup.style.left = x + 'px';
      this._popup.style.top = y + 'px';
      this._popup.style.bottom = 'auto';
    };
    const onUp = () => {
      dragging = false;
      this._header.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    this._header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.hbtn')) return;
      dragging = true;
      this._header.classList.add('dragging');
      const rect = this._popup.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      sx = e.clientX; sy = e.clientY;
      this._popup.style.bottom = 'auto';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  // ─── Public API ────────────────────────────────────────
  open()  { this._popup.classList.add('open'); this._launcher.classList.add('active'); }
  close() { this._popup.classList.remove('open'); this._launcher.classList.remove('active'); }
  toggle() { this._popup.classList.contains('open') ? this.close() : this.open(); }

  reset() {
    this._automations.clear(false); // don't restore bases — we're forcing defaults
    for (const c of CONTROLS) {
      this.values[c.key] = c.def;
      this._rows[c.key].input.value = c.def;
      this._updateRow(c);
      this._syncAutoUI(c);
    }
    if (this._onChange) this._onChange();
  }

  /** Speed multiplier for the scene clock. */
  get speed() { return this.values.speed; }

  /**
   * CSS filter string for the source canvas, or null if all image controls
   * are at neutral (so callers can skip the post-process entirely).
   */
  get filter() {
    const parts = [];
    for (const c of CONTROLS) {
      if (!c.css) continue;
      const v = this.values[c.key];
      if (Math.abs(v - c.def) < 1e-6) continue;
      parts.push(`${c.css}(${v}${c.suffix || ''})`);
    }
    return parts.length ? parts.join(' ') : null;
  }
}
