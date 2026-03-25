import { PANEL_CSS } from './styles.js';
import { h, BarControl, Selector, Toggle } from './components.js';
import { CHARSETS } from '../data/charsets.js';
import { COLOR_SCHEMES } from '../color/schemes.js';
import { PATTERNS } from '../patterns.js';
import { PARAM_RANGES } from '../data/defaults.js';

const CHARSET_NAMES = CHARSETS.map(c => c.name);
const SCHEME_NAMES = COLOR_SCHEMES.map(s => s.name);
const PATTERN_NAMES = ['none', ...PATTERNS.map(p => p.name)];
const BLEND_MODES = ['replace', 'add'];

export class ControlPanel {
  constructor(ascii, options = {}) {
    this._ascii = ascii;
    this._controls = [];
    this._layerSections = new Map();
    this._visible = false;
    this._rafId = null;

    // Create host element
    this._host = document.createElement('div');
    this._host.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:10000;pointer-events:none;';

    // Attach shadow DOM
    this._shadow = this._host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    this._shadow.appendChild(style);

    // Build surface
    this._surface = h('div', 'control-surface hidden');
    this._surface.style.pointerEvents = 'auto';
    this._shadow.appendChild(this._surface);

    this._buildPanels();

    // Listen for layer changes
    this._onLayerAdd = (layer) => this._addLayerSection(layer);
    this._onLayerRemove = (layer) => this._removeLayerSection(layer);
    ascii.on('layeradd', this._onLayerAdd);
    ascii.on('layerremove', this._onLayerRemove);

    // Insert into DOM
    const parent = ascii._source.parentElement;
    if (parent) {
      parent.appendChild(this._host);
    }
  }

  get visible() { return this._visible; }

  show() {
    this._visible = true;
    this._surface.classList.remove('hidden');
    // Expand all sections when showing
    this._setPanelsCollapsed(false);
    this._startSync();
  }

  hide() {
    this._visible = false;
    this._surface.classList.add('hidden');
    this._stopSync();
  }

  toggleSections() {
    const panels = this._surface.querySelectorAll('.panel');
    const anyExpanded = [...panels].some(p => !p.classList.contains('collapsed'));
    this._setPanelsCollapsed(anyExpanded);
  }

  _setPanelsCollapsed(collapsed) {
    const panels = this._surface.querySelectorAll('.panel');
    panels.forEach(p => p.classList.toggle('collapsed', collapsed));
  }

  destroy() {
    this._stopSync();
    this._ascii.off('layeradd', this._onLayerAdd);
    this._ascii.off('layerremove', this._onLayerRemove);
    if (this._host.parentElement) {
      this._host.parentElement.removeChild(this._host);
    }
    this._controls = [];
    this._layerSections.clear();
  }

  // ─── Build ───────────────────────────────────────────

  _buildPanels() {
    this._surface.innerHTML = '';

    // Instance panel
    this._instancePanel = this._buildInstancePanel();
    this._surface.appendChild(this._instancePanel);

    // Layer panels container
    this._layersContainer = h('div', 'panel');

    const layersTitle = h('div', 'panel-title');
    layersTitle.appendChild(h('span', '', 'Layers'));
    layersTitle.appendChild(h('span', 'panel-chevron', '\u25BC'));
    layersTitle.addEventListener('click', () => this._layersContainer.classList.toggle('collapsed'));
    this._layersContainer.appendChild(layersTitle);

    this._layersContent = h('div', 'panel-body');
    this._layersContainer.appendChild(this._layersContent);

    // Add existing layers
    for (const layer of this._ascii._layers) {
      this._addLayerSection(layer);
    }

    this._surface.appendChild(this._layersContainer);
  }

