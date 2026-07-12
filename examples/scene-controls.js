// ─── Scene Controls: draggable popup for global source-scene adjustment ──────
//
// Adjusts the SOURCE canvas (the raw scene, i.e. what you'd see with the ASCII
// filter disabled) before it is sampled each frame. Because the sampler reads
// luminance, brightness/contrast flow through into the ASCII glyphs too, while
// hue/saturation recolor the underlying scene itself. Speed rescales time.
//
// Self-contained (shadow DOM), so it drops into any example with zero styling
// conflicts. createApp() wires it in automatically.

const CONTROLS = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 2, step: 0.01, def: 1, unit: 'x', css: 'brightness' },
  { key: 'contrast',   label: 'Contrast',   min: 0, max: 2, step: 0.01, def: 1, unit: 'x', css: 'contrast' },
  { key: 'saturate',   label: 'Saturation', min: 0, max: 2, step: 0.01, def: 1, unit: 'x', css: 'saturate' },
  { key: 'hue',        label: 'Hue',        min: 0, max: 360, step: 1, def: 0, unit: '°', css: 'hue-rotate', suffix: 'deg' },
  { key: 'blur',       label: 'Blur',       min: 0, max: 8, step: 0.1, def: 0, unit: 'px', css: 'blur', suffix: 'px' },
  { key: 'invert',     label: 'Invert',     min: 0, max: 1, step: 0.01, def: 0, unit: '', css: 'invert' },
  { key: 'speed',      label: 'Speed',      min: 0, max: 3, step: 0.01, def: 1, unit: 'x', css: null },
];

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
.ctrl-val { font: 600 9.5px/1 inherit; color: #b0b0c8; }
.ctrl-val.modified { color: #ff6b35; }

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
          <span class="ctrl-val"></span>
        </div>
        <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}">
      `;
      const input = ctrl.querySelector('input');
      const val = ctrl.querySelector('.ctrl-val');
      input.addEventListener('input', () => {
        this.values[c.key] = parseFloat(input.value);
        this._updateRow(c);
        if (this._onChange) this._onChange();
      });
      this._body.appendChild(ctrl);
      this._rows[c.key] = { input, val, cfg: c };
      this._updateRow(c);
    });

    this._popup.querySelector('.close-btn').addEventListener('click', () => this.close());
    this._popup.querySelector('.reset-btn').addEventListener('click', () => this.reset());

    this._enableDrag();
  }

  _updateRow(c) {
    const row = this._rows[c.key];
    const v = this.values[c.key];
    const shown = c.step >= 1 ? Math.round(v) : v.toFixed(2);
    row.val.textContent = `${shown}${c.unit}`;
    row.val.classList.toggle('modified', Math.abs(v - c.def) > 1e-6);
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
    for (const c of CONTROLS) {
      this.values[c.key] = c.def;
      this._rows[c.key].input.value = c.def;
      this._updateRow(c);
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
