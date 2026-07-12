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
    this.key = opts.key || null;
    this.target = opts.target || null;
    this.get = opts.get;
    this.set = opts.set;
    this.format = opts.format || (v => String(Math.round(v * 100) / 100));
    this._lastValue = this.get();
    this._lastAutoState = null;

    this.el = h('div', 'bar-ctrl');

    const header = h('div', 'bar-ctrl-header');
    header.appendChild(h('span', 'ctrl-label', opts.label));
    const headerValue = h('div', 'bar-ctrl-value');
    this.valueEl = h('span', 'ctrl-value', this.format(this.get()));
    headerValue.appendChild(this.valueEl);
    if (this._canAutomate()) {
      this.autoBtn = h('button', 'auto-btn', '~');
      this.autoBtn.title = 'Automate this parameter';
      this.autoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._getAutomation()) this.target.stopAutomation(this.key);
        else this._enableAutomation();
        this._syncAutomationUI(true);
      });
      headerValue.appendChild(this.autoBtn);
    }
    header.appendChild(headerValue);
    this.el.appendChild(header);

    this.track = h('div', 'bar-track');
    this.fill = h('div', 'bar-fill');
    this.track.appendChild(this.fill);
    this.el.appendChild(this.track);

    if (this._canAutomate()) {
      this._buildAutomationUI();
      this._syncAutomationUI(true);
    }

    this._updateFill();
    this._bindDrag();
  }

  _canAutomate() {
    return !!(
      this.key &&
      this.target &&
      this.target.automate &&
      this.target.stopAutomation &&
      this.target.getAutomation
    );
  }

  _buildAutomationUI() {
    this.autoPanel = h('div', 'auto-panel');

    this.autoType = document.createElement('select');
    this.autoType.className = 'auto-select';
    for (const type of ['sine', 'triangle', 'noise']) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      this.autoType.appendChild(opt);
    }

    this.autoAmount = document.createElement('input');
    this.autoAmount.className = 'auto-slider';
    this.autoAmount.type = 'range';
    this.autoAmount.min = '0';
    this.autoAmount.max = String(this._maxAmount());
    this.autoAmount.step = String(this.step ?? this._defaultAmountStep());

    this.autoRate = document.createElement('input');
    this.autoRate.className = 'auto-slider';
    this.autoRate.type = 'range';
    this.autoRate.min = '0';
    this.autoRate.max = '5';
    this.autoRate.step = '0.05';

    this.autoAmountValue = h('span', 'auto-value', '');
    this.autoRateValue = h('span', 'auto-value', '');

    this.autoType.addEventListener('change', () => this._updateAutomationFromUI());
    this.autoAmount.addEventListener('input', () => this._updateAutomationFromUI());
    this.autoRate.addEventListener('input', () => this._updateAutomationFromUI());

    const typeRow = h('div', 'auto-row');
    typeRow.appendChild(h('span', 'auto-label', 'Wave'));
    typeRow.appendChild(this.autoType);

    const amountRow = h('div', 'auto-row auto-slider-row');
    amountRow.appendChild(h('span', 'auto-label', 'Amt'));
    amountRow.appendChild(this.autoAmount);
    amountRow.appendChild(this.autoAmountValue);

    const rateRow = h('div', 'auto-row auto-slider-row');
    rateRow.appendChild(h('span', 'auto-label', 'Rate'));
    rateRow.appendChild(this.autoRate);
    rateRow.appendChild(this.autoRateValue);

    this.autoPanel.appendChild(typeRow);
    this.autoPanel.appendChild(amountRow);
    this.autoPanel.appendChild(rateRow);
    this.el.appendChild(this.autoPanel);
  }

  _getAutomation() {
    return this.target?.getAutomation?.(this.key) || null;
  }

  _defaultAmount() {
    const range = this.max - this.min;
    return range > 0 ? range * 0.1 : Math.max(Math.abs(this.get()) * 0.25, 1);
  }

  _maxAmount() {
    const range = this.max - this.min;
    return range > 0 ? range / 2 : Math.max(this._defaultAmount() * 4, 1);
  }

  _defaultAmountStep() {
    const amount = this._defaultAmount();
    if (amount >= 10) return 1;
    if (amount >= 1) return 0.1;
    return 0.01;
  }

  _enableAutomation() {
    this.target.automate(this.key, {
      type: this.autoType?.value || 'sine',
      amount: this._defaultAmount(),
      rate: 0.5,
    });
  }

  _updateAutomationFromUI() {
    const current = this._getAutomation();
    const amount = Math.max(0, Number(this.autoAmount.value || this._defaultAmount()));
    const rate = Math.max(0, Number(this.autoRate.value || 0));
    this.target.automate(this.key, {
      type: this.autoType.value,
      base: current?.base,
      phase: current?.phase,
      seed: current?.seed,
      amount,
      rate,
    });
    this._syncAutomationUI(true);
  }

  _syncAutomationUI(force = false) {
    if (!this._canAutomate()) return;
    const automation = this._getAutomation();
    const state = automation ? `${automation.type}:${automation.amount}:${automation.rate}` : 'off';
    if (!force && state === this._lastAutoState) return;
    this._lastAutoState = state;

    this.autoBtn.classList.toggle('active', !!automation);
    this.el.classList.toggle('automated', !!automation);
    this.autoPanel.classList.toggle('open', !!automation);

    if (!automation) return;
    this.autoType.value = automation.type || 'sine';
    const amount = automation.amount ?? ((automation.max - automation.min) / 2);
    const rate = automation.rate ?? 0;
    this.autoAmount.value = String(Math.round(amount * 1000) / 1000);
    this.autoRate.value = String(Math.round(rate * 1000) / 1000);
    this.autoAmountValue.textContent = this.format(amount);
    this.autoRateValue.textContent = rate.toFixed(2);
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
    this._syncAutomationUI();
  }

  sync() {
    const v = this.get();
    if (v !== this._lastValue) this.update();
    else this._syncAutomationUI();
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
