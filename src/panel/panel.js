import { PANEL_CSS } from './styles.js';
import { h, BarControl, Selector, Toggle } from './components.js';
import { CHARSETS } from '../data/charsets.js';
import { EDGE_CHARSETS } from '../data/edge-charsets.js';
import { COLOR_SCHEMES } from '../color/schemes.js';
import { PATTERNS } from '../patterns.js';
import { PARAM_RANGES } from '../data/defaults.js';

const CHARSET_NAMES = CHARSETS.map(c => c.name);
const EDGE_CHARSET_NAMES = EDGE_CHARSETS.map(c => c.name);
const SCHEME_NAMES = COLOR_SCHEMES.map(s => s.name);
const COLOR_OPTIONS = ['source', ...SCHEME_NAMES];
const PATTERN_NAMES = ['none', ...PATTERNS.map(p => p.name)];
const BLEND_MODES = ['replace', 'add'];
const RENDER_MODES = ['2d', '3d'];
const AUTOMATION_TYPES = ['sine', 'triangle', 'noise', 'mouseX', 'mouseY', 'scroll'];

const GLOBAL_KEYS = [
  'enabled', 'fontSize', 'density', 'charset', 'colorScheme',
  'background', 'fade', 'speed', 'pattern', 'patternMix',
  'colorCycle', 'colorCycleRate', 'sourceOpacity', 'opacity',
  'blendMode', 'offsetX', 'offsetY', 'zIndex',
  'renderMode', 'depthScale', 'perspective', 'rotationX', 'rotationY',
  'rotationZ', 'cameraZ', 'depthOpacity', 'depthSmoothing',
  'edgeDetect', 'edgeThreshold', 'edgeCharset',
  'crtEnabled', 'crtScanlines', 'crtGlow', 'crtDistortion', 'crtFlicker',
];

const LAYER_KEYS = [
  'visible', 'fontSize', 'density', 'charset', 'colorScheme',
  'pattern', 'patternMix', 'fade', 'opacity', 'blendMode',
  'offsetX', 'offsetY', 'zIndex',
  'edgeDetect', 'edgeThreshold', 'edgeCharset',
  'maskLayer', 'invertMask',
];

const BOOLEAN_KEYS = new Set([
  'enabled', 'colorCycle', 'edgeDetect', 'crtEnabled', 'visible', 'invertMask',
]);

const STRING_KEYS = new Set(['background']);

