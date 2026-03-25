// ─── DOM Helper ──────────────────────────────────────────
export function h(tag, cls, content) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (typeof content === 'string') el.textContent = content;
  else if (content instanceof Node) el.appendChild(content);
  else if (Array.isArray(content)) content.forEach(c => { if (c) el.appendChild(c); });
  return el;
}

// ─── Bar Control ─────────────────────────────────────────
export class BarControl {
  constructor(opts) {
    this.min = opts.min;
    this.max = opts.max;
    this.step = opts.step ?? null;
    this.get = opts.get;
    this.set = opts.set;
    this.format = opts.format || (v => String(Math.round(v * 100) / 100));
    this._lastValue = this.get();

    this.el = h('div', 'bar-ctrl');

    const header = h('div', 'bar-ctrl-header');
    header.appendChild(h('span', 'ctrl-label', opts.label));
    this.valueEl = h('span', 'ctrl-value', this.format(this.get()));
    header.appendChild(this.valueEl);
    this.el.appendChild(header);

    this.track = h('div', 'bar-track');
    this.fill = h('div', 'bar-fill');
    this.track.appendChild(this.fill);
    this.el.appendChild(this.track);

    this._updateFill();
    this._bindDrag();
  }

  _bindDrag() {
    const start = (e) => {
      e.preventDefault();
      this.track.classList.add('dragging');
      this._setFromPointer(e);

      const move = (e) => { e.preventDefault(); this._setFromPointer(e); };
      const end = () => {
        this.track.classList.remove('dragging');
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', end);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end);
    };

    this.track.addEventListener('mousedown', start);
    this.track.addEventListener('touchstart', (e) => {
      e.preventDefault();
      start(e.touches[0]);
    }, { passive: false });
  }

  _setFromPointer(e) {
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const rect = this.track.getBoundingClientRect();
    let norm = (clientX - rect.left) / rect.width;
    norm = Math.max(0, Math.min(1, norm));
    let value = this.min + norm * (this.max - this.min);
    if (this.step != null) {
      value = Math.round(value / this.step) * this.step;
      value = Math.max(this.min, Math.min(this.max, value));
    }
    this.set(value);
    this.update();
  }

  _updateFill() {
    const v = this.get();
    const range = this.max - this.min;
    const norm = range > 0 ? (v - this.min) / range : 0;
    this.fill.style.width = (Math.max(0, Math.min(1, norm)) * 100) + '%';
  }

  update() {
    this._updateFill();
    this.valueEl.textContent = this.format(this.get());
    this._lastValue = this.get();
  }

  sync() {
    const v = this.get();
    if (v !== this._lastValue) this.update();
  }
}

// ─── Arrow Selector ──────────────────────────────────────
export class Selector {
  constructor(opts) {
    this.options = opts.options;
    this.get = opts.get;
    this.set = opts.set;
    this._lastValue = this.get();

    this.el = h('div', 'ctrl-selector');
    if (opts.label) this.el.appendChild(h('div', 'ctrl-label', opts.label));

    const row = h('div', 'selector');
    const prev = h('button', 'sel-arrow', '\u2039');
    this.display = h('span', 'sel-display', this.options[this.get()] || '');
    const next = h('button', 'sel-arrow', '\u203A');

    prev.addEventListener('click', () => {
      const idx = (this.get() - 1 + this.options.length) % this.options.length;
      this.set(idx);
      this.update();
    });
    next.addEventListener('click', () => {
      const idx = (this.get() + 1) % this.options.length;
      this.set(idx);
      this.update();
    });

    row.appendChild(prev);
    row.appendChild(this.display);
    row.appendChild(next);
    this.el.appendChild(row);
  }

  update() {
    this.display.textContent = this.options[this.get()] || '';
    this._lastValue = this.get();
  }

  sync() {
    if (this.get() !== this._lastValue) this.update();
  }
}

// ─── Toggle ──────────────────────────────────────────────
export class Toggle {
  constructor(opts) {
    this.get = opts.get;
    this.set = opts.set;
    this._lastValue = this.get();

    this.el = h('div', 'toggle-row');
    this.pill = h('div', 'toggle-pill');
    if (this.get()) this.pill.classList.add('on');

    this.pill.addEventListener('click', () => {
      this.set(!this.get());
      this.update();
    });

    this.el.appendChild(this.pill);
    this.el.appendChild(h('span', 'toggle-label', opts.label));
  }

  update() {
    this.pill.classList.toggle('on', this.get());
    this._lastValue = this.get();
  }

  sync() {
    if (this.get() !== this._lastValue) this.update();
  }
}