  _buildInstancePanel() {
    const panel = h('div', 'panel');

    const title = h('div', 'panel-title');
    title.appendChild(h('span', '', 'ASCII'));
    title.appendChild(h('span', 'panel-chevron', '\u25BC'));
    title.addEventListener('click', () => panel.classList.toggle('collapsed'));
    panel.appendChild(title);

    const body = h('div', 'panel-body');
    const ascii = this._ascii;
    const r = PARAM_RANGES;

    // Enabled
    this._register(new Toggle({
      label: 'Enabled',
      get: () => ascii.get('enabled'),
      set: (v) => ascii.set('enabled', v),
    }), body);

    // Font Size
    this._register(new BarControl({
      label: 'Font Size', ...r.fontSize,
      get: () => ascii.get('fontSize'),
      set: (v) => ascii.set('fontSize', v),
      format: (v) => v.toFixed(1) + 'px',
    }), body);

    // Density
    this._register(new BarControl({
      label: 'Density', ...r.density,
      get: () => ascii.get('density'),
      set: (v) => ascii.set('density', v),
      format: (v) => v.toFixed(2),
    }), body);

    // Charset
    this._register(new Selector({
      label: 'Charset',
      options: CHARSET_NAMES,
      get: () => CHARSET_NAMES.indexOf(ascii.get('charset')),
      set: (i) => ascii.set('charset', CHARSET_NAMES[i]),
    }), body);

    // Color Scheme
    this._register(new Selector({
      label: 'Color',
      options: SCHEME_NAMES,
      get: () => SCHEME_NAMES.indexOf(ascii.get('colorScheme')),
      set: (i) => ascii.set('colorScheme', SCHEME_NAMES[i]),
    }), body);

    // Pattern
    this._register(new Selector({
      label: 'Pattern',
      options: PATTERN_NAMES,
      get: () => {
        const p = ascii.get('pattern');
        return p ? PATTERN_NAMES.indexOf(p) : 0;
      },
      set: (i) => ascii.set('pattern', i === 0 ? null : PATTERN_NAMES[i]),
    }), body);

    // Pattern Mix
    this._register(new BarControl({
      label: 'Pattern Mix', ...r.patternMix,
      get: () => ascii.get('patternMix'),
      set: (v) => ascii.set('patternMix', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    // Fade
    this._register(new BarControl({
      label: 'Fade', ...r.fade,
      get: () => ascii.get('fade'),
      set: (v) => ascii.set('fade', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    // Speed
    this._register(new BarControl({
      label: 'Speed', ...r.speed,
      get: () => ascii.get('speed'),
      set: (v) => ascii.set('speed', v),
      format: (v) => v.toFixed(1) + 'x',
    }), body);

    // Source Opacity
    this._register(new BarControl({
      label: 'Source Opacity', ...r.sourceOpacity,
      get: () => ascii.get('sourceOpacity'),
      set: (v) => ascii.set('sourceOpacity', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    // Color Cycle
    this._register(new Toggle({
      label: 'Color Cycle',
      get: () => ascii.get('colorCycle'),
      set: (v) => ascii.set('colorCycle', v),
    }), body);

    // Color Cycle Rate
    this._register(new BarControl({
      label: 'Cycle Rate', ...r.colorCycleRate,
      get: () => ascii.get('colorCycleRate'),
      set: (v) => ascii.set('colorCycleRate', v),
      format: (v) => v.toFixed(1) + '/s',
    }), body);

    panel.appendChild(body);
    return panel;
  }

  _addLayerSection(layer) {
    const section = h('div', '');
    const r = PARAM_RANGES;

    // Header with title and remove button
    const header = h('div', 'layer-header');
    header.appendChild(h('span', 'layer-title', `Layer ${layer.id}`));
    const removeBtn = h('button', 'ctrl-btn danger', 'Remove');
    removeBtn.addEventListener('click', () => this._ascii.removeLayer(layer));
    header.appendChild(removeBtn);
    section.appendChild(header);

    // Visible toggle
    this._register(new Toggle({
      label: 'Visible',
      get: () => layer.get('visible'),
      set: (v) => layer.set('visible', v),
    }), section);

    // Font Size
    this._register(new BarControl({
      label: 'Font Size', ...r.fontSize,
      get: () => layer.get('fontSize'),
      set: (v) => layer.set('fontSize', v),
      format: (v) => v.toFixed(1) + 'px',
    }), section);

    // Density
    this._register(new BarControl({
      label: 'Density', ...r.density,
      get: () => layer.get('density'),
      set: (v) => layer.set('density', v),
      format: (v) => v.toFixed(2),
    }), section);

    // Charset
    this._register(new Selector({
      label: 'Charset',
      options: ['inherit', ...CHARSET_NAMES],
      get: () => {
        const c = layer.get('charset');
        return c ? CHARSET_NAMES.indexOf(c) + 1 : 0;
      },
      set: (i) => layer.set('charset', i === 0 ? null : CHARSET_NAMES[i - 1]),
    }), section);

    // Color Scheme
    this._register(new Selector({
      label: 'Color',
      options: ['inherit', ...SCHEME_NAMES],
      get: () => {
        const s = layer.get('colorScheme');
        return s ? SCHEME_NAMES.indexOf(s) + 1 : 0;
      },
      set: (i) => layer.set('colorScheme', i === 0 ? null : SCHEME_NAMES[i - 1]),
    }), section);

    // Pattern
    this._register(new Selector({
      label: 'Pattern',
      options: PATTERN_NAMES,
      get: () => {
        const p = layer.get('pattern');
        return p ? PATTERN_NAMES.indexOf(p) : 0;
      },
      set: (i) => layer.set('pattern', i === 0 ? null : PATTERN_NAMES[i]),
    }), section);

    // Pattern Mix
    this._register(new BarControl({
      label: 'Pattern Mix', ...r.patternMix,
      get: () => layer.get('patternMix'),
      set: (v) => layer.set('patternMix', v),
      format: (v) => Math.round(v * 100) + '%',
    }), section);

    // Opacity
    this._register(new BarControl({
      label: 'Opacity', ...r.opacity,
      get: () => layer.get('opacity'),
      set: (v) => layer.set('opacity', v),
      format: (v) => Math.round(v * 100) + '%',
    }), section);

    // Blend Mode
    this._register(new Selector({
      label: 'Blend',
      options: BLEND_MODES,
      get: () => BLEND_MODES.indexOf(layer.get('blendMode')),
      set: (i) => layer.set('blendMode', BLEND_MODES[i]),
    }), section);

    // Divider
    section.appendChild(h('div', 'ctrl-divider'));

    this._layersContent.appendChild(section);
    this._layerSections.set(layer, section);
  }

  _removeLayerSection(layer) {
    const section = this._layerSections.get(layer);
    if (section && section.parentElement) {
      section.parentElement.removeChild(section);
    }
    this._layerSections.delete(layer);
  }

  _register(ctrl, parent) {
    this._controls.push(ctrl);
    parent.appendChild(ctrl.el);
    return ctrl;
  }

  // ─── Sync Loop ───────────────────────────────────────

  _startSync() {
    if (this._rafId) return;
    const sync = () => {
      for (const c of this._controls) c.sync();
      this._rafId = requestAnimationFrame(sync);
    };
    this._rafId = requestAnimationFrame(sync);
  }

  _stopSync() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}