export class ControlPanel {
  constructor(ascii, options = {}) {
    this._ascii = ascii;
    this._controls = [];
    this._implicitOnlyEls = [];    // image controls that only drive implicit (layerless) mode
    this._threeDOnlyEls = [];      // projection controls that only apply in 3D mode
    this._edgeOnlyEntries = [];    // edge controls keyed to their global/layer target
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
    this._onLayerAdd = (layer) => { this._addLayerTab(layer); this._updateMaskSelectors(); this._updateImageControlsVisibility(); this._updateEdgeControlsVisibility(); };
    this._onLayerRemove = (layer) => { this._removeLayerTab(layer); this._updateMaskSelectors(); this._updateImageControlsVisibility(); this._updateEdgeControlsVisibility(); };
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
    if (this._popupWindow && !this._popupWindow.closed) {
      const popup = this._popupWindow;
      this._popIn();
      popup.close();
      return;
    }
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
    if (this._popupWindow && !this._popupWindow.closed) {
      this._popIn();
      this._popupWindow.close();
    }
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
    this._popoutBtn = h('div', 'popout-btn', '\u2197');
    this._popoutBtn.title = 'Pop out to separate window';
    this._popoutBtn.addEventListener('click', () => this._togglePopOut());
    headerBtns.appendChild(this._popoutBtn);
    const closeBtn = h('div', 'close-btn', '\u00D7');
    closeBtn.addEventListener('click', () => this.hide());
    headerBtns.appendChild(closeBtn);
    header.appendChild(headerBtns);
    drawer.appendChild(header);

    // Scrollable content area
    this._scroll = h('div', 'drawer-scroll');

    // ASCII settings section
    this._buildAsciiSection();

    // CRT post-processing section
    this._buildCRTSection();

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
    this._scroll.appendChild(this._crtSection);
    this._scroll.appendChild(this._tabBar);
    this._scroll.appendChild(this._layerContent);
    this._scroll.appendChild(this._noLayersMsg);
    drawer.appendChild(this._scroll);

    this._surface.appendChild(drawer);

    // Resize handle (drag left edge to widen/narrow)
    this._resizeHandle = h('div', 'resize-handle');
    this._surface.appendChild(this._resizeHandle);
    this._initResize();

    // Add existing layers
    for (const layer of this._ascii._layers) {
      this._addLayerTab(layer);
    }

    // Reflect current mode: hide controls that are inactive in this context
    this._updateImageControlsVisibility();
    this._update3DControlsVisibility();
    this._updateEdgeControlsVisibility();
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

    // Image controls below only affect implicit (layerless) mode — when
    // explicit layers exist, the per-layer tabs own these, so they're hidden.

    // Font Size
    this._registerImplicit(new BarControl({
      label: 'Font Size', key: 'fontSize', target: ascii, ...r.fontSize,
      get: () => ascii.get('fontSize'),
      set: (v) => ascii.set('fontSize', v),
      format: (v) => v.toFixed(1) + 'px',
    }), body);

    // Density
    this._registerImplicit(new BarControl({
      label: 'Density', key: 'density', target: ascii, ...r.density,
      get: () => ascii.get('density'),
      set: (v) => ascii.set('density', v),
      format: (v) => v.toFixed(2),
    }), body);

    // Charset
    this._registerImplicit(new Selector({
      label: 'Charset',
      options: CHARSET_NAMES,
      get: () => CHARSET_NAMES.indexOf(ascii.get('charset')),
      set: (i) => ascii.set('charset', CHARSET_NAMES[i]),
    }), body);

    // Edge Detect
    this._registerImplicit(new Toggle({
      label: 'Edge Detect',
      get: () => ascii.get('edgeDetect'),
      set: (v) => {
        ascii.set('edgeDetect', v);
        this._updateEdgeControlsVisibility();
      },
    }), body);

    // Edge Threshold
    this._registerImplicitEdge(new BarControl({
      label: 'Edge Threshold', key: 'edgeThreshold', target: ascii, ...r.edgeThreshold,
      get: () => ascii.get('edgeThreshold'),
      set: (v) => ascii.set('edgeThreshold', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body, ascii);

    // Edge Charset
    this._registerImplicitEdge(new Selector({
      label: 'Edge Charset',
      options: EDGE_CHARSET_NAMES,
      get: () => EDGE_CHARSET_NAMES.indexOf(ascii.get('edgeCharset')),
      set: (i) => ascii.set('edgeCharset', EDGE_CHARSET_NAMES[i]),
    }), body, ascii);

    // Color Scheme
    this._registerImplicit(new Selector({
      label: 'Color',
      options: COLOR_OPTIONS,
      get: () => COLOR_OPTIONS.indexOf(ascii.get('colorScheme')),
      set: (i) => ascii.set('colorScheme', COLOR_OPTIONS[i]),
    }), body);

    // Pattern
    this._registerImplicit(new Selector({
      label: 'Pattern',
      options: PATTERN_NAMES,
      get: () => {
        const p = ascii.get('pattern');
        return p ? PATTERN_NAMES.indexOf(p) : 0;
      },
      set: (i) => ascii.set('pattern', i === 0 ? null : PATTERN_NAMES[i]),
    }), body);

    // Pattern Mix
    this._registerImplicit(new BarControl({
      label: 'Pattern Mix', key: 'patternMix', target: ascii, ...r.patternMix,
      get: () => ascii.get('patternMix'),
      set: (v) => ascii.set('patternMix', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    // Fade
    this._registerImplicit(new BarControl({
      label: 'Fade', key: 'fade', target: ascii, ...r.fade,
      get: () => ascii.get('fade'),
      set: (v) => ascii.set('fade', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    // Render Mode
    this._register(new Selector({
      label: 'Render Mode',
      options: RENDER_MODES,
      get: () => Math.max(0, RENDER_MODES.indexOf(ascii.get('renderMode'))),
      set: (i) => {
        ascii.set('renderMode', RENDER_MODES[i]);
        this._update3DControlsVisibility();
      },
    }), body);

    // 3D projection controls
    this._register3D(new BarControl({
      label: 'Depth Scale', key: 'depthScale', target: ascii, ...r.depthScale,
      get: () => ascii.get('depthScale'),
      set: (v) => ascii.set('depthScale', v),
      format: (v) => Math.round(v) + 'px',
    }), body);

    this._register3D(new BarControl({
      label: 'Perspective', key: 'perspective', target: ascii, ...r.perspective,
      get: () => ascii.get('perspective'),
      set: (v) => ascii.set('perspective', v),
      format: (v) => Math.round(v) + 'px',
    }), body);

    this._register3D(new BarControl({
      label: 'Rotate X', key: 'rotationX', target: ascii, ...r.rotationX,
      get: () => ascii.get('rotationX'),
      set: (v) => ascii.set('rotationX', v),
      format: (v) => v.toFixed(2),
    }), body);

    this._register3D(new BarControl({
      label: 'Rotate Y', key: 'rotationY', target: ascii, ...r.rotationY,
      get: () => ascii.get('rotationY'),
      set: (v) => ascii.set('rotationY', v),
      format: (v) => v.toFixed(2),
    }), body);

    this._register3D(new BarControl({
      label: 'Rotate Z', key: 'rotationZ', target: ascii, ...r.rotationZ,
      get: () => ascii.get('rotationZ'),
      set: (v) => ascii.set('rotationZ', v),
      format: (v) => v.toFixed(2),
    }), body);

    this._register3D(new BarControl({
      label: 'Camera Z', key: 'cameraZ', target: ascii, ...r.cameraZ,
      get: () => ascii.get('cameraZ'),
      set: (v) => ascii.set('cameraZ', v),
      format: (v) => Math.round(v) + 'px',
    }), body);

    this._register3D(new BarControl({
      label: 'Depth Opacity', key: 'depthOpacity', target: ascii, ...r.depthOpacity,
      get: () => ascii.get('depthOpacity'),
      set: (v) => ascii.set('depthOpacity', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    this._register3D(new BarControl({
      label: 'Depth Smoothing', key: 'depthSmoothing', target: ascii, ...r.depthSmoothing,
      get: () => ascii.get('depthSmoothing'),
      set: (v) => ascii.set('depthSmoothing', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    // Speed
    this._register(new BarControl({
      label: 'Speed', key: 'speed', target: ascii, ...r.speed,
      get: () => ascii.get('speed'),
      set: (v) => ascii.set('speed', v),
      format: (v) => v.toFixed(1) + 'x',
    }), body);

    // Source Opacity
    this._register(new BarControl({
      label: 'Source Opacity', key: 'sourceOpacity', target: ascii, ...r.sourceOpacity,
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
      label: 'Cycle Rate', key: 'colorCycleRate', target: ascii, ...r.colorCycleRate,
      get: () => ascii.get('colorCycleRate'),
      set: (v) => ascii.set('colorCycleRate', v),
      format: (v) => v.toFixed(1) + '/s',
    }), body);

    // Action buttons
    const actionRow = h('div', 'action-row');
    const randomBtn = h('button', 'ctrl-btn randomize-btn', 'Randomize');
    randomBtn.title = 'Nudge a few parameters';
    randomBtn.addEventListener('click', () => this._randomize());
    actionRow.appendChild(randomBtn);
    const copyBtn = h('button', 'ctrl-btn copy-btn', 'Copy');
    copyBtn.title = 'Copy all values as JSON';
    copyBtn.addEventListener('click', () => this._copySnapshot());
    actionRow.appendChild(copyBtn);
    const pasteBtn = h('button', 'ctrl-btn paste-btn', 'Paste');
    pasteBtn.title = 'Paste JSON values from clipboard';
    pasteBtn.addEventListener('click', () => this._pasteSnapshot());
    actionRow.appendChild(pasteBtn);
    body.appendChild(actionRow);

    section.appendChild(body);
    this._asciiSection = section;
  }

  _buildCRTSection() {
    const section = h('div', 'section collapsed');
    const ascii = this._ascii;
    const r = PARAM_RANGES;

    const title = h('div', 'section-title');
    title.appendChild(h('span', '', 'CRT'));
    title.appendChild(h('span', 'section-chevron', '\u25BC'));
    title.addEventListener('click', () => section.classList.toggle('collapsed'));
    section.appendChild(title);

    const body = h('div', 'section-body');

    this._register(new Toggle({
      label: 'CRT Enabled',
      get: () => ascii.get('crtEnabled'),
      set: (v) => ascii.set('crtEnabled', v),
    }), body);

    this._register(new BarControl({
      label: 'Scanlines', key: 'crtScanlines', target: ascii, ...r.crtScanlines,
      get: () => ascii.get('crtScanlines'),
      set: (v) => ascii.set('crtScanlines', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    this._register(new BarControl({
      label: 'Glow', key: 'crtGlow', target: ascii, ...r.crtGlow,
      get: () => ascii.get('crtGlow'),
      set: (v) => ascii.set('crtGlow', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    this._register(new BarControl({
      label: 'Distortion', key: 'crtDistortion', target: ascii, ...r.crtDistortion,
      get: () => ascii.get('crtDistortion'),
      set: (v) => ascii.set('crtDistortion', v),
      format: (v) => v.toFixed(2),
    }), body);

    this._register(new BarControl({
      label: 'Flicker', key: 'crtFlicker', target: ascii, ...r.crtFlicker,
      get: () => ascii.get('crtFlicker'),
      set: (v) => ascii.set('crtFlicker', v),
      format: (v) => Math.round(v * 100) + '%',
    }), body);

    section.appendChild(body);
    this._crtSection = section;
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
      label: 'Font Size', key: 'fontSize', target: layer, ...r.fontSize,
      get: () => layer.get('fontSize'),
      set: (v) => layer.set('fontSize', v),
      format: (v) => v.toFixed(1) + 'px',
    }), container);

    // Density
    this._register(new BarControl({
      label: 'Density', key: 'density', target: layer, ...r.density,
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

    // Edge Detect
    this._register(new Toggle({
      label: 'Edge Detect',
      get: () => layer.get('edgeDetect'),
      set: (v) => {
        layer.set('edgeDetect', v);
        this._updateEdgeControlsVisibility();
      },
    }), container);

    // Edge Threshold
    this._registerEdge(new BarControl({
      label: 'Edge Threshold', key: 'edgeThreshold', target: layer, ...PARAM_RANGES.edgeThreshold,
      get: () => layer.get('edgeThreshold'),
      set: (v) => layer.set('edgeThreshold', v),
      format: (v) => Math.round(v * 100) + '%',
    }), container, layer);

    // Edge Charset
    this._registerEdge(new Selector({
      label: 'Edge Charset',
      options: EDGE_CHARSET_NAMES,
      get: () => EDGE_CHARSET_NAMES.indexOf(layer.get('edgeCharset')),
      set: (i) => layer.set('edgeCharset', EDGE_CHARSET_NAMES[i]),
    }), container, layer);

    // Color Scheme
    this._register(new Selector({
      label: 'Color',
      options: ['inherit', ...COLOR_OPTIONS],
      get: () => {
        const s = layer.get('colorScheme');
        return s ? COLOR_OPTIONS.indexOf(s) + 1 : 0;
      },
      set: (i) => layer.set('colorScheme', i === 0 ? null : COLOR_OPTIONS[i - 1]),
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
      label: 'Pattern Mix', key: 'patternMix', target: layer, ...r.patternMix,
      get: () => layer.get('patternMix'),
      set: (v) => layer.set('patternMix', v),
      format: (v) => Math.round(v * 100) + '%',
    }), container);

    // Opacity
    this._register(new BarControl({
      label: 'Opacity', key: 'opacity', target: layer, ...r.opacity,
      get: () => layer.get('opacity'),
      set: (v) => layer.set('opacity', v),
      format: (v) => Math.round(v * 100) + '%',
    }), container);

    // Fade
    this._register(new BarControl({
      label: 'Fade', key: 'fade', target: layer, ...r.fade,
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

    // Mask Layer
    let maskSelector;
    maskSelector = this._register(new Selector({
      label: 'Mask',
      options: this._buildMaskOptions(layer),
      get: () => {
        const id = layer.get('maskLayer');
        if (id == null || !maskSelector) return 0;
        return Math.max(0, maskSelector.options.findIndex(o => o === `Layer ${id}`));
      },
      set: (i) => {
        if (i === 0 || !maskSelector) { layer.set('maskLayer', null); return; }
        const match = maskSelector.options[i]?.match(/^Layer (\d+)$/);
        if (match) layer.set('maskLayer', parseInt(match[1], 10));
      },
    }), container);
    container._maskSelector = maskSelector;

    // Invert Mask
    this._register(new Toggle({
      label: 'Invert Mask',
      get: () => layer.get('invertMask'),
      set: (v) => layer.set('invertMask', v),
    }), container);

    // Offset X
    this._register(new BarControl({
      label: 'Offset X', key: 'offsetX', target: layer, ...r.offsetX,
      get: () => layer.get('offsetX'),
      set: (v) => layer.set('offsetX', v),
      format: (v) => Math.round(v) + 'px',
    }), container);

    // Offset Y
    this._register(new BarControl({
      label: 'Offset Y', key: 'offsetY', target: layer, ...r.offsetY,
      get: () => layer.get('offsetY'),
      set: (v) => layer.set('offsetY', v),
      format: (v) => Math.round(v) + 'px',
    }), container);

    // Z-Index
    this._register(new BarControl({
      label: 'Z-Index', key: 'zIndex', target: layer, ...r.zIndex,
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

  _buildMaskOptions(layer) {
    const options = ['none'];
    for (const other of this._ascii._layers) {
      if (other === layer) continue;
      options.push(`Layer ${other.id}`);
    }
    return options;
  }

  _updateMaskSelectors() {
    for (const [layer, entry] of this._layerTabs) {
      const sel = entry.content._maskSelector;
      if (!sel) continue;
      const prev = layer.get('maskLayer');
      sel.options = this._buildMaskOptions(layer);
      // If the previously selected mask layer was removed, the get() will return -1
      // which the Selector handles gracefully, and the value is already null from removeLayer
      sel.update();
    }
  }

  _register(ctrl, parent) {
    this._controls.push(ctrl);
    parent.appendChild(ctrl.el);
    return ctrl;
  }

  /** Register a control that only drives implicit (layerless) mode. */
  _registerImplicit(ctrl, parent) {
    this._register(ctrl, parent);
    this._implicitOnlyEls.push(ctrl.el);
    return ctrl;
  }

  /** Register an implicit-only control that only affects edge-detect mode. */
  _registerImplicitEdge(ctrl, parent, target) {
    this._registerImplicit(ctrl, parent);
    this._edgeOnlyEntries.push({ el: ctrl.el, target, implicit: true });
    return ctrl;
  }

  /** Register a control that only affects edge-detect mode. */
  _registerEdge(ctrl, parent, target) {
    this._register(ctrl, parent);
    this._edgeOnlyEntries.push({ el: ctrl.el, target, implicit: false });
    return ctrl;
  }

  /** Register a control that only affects 3D render mode. */
  _register3D(ctrl, parent) {
    this._register(ctrl, parent);
    this._threeDOnlyEls.push(ctrl.el);
    return ctrl;
  }

  /**
   * Hide the global image controls once explicit layers exist — in that mode
   * the per-layer tabs own them and the globals are inert (see _renderLayers).
   */
  _updateImageControlsVisibility() {
    const explicit = this._ascii._layers.length > 0;
    for (const el of this._implicitOnlyEls) {
      el.style.display = explicit ? 'none' : '';
    }
  }

  _update3DControlsVisibility() {
    const show = this._ascii.get('renderMode') === '3d';
    for (const el of this._threeDOnlyEls) {
      el.style.display = show ? '' : 'none';
    }
  }

  _updateEdgeControlsVisibility() {
    const explicit = this._ascii._layers.length > 0;
    for (const { el, target, implicit } of this._edgeOnlyEntries) {
      const show = target.get('edgeDetect') && (!implicit || !explicit);
      el.style.display = show ? '' : 'none';
    }
  }

  // ─── Resize ───────────────────────────────────────

  _initResize() {
    const handle = this._resizeHandle;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('dragging');
      const doc = this._host.ownerDocument;
      const hostRect = this._host.getBoundingClientRect();

      const onMove = (ev) => {
        const newW = Math.max(200, Math.min(600, hostRect.right - ev.clientX));
        this._host.style.setProperty('--drawer-w', newW + 'px');
      };

      const onUp = () => {
        handle.classList.remove('dragging');
        doc.removeEventListener('mousemove', onMove);
        doc.removeEventListener('mouseup', onUp);
      };

      doc.addEventListener('mousemove', onMove);
      doc.addEventListener('mouseup', onUp);
    });
  }

  // ─── Pop Out ─────────────────────────────────────

  _togglePopOut() {
    if (this._popupWindow && !this._popupWindow.closed) {
      const popup = this._popupWindow;
      this._popIn();
      popup.close();
    } else {
      this._popOut();
    }
  }

  _popOut() {
    const cs = getComputedStyle(this._host);
    const currentW = parseInt(cs.getPropertyValue('--drawer-w')) || 260;
    const popup = window.open(
      '', 'ascii-panel',
      `width=${Math.max(currentW + 40, 300)},height=${window.innerHeight},resizable=yes`
    );
    if (!popup) return; // blocked by browser

    popup.document.write(
      '<!DOCTYPE html><html><head><title>ascii\u2011ify controls</title>' +
      '<style>html,body{margin:0;padding:0;height:100%;background:#08080f;overflow:hidden;}</style>' +
      '</head><body></body></html>'
    );
    popup.document.close();

    // Create a new shadow host inside the popup
    const popupHost = popup.document.createElement('div');
    popupHost.className = 'popped-out';
    popupHost.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;';
    const popupShadow = popupHost.attachShadow({ mode: 'closed' });

    // Inject styles into the popup shadow
    const style = popup.document.createElement('style');
    style.textContent = PANEL_CSS;
    popupShadow.appendChild(style);

    // Move the surface into the popup shadow
    this._surface.remove();
    this._surface.classList.remove('hidden');
    popupShadow.appendChild(this._surface);

    popup.document.body.appendChild(popupHost);

    this._popupWindow = popup;
    this._popupHost = popupHost;
    this._popupShadow = popupShadow;

    // Update button
    this._popoutBtn.textContent = '\u2199';
    this._popoutBtn.title = 'Pop back into main window';

    this._visible = true;
    this._startSync();

    // Return panel when popup closes
    popup.addEventListener('beforeunload', () => this._popIn());
  }

  _popIn() {
    if (!this._popupWindow) return;

    // Move surface back to the original shadow
    this._surface.remove();
    this._shadow.appendChild(this._surface);

    // Update button
    this._popoutBtn.textContent = '\u2197';
    this._popoutBtn.title = 'Pop out to separate window';

    this._popupHost = null;
    this._popupShadow = null;
    this._popupWindow = null;
  }

  // ─── Randomize ────────────────────────────────────

  _randomize() {
    const ascii = this._ascii;
    const r = PARAM_RANGES;
    let changed = 0;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const should = (chance) => Math.random() < chance;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const pickOther = (arr, current) => {
      const choices = arr.filter(value => value !== current);
      return choices.length > 0 ? pick(choices) : current;
    };

    const quantize = (value, range) => {
      const steps = Math.round((value - range.min) / range.step);
      return clamp(range.min + steps * range.step, range.min, range.max);
    };

    const drift = (target, key, amount = 0.1, chance = 0.45, fallbackTarget = ascii) => {
      if (!should(chance)) return;
      const range = r[key];
      const current = target.get(key);
      const fallback = fallbackTarget.get?.(key);
      const base = typeof current === 'number' && Number.isFinite(current)
        ? current
        : typeof fallback === 'number' && Number.isFinite(fallback)
          ? fallback
          : (range.min + range.max) / 2;
      const span = range.max - range.min;
      const scale = 0.35 + Math.random() * 0.65;
      target.set(key, quantize(base + (Math.random() * 2 - 1) * span * amount * scale, range));
      changed++;
    };

    const maybeSet = (target, key, value, chance) => {
      if (!should(chance)) return;
      target.set(key, value);
      changed++;
    };

    const maybePickOther = (target, key, values, chance) => {
      if (!should(chance)) return;
      target.set(key, pickOther(values, target.get(key)));
      changed++;
    };

    const maybePattern = (target, chance) => {
      if (!should(chance)) return;
      const current = target.get('pattern') ?? 'none';
      const next = pickOther(PATTERN_NAMES, current);
      target.set('pattern', next === 'none' ? null : next);
      changed++;
    };

    // Core controls get small numeric nudges more often than identity changes.
    drift(ascii, 'fontSize', 0.08, 0.5);
    drift(ascii, 'density', 0.12, 0.5);
    drift(ascii, 'patternMix', 0.14, 0.4);
    drift(ascii, 'fade', 0.12, 0.35);
    drift(ascii, 'speed', 0.1, 0.35);
    drift(ascii, 'sourceOpacity', 0.12, 0.3);
    drift(ascii, 'colorCycleRate', 0.1, ascii.get('colorCycle') ? 0.35 : 0.08);

    maybePickOther(ascii, 'charset', CHARSET_NAMES, 0.12);
    maybePickOther(ascii, 'colorScheme', COLOR_OPTIONS, 0.12);
    maybePattern(ascii, 0.14);
    maybeSet(ascii, 'colorCycle', !ascii.get('colorCycle'), 0.08);

    // Keep the selected render mode stable; randomize should only nudge mode-specific settings.
    const threeDChance = ascii.get('renderMode') === '3d' ? 0.35 : 0.08;
    drift(ascii, 'depthScale', 0.12, threeDChance);
    drift(ascii, 'perspective', 0.08, threeDChance);
    drift(ascii, 'rotationX', 0.08, threeDChance);
    drift(ascii, 'rotationY', 0.08, threeDChance);
    drift(ascii, 'rotationZ', 0.08, threeDChance);
    drift(ascii, 'cameraZ', 0.08, threeDChance);
    drift(ascii, 'depthOpacity', 0.12, threeDChance);
    drift(ascii, 'depthSmoothing', 0.12, threeDChance * 0.25);

    maybeSet(ascii, 'edgeDetect', !ascii.get('edgeDetect'), 0.06);
    drift(ascii, 'edgeThreshold', 0.12, ascii.get('edgeDetect') ? 0.35 : 0.08);
    maybePickOther(ascii, 'edgeCharset', EDGE_CHARSET_NAMES, ascii.get('edgeDetect') ? 0.1 : 0.03);

    maybeSet(ascii, 'crtEnabled', !ascii.get('crtEnabled'), 0.04);
    const crtChance = ascii.get('crtEnabled') ? 0.35 : 0.06;
    drift(ascii, 'crtScanlines', 0.12, crtChance);
    drift(ascii, 'crtGlow', 0.12, crtChance);
    drift(ascii, 'crtDistortion', 0.1, crtChance);
    drift(ascii, 'crtFlicker', 0.1, crtChance);

    // Explicit layers can drift too, but preserve masks and inherited values most of the time.
    if (!ascii._implicitMode) {
      for (const layer of ascii._layers) {
        if (!should(0.55)) continue;
        drift(layer, 'fontSize', 0.08, 0.35);
        drift(layer, 'density', 0.12, 0.35);
        drift(layer, 'patternMix', 0.14, 0.3);
        drift(layer, 'fade', 0.12, layer.get('fade') == null ? 0.08 : 0.28);
        drift(layer, 'opacity', 0.12, 0.35);
        drift(layer, 'offsetX', 0.04, 0.2);
        drift(layer, 'offsetY', 0.04, 0.2);
        drift(layer, 'zIndex', 0.04, 0.12);
        maybePickOther(layer, 'charset', [null, ...CHARSET_NAMES], layer.get('charset') == null ? 0.04 : 0.1);
        maybePickOther(layer, 'colorScheme', [null, ...COLOR_OPTIONS], layer.get('colorScheme') == null ? 0.04 : 0.1);
        maybePattern(layer, 0.1);
        maybePickOther(layer, 'blendMode', BLEND_MODES, 0.08);
        maybeSet(layer, 'edgeDetect', !layer.get('edgeDetect'), 0.06);
        drift(layer, 'edgeThreshold', 0.12, layer.get('edgeDetect') ? 0.3 : 0.06);
        maybePickOther(layer, 'edgeCharset', EDGE_CHARSET_NAMES, layer.get('edgeDetect') ? 0.08 : 0.02);
      }
    }

    if (changed === 0) {
      drift(ascii, pick(['fontSize', 'density', 'patternMix', 'fade', 'speed']), 0.1, 1);
    }
  }

  // ─── Snapshot ──────────────────────────────────────

  _copySnapshot() {
    const ascii = this._ascii;
    const snapshot = {};
    for (const k of GLOBAL_KEYS) {
      snapshot[k] = ascii.get(k);
    }
    const automations = ascii.getAutomations?.();
    if (automations && Object.keys(automations).length > 0) {
      snapshot.automations = automations;
    }

    if (ascii._layers.length > 0 && !ascii._implicitMode) {
      snapshot.layers = ascii._layers.map(layer => {
        const obj = {};
        for (const k of LAYER_KEYS) {
          obj[k] = layer.get(k);
        }
        const layerAutomations = layer.getAutomations?.();
        if (layerAutomations && Object.keys(layerAutomations).length > 0) {
          obj.automations = layerAutomations;
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

  _pasteSnapshot() {
    navigator.clipboard.readText().then((text) => {
      let snapshot;
      try {
        snapshot = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON');
      }

      const error = this._validateSnapshot(snapshot);
      if (error) throw new Error(error);

      this._applySnapshot(snapshot);
      this._flashPasteBtn('Pasted!');
    }, () => {
      throw new Error('Clipboard');
    }).catch((err) => {
      this._flashPasteBtn(err.message || 'Invalid', true);
    });
  }

  _validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return 'Invalid';
    }

    const allowed = new Set([...GLOBAL_KEYS, 'automations', 'layers']);
    for (const key of Object.keys(snapshot)) {
      if (!allowed.has(key)) return `Bad key: ${key}`;
    }

    if (!GLOBAL_KEYS.some(key => key in snapshot) && !('layers' in snapshot)) {
      return 'Empty';
    }

    for (const key of GLOBAL_KEYS) {
      if (key in snapshot && !this._isValidValue(key, snapshot[key], false)) {
        return `Bad ${key}`;
      }
    }

    if ('automations' in snapshot) {
      const error = this._validateAutomations(snapshot.automations, GLOBAL_KEYS);
      if (error) return error;
    }

    if ('layers' in snapshot) {
      if (!Array.isArray(snapshot.layers)) return 'Bad layers';
      for (let i = 0; i < snapshot.layers.length; i++) {
        const layer = snapshot.layers[i];
        if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
          return `Bad layer ${i + 1}`;
        }
        const layerAllowed = new Set([...LAYER_KEYS, 'automations']);
        for (const key of Object.keys(layer)) {
          if (!layerAllowed.has(key)) return `Bad layer key: ${key}`;
        }
        for (const key of LAYER_KEYS) {
          if (key in layer && !this._isValidValue(key, layer[key], true)) {
            return `Bad layer ${key}`;
          }
        }
        if ('automations' in layer) {
          const error = this._validateAutomations(layer.automations, LAYER_KEYS);
          if (error) return `Layer ${i + 1}: ${error}`;
        }
      }
    }

    return null;
  }

  _isValidValue(key, value, layerValue) {
    if (BOOLEAN_KEYS.has(key)) return typeof value === 'boolean';
    if (STRING_KEYS.has(key)) return typeof value === 'string';
    if (key === 'charset') return layerValue ? value == null || CHARSET_NAMES.includes(value) : CHARSET_NAMES.includes(value);
    if (key === 'colorScheme') return layerValue ? value == null || COLOR_OPTIONS.includes(value) : COLOR_OPTIONS.includes(value);
    if (key === 'edgeCharset') return EDGE_CHARSET_NAMES.includes(value);
    if (key === 'pattern') return value == null || PATTERN_NAMES.slice(1).includes(value);
    if (key === 'blendMode') return BLEND_MODES.includes(value);
    if (key === 'renderMode') return RENDER_MODES.includes(value);
    if (key === 'maskLayer') return value == null || (Number.isInteger(value) && value > 0);
    if (key === 'fade' && layerValue && value == null) return true;
    if (PARAM_RANGES[key]) {
      const range = PARAM_RANGES[key];
      return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
    }
    return typeof value === 'number' && Number.isFinite(value);
  }

  _validateAutomations(automations, allowedKeys) {
    if (!automations || typeof automations !== 'object' || Array.isArray(automations)) {
      return 'Bad automation';
    }
    const allowed = new Set(allowedKeys.filter(key => PARAM_RANGES[key]));
    for (const [key, automation] of Object.entries(automations)) {
      if (!allowed.has(key)) return `Bad automation: ${key}`;
      if (!automation || typeof automation !== 'object' || Array.isArray(automation)) {
        return `Bad automation: ${key}`;
      }
      if (automation.type != null && !AUTOMATION_TYPES.includes(automation.type)) {
        return `Bad automation: ${key}`;
      }
      for (const numericKey of ['base', 'min', 'max', 'amount', 'rate', 'phase', 'seed']) {
        if (numericKey in automation && (typeof automation[numericKey] !== 'number' || !Number.isFinite(automation[numericKey]))) {
          return `Bad automation: ${key}`;
        }
      }
      if ('relative' in automation && typeof automation.relative !== 'boolean') {
        return `Bad automation: ${key}`;
      }
    }
    return null;
  }

  _applySnapshot(snapshot) {
    const ascii = this._ascii;
    const isFullSnapshot = GLOBAL_KEYS.every(key => key in snapshot);

    if (isFullSnapshot || 'automations' in snapshot) {
      ascii.clearAutomations?.(false);
    }
    for (const key of GLOBAL_KEYS) {
      if (key in snapshot) ascii.set(key, snapshot[key]);
    }
    if (snapshot.automations) {
      for (const [key, automation] of Object.entries(snapshot.automations)) {
        ascii.automate(key, automation);
      }
    }

    if ('layers' in snapshot) {
      this._applySnapshotLayers(snapshot.layers);
    } else if (isFullSnapshot) {
      this._applySnapshotLayers([]);
    }

    for (const c of this._controls) c.sync();
    this._updateMaskSelectors();
    this._syncEyeIcons();
    this._updateSoloBtns();
    this._update3DControlsVisibility();
    this._updateEdgeControlsVisibility();
  }

  _applySnapshotLayers(layerConfigs) {
    const ascii = this._ascii;
    while (ascii._layers.length > layerConfigs.length) {
      ascii.removeLayer(ascii._layers[ascii._layers.length - 1]);
    }
    while (ascii._layers.length < layerConfigs.length) {
      ascii.addLayer({ source: ascii._source, blendMode: 'add', opacity: 0.5 });
    }
    while (ascii._layers.length > layerConfigs.length) {
      ascii.removeLayer(ascii._layers[ascii._layers.length - 1]);
    }
    if (layerConfigs.length === 0) {
      ascii._implicitMode = true;
      ascii._soloLayer = null;
      return;
    }

    ascii._implicitMode = false;
    const validLayerIds = new Set(ascii._layers.map(layer => layer.id));
    for (let i = 0; i < layerConfigs.length; i++) {
      const layer = ascii._layers[i];
      const config = layerConfigs[i];
      const isFullLayer = LAYER_KEYS.every(key => key in config);
      if (isFullLayer || 'automations' in config) {
        layer.clearAutomations?.(false);
      }
      for (const key of LAYER_KEYS) {
        if (!(key in config)) continue;
        if (key === 'maskLayer' && config[key] != null && !validLayerIds.has(config[key])) {
          layer.set(key, null);
        } else {
          layer.set(key, config[key]);
        }
      }
      if (config.automations) {
        for (const [key, automation] of Object.entries(config.automations)) {
          layer.automate(key, automation);
        }
      }
    }
  }

  _flashCopyBtn(text) {
    const btn = this._surface.querySelector('.copy-btn');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    btn.classList.add('flash');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('flash');
    }, 1200);
  }

  _flashPasteBtn(text, error = false) {
    const btn = this._surface.querySelector('.paste-btn');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    btn.classList.toggle('error', error);
    btn.classList.add('flash');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('flash', 'error');
    }, 1200);
  }

  // ─── Sync Loop ───────────────────────────────────────

  _startSync() {
    if (this._rafId) return;
    const sync = () => {
      for (const c of this._controls) c.sync();
      this._update3DControlsVisibility();
      this._updateEdgeControlsVisibility();
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
