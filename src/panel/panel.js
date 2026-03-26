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
    this._layerTabs = new Map();   // layer → { tab, content }
    this._activeLayer = null;
    this._visible = false;
    this._rafId = null;

    // Create host element — full-height overlay, pointer-events pass through
    this._host = document.createElement('div');
    this._host.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:10000;pointer-events:none;';

    // Attach shadow DOM
    this._shadow = this._host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    this._shadow.appendChild(style);

    // Build the drawer
    this._surface = h('div', 'control-surface hidden');
    this._shadow.appendChild(this._surface);

    this._buildDrawer();

    // Listen for layer changes
    this._onLayerAdd = (layer) => this._addLayerTab(layer);
    this._onLayerRemove = (layer) => this._removeLayerTab(layer);
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
    this._startSync();
  }

  hide() {
    this._visible = false;
    this._surface.classList.add('hidden');
    this._stopSync();
  }

  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  destroy() {
    this._stopSync();
    this._ascii.off('layeradd', this._onLayerAdd);
    this._ascii.off('layerremove', this._onLayerRemove);
    if (this._host.parentElement) {
      this._host.parentElement.removeChild(this._host);
    }
    this._controls = [];
    this._layerTabs.clear();
  }

  // ─── Build ───────────────────────────────────────────

  _buildDrawer() {
    this._surface.innerHTML = '';

    // Edge tab (toggle handle)
    const edgeTab = h('div', 'edge-tab');
    edgeTab.appendChild(h('span', 'edge-tab-icon', '\u203A'));
    edgeTab.addEventListener('click', () => this.toggle());
    this._surface.appendChild(edgeTab);

    // Drawer container (glassmorphism)
    const drawer = h('div', 'drawer');

    // Header
    const header = h('div', 'drawer-header');
    header.appendChild(h('span', 'drawer-title', 'Controls'));
    const headerBtns = h('div', 'header-btn-group');
    const closeBtn = h('div', 'close-btn', '\u00D7');
    closeBtn.addEventListener('click', () => this.hide());
    headerBtns.appendChild(closeBtn);
    header.appendChild(headerBtns);
    drawer.appendChild(header);

    // Scrollable content area
    this._scroll = h('div', 'drawer-scroll');

    // ASCII settings section
    this._buildAsciiSection();

    // Layer tabs bar (always visible for the Add button)
    this._tabBar = h('div', 'layer-tabs');
    const addBtn = h('button', 'add-layer-btn', '+');
    addBtn.title = 'Add layer';
    addBtn.addEventListener('click', () => {
      this._ascii.addLayer({
        source: this._ascii._source,
        blendMode: 'add',
        opacity: 0.5,
      });
    });
    this._tabBar.appendChild(addBtn);

    // Layer tab content container
    this._layerContent = h('div', '');

    // No-layers placeholder
    this._noLayersMsg = h('div', 'no-layers-msg', 'No layers added');

    this._scroll.appendChild(this._asciiSection);
    this._scroll.appendChild(this._tabBar);
    this._scroll.appendChild(this._layerContent);
    this._scroll.appendChild(this._noLayersMsg);
    drawer.appendChild(this._scroll);

    this._surface.appendChild(drawer);

    // Add existing layers
    for (const layer of this._ascii._layers) {
      this._addLayerTab(layer);
    }
  }

  _buildAsciiSection() {
    const section = h('div', 'section');
    const ascii = this._ascii;
    const r = PARAM_RANGES;

    const title = h('div', 'section-title');
    title.appendChild(h('span', '', 'ASCII'));
    title.appendChild(h('span', 'section-chevron', '\u25BC'));
    title.addEventListener('click', () => section.classList.toggle('collapsed'));
    section.appendChild(title);

    const body = h('div', 'section-body');

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

    // Action buttons
    const actionRow = h('div', 'action-row');
    const randomBtn = h('button', 'ctrl-btn randomize-btn', 'Randomize');
    randomBtn.title = 'Randomize all parameters';
    randomBtn.addEventListener('click', () => this._randomize());
    actionRow.appendChild(randomBtn);
    const copyBtn = h('button', 'ctrl-btn copy-btn', 'Copy');
    copyBtn.title = 'Copy all values as JSON';
    copyBtn.addEventListener('click', () => this._copySnapshot());
    actionRow.appendChild(copyBtn);
    body.appendChild(actionRow);

    section.appendChild(body);
    this._asciiSection = section;
  }

  // ─── Layer Tabs ─────────────────────────────────────

  _addLayerTab(layer) {
    // Create layer row with name, hide/show, and solo buttons
    const tab = h('div', 'layer-row');
    const tabLabel = h('span', 'layer-row-label', `Layer ${layer.id}`);
    tabLabel.addEventListener('click', () => this._activateLayer(layer));

    const btnGroup = h('div', 'layer-row-btns');

    const hideBtn = h('button', 'ctrl-btn layer-hide-btn', 'Hide');
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.set('visible', !layer.get('visible'));
    });

    const soloBtn = h('button', 'ctrl-btn layer-solo-btn', 'Solo');
    soloBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._ascii.soloLayer(layer);
      this._updateSoloBtns();
    });

    btnGroup.appendChild(hideBtn);
    btnGroup.appendChild(soloBtn);
    tab.appendChild(tabLabel);
    tab.appendChild(btnGroup);
    this._tabBar.appendChild(tab);

    // Create tab content
    const content = h('div', 'layer-tab-content');
    this._buildLayerContent(layer, content);
    this._layerContent.appendChild(content);

    this._layerTabs.set(layer, { tab, content, hideBtn, soloBtn });

    // Hide placeholder
    this._noLayersMsg.style.display = 'none';

    // Activate this layer
    this._activateLayer(layer);
  }

  _removeLayerTab(layer) {
    const entry = this._layerTabs.get(layer);
    if (!entry) return;

    entry.tab.remove();
    entry.content.remove();
    this._layerTabs.delete(layer);

    // If we removed the active layer, activate the first remaining
    if (this._activeLayer === layer) {
      this._activeLayer = null;
      const first = this._layerTabs.keys().next().value;
      if (first) this._activateLayer(first);
    }

    // Show placeholder if no layers remain
    if (this._layerTabs.size === 0) {
      this._noLayersMsg.style.display = '';
    }
  }

  _activateLayer(layer) {
    this._activeLayer = layer;

    for (const [l, entry] of this._layerTabs) {
      const isActive = l === layer;
      entry.tab.classList.toggle('active', isActive);
      entry.content.classList.toggle('active', isActive);
    }
    this._updateSoloBtns();
  }

  _buildLayerContent(layer, container) {
    const r = PARAM_RANGES;

    // Header with remove button
    const header = h('div', 'layer-header');
    header.appendChild(h('span', 'layer-title', `Layer ${layer.id}`));
    const btnGroup = h('div', 'layer-btn-group');
    const removeBtn = h('button', 'ctrl-btn danger', 'Remove');
    removeBtn.addEventListener('click', () => this._ascii.removeLayer(layer));
    btnGroup.appendChild(removeBtn);
    header.appendChild(btnGroup);
    container.appendChild(header);
    container._layer = layer;

    // Font Size
    this._register(new BarControl({
      label: 'Font Size', ...r.fontSize,
      get: () => layer.get('fontSize'),
      set: (v) => layer.set('fontSize', v),
      format: (v) => v.toFixed(1) + 'px',
    }), container);

    // Density
    this._register(new BarControl({
      label: 'Density', ...r.density,
      get: () => layer.get('density'),
      set: (v) => layer.set('density', v),
      format: (v) => v.toFixed(2),
    }), container);

    // Charset
    this._register(new Selector({
      label: 'Charset',
      options: ['inherit', ...CHARSET_NAMES],
      get: () => {
        const c = layer.get('charset');
        return c ? CHARSET_NAMES.indexOf(c) + 1 : 0;
      },
      set: (i) => layer.set('charset', i === 0 ? null : CHARSET_NAMES[i - 1]),
    }), container);

    // Color Scheme
    this._register(new Selector({
      label: 'Color',
      options: ['inherit', ...SCHEME_NAMES],
      get: () => {
        const s = layer.get('colorScheme');
        return s ? SCHEME_NAMES.indexOf(s) + 1 : 0;
      },
      set: (i) => layer.set('colorScheme', i === 0 ? null : SCHEME_NAMES[i - 1]),
    }), container);

    // Pattern
    this._register(new Selector({
      label: 'Pattern',
      options: PATTERN_NAMES,
      get: () => {
        const p = layer.get('pattern');
        return p ? PATTERN_NAMES.indexOf(p) : 0;
      },
      set: (i) => layer.set('pattern', i === 0 ? null : PATTERN_NAMES[i]),
    }), container);

    // Pattern Mix
    this._register(new BarControl({
      label: 'Pattern Mix', ...r.patternMix,
      get: () => layer.get('patternMix'),
      set: (v) => layer.set('patternMix', v),
      format: (v) => Math.round(v * 100) + '%',
    }), container);

    // Opacity
    this._register(new BarControl({
      label: 'Opacity', ...r.opacity,
      get: () => layer.get('opacity'),
      set: (v) => layer.set('opacity', v),
      format: (v) => Math.round(v * 100) + '%',
    }), container);

    // Fade
    this._register(new BarControl({
      label: 'Fade', ...r.fade,
      get: () => layer.get('fade'),
      set: (v) => layer.set('fade', v),
      format: (v) => Math.round(v * 100) + '%',
    }), container);

    // Blend Mode
    this._register(new Selector({
      label: 'Blend',
      options: BLEND_MODES,
      get: () => BLEND_MODES.indexOf(layer.get('blendMode')),
      set: (i) => layer.set('blendMode', BLEND_MODES[i]),
    }), container);

    // Offset X
    this._register(new BarControl({
      label: 'Offset X', ...r.offsetX,
      get: () => layer.get('offsetX'),
      set: (v) => layer.set('offsetX', v),
      format: (v) => Math.round(v) + 'px',
    }), container);

    // Offset Y
    this._register(new BarControl({
      label: 'Offset Y', ...r.offsetY,
      get: () => layer.get('offsetY'),
      set: (v) => layer.set('offsetY', v),
      format: (v) => Math.round(v) + 'px',
    }), container);

    // Z-Index
    this._register(new BarControl({
      label: 'Z-Index', ...r.zIndex,
      get: () => layer.get('zIndex'),
      set: (v) => layer.set('zIndex', v),
      format: (v) => String(Math.round(v)),
    }), container);
  }

  _updateSoloBtns() {
    const soloed = this._ascii._soloLayer;
    for (const [layer, entry] of this._layerTabs) {
      if (entry.soloBtn) {
        entry.soloBtn.classList.toggle('active', soloed === layer);
      }
    }
  }

  _register(ctrl, parent) {
    this._controls.push(ctrl);
    parent.appendChild(ctrl.el);
    return ctrl;
  }

  // ─── Randomize ────────────────────────────────────

  _randomize() {
    const ascii = this._ascii;
    const r = PARAM_RANGES;
    const rand = (min, max, step) => {
      const steps = Math.round((max - min) / step);
      return min + Math.round(Math.random() * steps) * step;
    };
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    ascii.set('fontSize', rand(r.fontSize.min, r.fontSize.max, r.fontSize.step));
    ascii.set('density', rand(r.density.min, r.density.max, r.density.step));
    ascii.set('charset', pick(CHARSET_NAMES));
    ascii.set('colorScheme', pick(SCHEME_NAMES));
    ascii.set('pattern', Math.random() < 0.3 ? null : pick(PATTERN_NAMES.slice(1)));
    ascii.set('patternMix', rand(r.patternMix.min, r.patternMix.max, r.patternMix.step));
    ascii.set('fade', rand(r.fade.min, r.fade.max, r.fade.step));
    ascii.set('speed', rand(r.speed.min, r.speed.max, r.speed.step));
    ascii.set('sourceOpacity', rand(r.sourceOpacity.min, r.sourceOpacity.max, r.sourceOpacity.step));
    ascii.set('colorCycle', Math.random() < 0.3);
    ascii.set('colorCycleRate', rand(r.colorCycleRate.min, r.colorCycleRate.max, r.colorCycleRate.step));

    // Randomize layers too
    for (const layer of ascii._layers) {
      layer.set('fontSize', rand(r.fontSize.min, r.fontSize.max, r.fontSize.step));
      layer.set('density', rand(r.density.min, r.density.max, r.density.step));
      layer.set('charset', pick(CHARSET_NAMES));
      layer.set('colorScheme', pick(SCHEME_NAMES));
      layer.set('pattern', Math.random() < 0.3 ? null : pick(PATTERN_NAMES.slice(1)));
      layer.set('patternMix', rand(r.patternMix.min, r.patternMix.max, r.patternMix.step));
      layer.set('fade', rand(r.fade.min, r.fade.max, r.fade.step));
      layer.set('opacity', rand(r.opacity.min, r.opacity.max, r.opacity.step));
      layer.set('blendMode', pick(BLEND_MODES));
    }

  }

  // ─── Snapshot ──────────────────────────────────────

  _copySnapshot() {
    const ascii = this._ascii;
    const GLOBAL_KEYS = [
      'enabled', 'fontSize', 'density', 'charset', 'colorScheme',
      'background', 'fade', 'speed', 'pattern', 'patternMix',
      'colorCycle', 'colorCycleRate', 'sourceOpacity', 'opacity',
      'blendMode', 'offsetX', 'offsetY', 'zIndex',
    ];
    const LAYER_KEYS = [
      'visible', 'fontSize', 'density', 'charset', 'colorScheme',
      'pattern', 'patternMix', 'fade', 'opacity', 'blendMode',
      'offsetX', 'offsetY', 'zIndex',
    ];

    const snapshot = {};
    for (const k of GLOBAL_KEYS) {
      snapshot[k] = ascii.get(k);
    }

    if (ascii._layers.length > 0 && !ascii._implicitMode) {
      snapshot.layers = ascii._layers.map(layer => {
        const obj = {};
        for (const k of LAYER_KEYS) {
          obj[k] = layer.get(k);
        }
        return obj;
      });
    }

    const json = JSON.stringify(snapshot, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      this._flashCopyBtn('Copied!');
    }, () => {
      this._flashCopyBtn('Failed');
    });
  }

  _flashCopyBtn(text) {
    const btn = this._shadow.querySelector('.copy-btn');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    btn.classList.add('flash');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('flash');
    }, 1200);
  }

  // ─── Sync Loop ───────────────────────────────────────

  _startSync() {
    if (this._rafId) return;
    const sync = () => {
      for (const c of this._controls) c.sync();
      this._syncEyeIcons();
      this._rafId = requestAnimationFrame(sync);
    };
    this._rafId = requestAnimationFrame(sync);
  }

  _syncEyeIcons() {
    for (const [layer, entry] of this._layerTabs) {
      if (entry.hideBtn) {
        const vis = layer.get('visible');
        entry.hideBtn.textContent = vis ? 'Hide' : 'Show';
        entry.tab.classList.toggle('layer-hidden', !vis);
      }
    }
  }

  _stopSync() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}
