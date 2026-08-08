import { EventEmitter } from './events.js';
import { DEFAULTS, PARAM_RANGES } from './data/defaults.js';
import { CHARSETS } from './data/charsets.js';
import { EDGE_CHARSETS } from './data/edge-charsets.js';
import { COLOR_SCHEMES } from './color/schemes.js';
import { PATTERNS } from './patterns.js';
import { calculateGrid } from './grid.js';
import { sampleCanvas, downsampleBrightness, downsampleColors } from './sampler.js';
import { detectEdges, sobelFromGray } from './edge-detect.js';
import { buildColorLUT } from './color/engine.js';
import { renderLayer, renderLayer3D } from './renderer.js';
import { renderEdgeLayer, renderEdgeLayer3D } from './edge-renderer.js';
import { CRTEffect } from './crt.js';
import { clamp, lerp } from './utils.js';
import { AutomationSet } from './automation.js';

export class AsciiIfy extends EventEmitter {
  /**
   * @param {HTMLCanvasElement} sourceCanvas - the canvas to ASCII-ify
   * @param {object} [options] - configuration options
   */
  constructor(sourceCanvas, options = {}) {
    super();
    this._source = sourceCanvas;
    this._running = false;
    this._rafId = null;
    this._prevTime = 0;
    this._time = 0;
    this._automationTime = 0;
    this._colorPhase = 0;
    this._dt = 0;
    this._panel = null;
    this._transitioning = false;
    this._enableTimer = null;

    const { automations = null, ...params } = options;

    // Merge options with defaults
    this._params = { ...DEFAULTS, ...params };
    this._automations = new AutomationSet((key, value, automated) => this._setOne(key, value, automated));
    if (automations) {
      for (const [key, automation] of Object.entries(automations)) {
        this._automations.set(key, this.get(key), automation);
      }
    }

    // Layers (empty = implicit single-layer mode)
    this._layers = [];
    this._implicitMode = true;
    this._soloLayer = null;
    this._layerOrderCache = { key: null, sorted: [] };

    // Offscreen sampling context + brightness buffer (reused)
    this._sampleCtx = null;
    this._sampleBuf = null;
    this._sampleColorBuf = null;
    this._edgeBuffers = null;
    this._depthBuf = null;
    this._masters = null;

    // CRT post-processing (lazy-initialized)
    this._crt = null;

    // Create overlay canvas
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    this._ctx = this._canvas.getContext('2d');

    // Ensure parent is positioned
    const parent = sourceCanvas.parentElement;
    if (parent) {
      const style = getComputedStyle(parent);
      if (style.position === 'static') {
        parent.style.position = 'relative';
      }
      parent.insertBefore(this._canvas, sourceCanvas.nextSibling);
    }

    // Set source opacity
    this._updateSourceOpacity();

    // Observe source canvas for resize
    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(sourceCanvas);

    // Initial grid calculation
    this._grid = null;
    this._handleResize();
  }

  /** The overlay canvas element */
  get canvas() { return this._canvas; }

  /** Readonly array of layers (bottom-to-top) */
  get layers() { return [...this._layers]; }

  /**
   * Get a parameter value.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._params[key];
  }

  /**
   * Set parameter(s).
   * @param {string|object} key - parameter name or { key: value } batch
   * @param {*} [value]
   */
  set(key, value) {
    if (typeof key === 'object') {
      for (const [k, v] of Object.entries(key)) this._setOne(k, v, false);
    } else {
      this._setOne(key, value, false);
    }
  }

  _setOne(key, value, automated = false) {
    const range = PARAM_RANGES[key];
    if (range) {
      value = clamp(value, range.min, range.max);
    }

    if (!automated) {
      this._automations.updateBase(key, value);
    }

    const old = this._params[key];
    this._params[key] = value;

    if (key === 'enabled') {
      this._updateEnabled();
    }

    if (key === 'sourceOpacity') {
      this._updateSourceOpacity();
    }

    if (key === 'fontSize' || key === 'density') {
      this._handleResize();
    }

    // Propagate to implicit-mode layers
    if (this._implicitMode && this._layers.length > 0) {
      const layerKeys = ['fontSize', 'fontSizeSmoothing', 'density', 'charset', 'colorScheme', 'pattern', 'patternMix', 'fade', 'opacity', 'blendMode', 'offsetX', 'offsetY', 'zIndex', 'edgeDetect', 'edgeThreshold', 'edgeCharset'];
      if (layerKeys.includes(key)) {
        this._layers[0].set(key, value);
      }
    }

    if (old !== value && !automated) {
      this.emit('paramchange', { key, value });
    }
  }

  /**
   * Animate a numeric parameter over time.
   * @param {string} key
   * @param {object} options - { type, amount, min, max, rate, phase, seed }
   * @returns {object} normalized automation definition
   */
  automate(key, options = {}) {
    const automation = this._automations.set(key, this.get(key), options);
    this.emit('paramchange', { key: 'automation', value: this.getAutomations() });
    return automation;
  }

  /** Stop animating one parameter and restore its base value. */
  stopAutomation(key, restore = true) {
    const changed = this._automations.delete(key, restore);
    if (changed) this.emit('paramchange', { key: 'automation', value: this.getAutomations() });
    return changed;
  }

  /** Stop all parameter automation. */
  clearAutomations(restore = true) {
    if (this._automations.size === 0) return;
    this._automations.clear(restore);
    this.emit('paramchange', { key: 'automation', value: this.getAutomations() });
  }

  getAutomation(key) {
    return this._automations.get(key);
  }

  getAutomations() {
    return this._automations.all();
  }

  /**
   * Add a compositing layer.
   * @param {object} [options]
   * @returns {Layer}
   */
  addLayer(options = {}) {
    const Layer = _getLayerClass();

    if (this._implicitMode && this._layers.length > 0) {
      // Convert implicit layer to explicit
      this._implicitMode = false;
    } else if (this._implicitMode && this._layers.length === 0) {
      // Create the default layer first, then add the new one on top
      const defaultLayer = new Layer(this, {
        source: this._source,
        fontSize: this._params.fontSize,
        density: this._params.density,
        charset: this._params.charset,
        colorScheme: this._params.colorScheme,
        pattern: this._params.pattern,
        patternMix: this._params.patternMix,
        fade: this._params.fade,
        opacity: this._params.opacity,
        blendMode: 'replace',
      });
      this._layers.push(defaultLayer);
      this._implicitMode = false;
    }

    const layer = new Layer(this, {
      source: options.source || this._source,
      ...options,
    });
    this._layers.push(layer);
    this.emit('layeradd', layer);
    return layer;
  }

  /**
   * Remove a compositing layer.
   * @param {Layer} layer
   */
  removeLayer(layer) {
    const idx = this._layers.indexOf(layer);
    if (idx >= 0) {
      if (this._soloLayer === layer) this._soloLayer = null;
      // Clear mask references to this layer
      for (const other of this._layers) {
        if (other.get('maskLayer') === layer.id) other.set('maskLayer', null);
      }
      this._layers.splice(idx, 1);
      layer.destroy();
      this.emit('layerremove', layer);
    }
  }

  /**
   * Solo a layer — only this layer will render.
   * Call again with the same layer (or null) to unsolo.
   * @param {Layer|null} layer
   */
  soloLayer(layer) {
    this._soloLayer = (this._soloLayer === layer) ? null : layer;
    this.emit('paramchange', { key: 'soloLayer', value: this._soloLayer });
  }

  /** Render a single frame */
  render() {
    const now = performance.now();
    const dt = this._prevTime ? Math.min((now - this._prevTime) / 1000, 0.05) : 0;
    this._prevTime = now;
    this._dt = dt;
    this._automationTime += dt;
    this._applyAutomations();
    this._time += dt * this._params.speed;

    // Update color cycling
    if (this._params.colorCycle) {
      this._colorPhase += dt * this._params.colorCycleRate;
    }

    this._renderFrame();
    this.emit('render', { time: this._time, dt });
  }

  /** Start the rAF loop */
  start() {
    if (this._running) return;
    this._running = true;
    this._prevTime = performance.now();
    const loop = () => {
      if (!this._running) return;
      this.render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /** Stop the rAF loop */
  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Show the built-in control panel */
  showPanel(options = {}) {
    if (this._panel) {
      this._panel.show();
      return;
    }
    import('./panel/panel.js').then(({ ControlPanel }) => {
      this._panel = new ControlPanel(this, options);
      this._panel.show();
    });
  }

  /** Hide the control panel */
  hidePanel() {
    if (this._panel) this._panel.hide();
  }

  /** Toggle the control panel visibility */
  togglePanel() {
    if (this._panel) {
      this._panel.toggle();
    } else {
      this.showPanel();
    }
  }

  /** Destroy the instance — remove overlay, detach observers, stop loop */
  destroy() {
    this.stop();
    clearTimeout(this._enableTimer);
    if (this._crt) {
      this._crt.destroy();
      this._crt = null;
    }
    if (this._panel) {
      this._panel.destroy();
      this._panel = null;
    }
    this._resizeObserver.disconnect();
    if (this._canvas.parentElement) {
      this._canvas.parentElement.removeChild(this._canvas);
    }
    this._source.style.opacity = '';
    for (const layer of this._layers) layer.destroy();
    this._layers = [];
    if (this._masters) this._masters.clear();
  }

  // ─── Internal ──────────────────────────────────────────

  _updateEnabled() {
    clearTimeout(this._enableTimer);
    const ms = 700;

    if (this._params.enabled) {
      // Fade in: un-hide at opacity 0, then transition to 1
      this._canvas.style.display = '';
      this._canvas.style.opacity = '0';
      this._canvas.offsetHeight; // force reflow before adding transition
      this._canvas.style.transition = `opacity ${ms}ms ease`;
      this._canvas.style.opacity = '1';
      this._source.style.transition = `opacity ${ms}ms ease`;
      this._source.style.opacity = String(this._params.sourceOpacity);
      this._transitioning = true;
      this._enableTimer = setTimeout(() => {
        this._canvas.style.transition = '';
        this._source.style.transition = '';
        this._transitioning = false;
      }, ms);
    } else {
      // Fade out: transition to 0, then hide
      this._canvas.style.transition = `opacity ${ms}ms ease`;
      this._canvas.style.opacity = '0';
      this._source.style.transition = `opacity ${ms}ms ease`;
      this._source.style.opacity = '1';
      this._transitioning = true;
      this._enableTimer = setTimeout(() => {
        this._canvas.style.display = 'none';
        this._canvas.style.transition = '';
        this._source.style.transition = '';
        this._transitioning = false;
      }, ms);
    }
  }

  _updateSourceOpacity() {
    if (!this._params.enabled) return;
    this._source.style.opacity = String(this._params.sourceOpacity);
  }

  _handleResize() {
    const w = this._source.offsetWidth || this._source.width;
    const h = this._source.offsetHeight || this._source.height;

    // Update overlay canvas size
    const dpr = devicePixelRatio || 1;
    this._canvas.width = w * dpr;
    this._canvas.height = h * dpr;
    this._canvas.style.width = w + 'px';
    this._canvas.style.height = h + 'px';
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calculate grid for implicit mode
    this._grid = calculateGrid(w, h, this._params.fontSize, this._params.density);
    this._width = w;
    this._height = h;

    this.emit('resize', { cols: this._grid.cols, rows: this._grid.rows });
  }

  _renderFrame() {
    if (!this._params.enabled && !this._transitioning) return;

    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;
    const t = this._time;

    // Clear with background
    ctx.fillStyle = this._params.background;
    ctx.fillRect(0, 0, w, h);

    if (this._layers.length === 0) {
      // Implicit single-layer mode — render directly
      this._renderImplicit(ctx, w, h, t);
    } else {
      // Explicit layer compositing
      this._renderLayers(ctx, w, h, t);
    }

    // CRT post-processing (screen-space, after all layers)
    if (this._params.crtEnabled) {
      if (!this._crt) this._crt = new CRTEffect();
      this._crt.apply(ctx, this._canvas, t, {
        scanlines: this._params.crtScanlines,
        glow: this._params.crtGlow,
        distortion: this._params.crtDistortion,
        flicker: this._params.crtFlicker,
      });
    }
  }

  _applyAutomations() {
    this._automations.apply(this._automationTime);
    for (const layer of this._layers) {
      layer._applyAutomations(this._automationTime);
    }
  }

  _renderImplicit(ctx, w, h, t) {
    const grid = this._grid;
    if (grid.cols <= 0 || grid.rows <= 0) return;

    const smoothing = this._params.fontSizeSmoothing || 0;
    if (smoothing > 0) {
      const smoothCtx = this._beginFontSizeSmoothing(this, w, h, smoothing, this._gridKey(grid));
      smoothCtx.clearRect(0, 0, w, h);
      this._drawImplicit(smoothCtx, w, h, t, grid);
      this._finishFontSizeSmoothing(this, ctx, w, h, smoothing);
      return;
    }

    this._fontSmooth = null;
    this._drawImplicit(ctx, w, h, t, grid);
  }

  _drawImplicit(ctx, w, h, t, grid) {
    const useSourceColors = this._params.colorScheme === 'source';
    const schemeIndex = useSourceColors ? 0 : this._resolveSchemeIndex(this._params.colorScheme);
    ctx.font = `${this._params.fontSize}px monospace`;

    // Edge detection path
    if (this._params.edgeDetect) {
      const { magnitude, direction, colors, ctx: sCtx } = detectEdges(
        this._source, grid.cols, grid.rows, this._sampleCtx, this._params.edgeThreshold,
        useSourceColors ? this._sampleColorBuf : undefined,
        this._edgeBufferState(this)
      );
      this._sampleCtx = sCtx;
      if (colors) this._sampleColorBuf = colors;

      const edgeChars = this._resolveEdgeCharset(this._params.edgeCharset);
      const colorLUT = useSourceColors ? null : buildColorLUT(schemeIndex, 256, t, {
        cycling: this._params.colorCycle,
        phase: this._colorPhase,
      });

      if (this._params.renderMode === '3d') {
        const opts = this._projectionOptions(w, h, this._params.fontSize);
        opts.depthValues = this._depthValues(magnitude, this);
        renderEdgeLayer3D(ctx, magnitude, direction, grid, colorLUT, edgeChars, this._params.fade, t, opts, colors);
      } else {
        renderEdgeLayer(ctx, magnitude, direction, grid, colorLUT, edgeChars, this._params.fade, t, colors);
      }
      return;
    }

    // Standard brightness path
    const chars = this._resolveChars(this._params.charset);

    // Sample source
    const { brightness, colors, ctx: sCtx } = sampleCanvas(
      this._source, grid.cols, grid.rows, this._sampleCtx, this._sampleBuf,
      useSourceColors ? this._sampleColorBuf : undefined
    );
    this._sampleCtx = sCtx;
    this._sampleBuf = brightness;
    if (colors) this._sampleColorBuf = colors;

    // Blend with pattern if set
    const patternName = this._params.pattern;
    if (patternName) {
      const patternFn = this._resolvePattern(patternName);
      if (patternFn) {
        const mix = this._params.patternMix;
        for (let r = 0; r < grid.rows; r++) {
          for (let c = 0; c < grid.cols; c++) {
            const i = r * grid.cols + c;
            const pv = patternFn(c, r, t, grid.cols, grid.rows, grid.ar);
            brightness[i] = lerp(brightness[i], pv, mix);
          }
        }
      }
    }

    // Build color LUT
    const colorLUT = useSourceColors ? null : buildColorLUT(schemeIndex, chars.length, t, {
      cycling: this._params.colorCycle,
      phase: this._colorPhase,
    });

    // Render
    if (this._params.renderMode === '3d') {
      const opts = this._projectionOptions(w, h, this._params.fontSize);
      opts.depthValues = this._depthValues(brightness, this);
      renderLayer3D(ctx, brightness, grid, colorLUT, chars, this._params.fade, t, opts, colors);
    } else {
      renderLayer(ctx, brightness, grid, colorLUT, chars, this._params.fade, t, colors);
    }
  }

  _renderLayers(ctx, w, h, t) {
    const sorted = this._sortedLayers();

    // Collect visible layers and their grids
    const active = [];
    for (const layer of sorted) {
      if (this._soloLayer ? layer !== this._soloLayer : !layer.visible) continue;
      const grid = calculateGrid(w, h, layer.get('fontSize'), layer.get('density'));
      if (grid.cols <= 0 || grid.rows <= 0) continue;
      active.push({ layer, grid });
    }

    // Pass 0: one readback per distinct source, at the finest active grid.
    // Coarser layers derive their buffers by box-downsampling in JS.
    const masters = this._sampleMasters(active);

    // Pass 1: Render all visible layers to their offscreen canvases
    for (const { layer, grid } of active) {
      const source = layer.source || this._source;
      const schemeVal = layer.get('colorScheme') || this._params.colorScheme;
      const useSourceColors = schemeVal === 'source';
      const schemeIndex = useSourceColors ? 0 : this._resolveSchemeIndex(schemeVal);
      const fade = layer.get('fade') ?? this._params.fade;
      const master = masters.get(source);

      // Render layer to its offscreen canvas
      const offCanvas = layer._ensureOffscreen(w, h);
      const offCtx = layer._offCtx;
      const smoothing = layer.get('fontSizeSmoothing') || 0;
      const smoothCtx = smoothing > 0
        ? this._beginFontSizeSmoothing(layer, w, h, smoothing, this._gridKey(grid))
        : null;
      const renderCtx = smoothCtx || offCtx;
      renderCtx.clearRect(0, 0, w, h);
      renderCtx.font = `${layer.get('fontSize')}px monospace`;

      if (layer.get('edgeDetect')) {
        // Edge detection path — Sobel over the shared (downsampled) sample
        const { brightness, colors } = this._layerSample(master, grid, layer, useSourceColors, true);
        const { magnitude, direction } = sobelFromGray(
          brightness, grid.cols, grid.rows, layer.get('edgeThreshold'),
          this._edgeBufferState(layer), 'bins'
        );

        const edgeChars = this._resolveEdgeCharset(layer.get('edgeCharset') || this._params.edgeCharset);
        const colorLUT = useSourceColors ? null : buildColorLUT(schemeIndex, 256, t, {
          cycling: this._params.colorCycle,
          phase: this._colorPhase,
        });

        if (this._params.renderMode === '3d') {
          const opts = this._projectionOptions(w, h, layer.get('fontSize'));
          opts.depthValues = this._depthValues(magnitude, layer);
          renderEdgeLayer3D(renderCtx, magnitude, direction, grid, colorLUT, edgeChars, fade, t, opts, colors);
        } else {
          renderEdgeLayer(renderCtx, magnitude, direction, grid, colorLUT, edgeChars, fade, t, colors);
        }
      } else {
        // Standard brightness path — shared sample, resampled to this grid
        const patternName = layer.get('pattern');
        const mutatesBrightness = !!patternName;
        const { brightness, colors } = this._layerSample(master, grid, layer, useSourceColors, mutatesBrightness);

        // Blend with pattern
        if (patternName) {
          const patternFn = this._resolvePattern(patternName);
          if (patternFn) {
            const mix = layer.get('patternMix');
            for (let r = 0; r < grid.rows; r++) {
              for (let c = 0; c < grid.cols; c++) {
                const i = r * grid.cols + c;
                const pv = patternFn(c, r, t, grid.cols, grid.rows, grid.ar);
                brightness[i] = lerp(brightness[i], pv, mix);
              }
            }
          }
        }

        const charsetVal = layer.get('charset') || this._params.charset;
        const chars = this._resolveChars(charsetVal);
        const colorLUT = useSourceColors ? null : buildColorLUT(schemeIndex, chars.length, t, {
          cycling: this._params.colorCycle,
          phase: this._colorPhase,
        });

        if (this._params.renderMode === '3d') {
          const opts = this._projectionOptions(w, h, layer.get('fontSize'));
          opts.depthValues = this._depthValues(brightness, layer);
          renderLayer3D(renderCtx, brightness, grid, colorLUT, chars, fade, t, opts, colors);
        } else {
          renderLayer(renderCtx, brightness, grid, colorLUT, chars, fade, t, colors);
        }
      }

      if (smoothCtx) {
        offCtx.clearRect(0, 0, w, h);
        this._finishFontSizeSmoothing(layer, offCtx, w, h, smoothing);
      } else {
        layer._fontSmooth = null;
      }
    }

    // Pass 2: Apply masks and composite onto output
    for (const layer of sorted) {
      if (this._soloLayer ? layer !== this._soloLayer : !layer.visible) continue;
      if (!layer._offscreen) continue;

      const offCanvas = layer._offscreen;
      const offCtx = layer._offCtx;

      // Apply mask if set
      const maskId = layer.get('maskLayer');
      if (maskId != null) {
        const maskLayer = this._layers.find(l => l.id === maskId);
        if (maskLayer && maskLayer._offscreen) {
          // Reset to pixel space so the DPR-scaled canvases align 1:1
          offCtx.save();
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          offCtx.globalCompositeOperation = layer.get('invertMask') ? 'destination-out' : 'destination-in';
          offCtx.drawImage(maskLayer._offscreen, 0, 0);
          offCtx.restore();
        }
      }

      // Composite onto output (draw DPR-scaled canvas at logical size)
      const blendMode = layer.get('blendMode') || 'replace';
      ctx.globalAlpha = layer.get('opacity') ?? 1;
      ctx.globalCompositeOperation = blendMode === 'add' ? 'lighter' : 'source-over';
      const ox = layer.get('offsetX') || 0;
      const oy = layer.get('offsetY') || 0;
      ctx.drawImage(offCanvas, ox, oy, w, h);
    }

    // Reset composite state
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _sortedLayers() {
    let key = '';
    for (const layer of this._layers) {
      key += `${layer.id}:${layer.get('zIndex') || 0}:${layer.visible ? 1 : 0}|`;
    }
    const cache = this._layerOrderCache;
    if (cache.key === key) return cache.sorted;

    cache.key = key;
    cache.sorted = [...this._layers].sort((a, b) => (a.get('zIndex') || 0) - (b.get('zIndex') || 0));
    return cache.sorted;
  }

  /**
   * Sample each distinct source canvas once, at the finest grid any of its
   * layers needs. Returns Map<source, { cols, rows, brightness, colors }>.
   */
  _sampleMasters(active) {
    const wanted = new Map();
    for (const { layer, grid } of active) {
      const source = layer.source || this._source;
      const schemeVal = layer.get('colorScheme') || this._params.colorScheme;
      let s = wanted.get(source);
      if (!s) {
        s = { cols: 0, rows: 0, needColors: false };
        wanted.set(source, s);
      }
      if (grid.cols * grid.rows > s.cols * s.rows) {
        s.cols = grid.cols;
        s.rows = grid.rows;
      }
      if (schemeVal === 'source') s.needColors = true;
    }

    if (!this._masters) this._masters = new Map();
    for (const source of [...this._masters.keys()]) {
      if (!wanted.has(source)) this._masters.delete(source);
    }

    const out = new Map();
    for (const [source, s] of wanted) {
      let m = this._masters.get(source);
      if (!m) {
        m = { ctx: null, buf: null, colorBuf: null };
        this._masters.set(source, m);
      }
      const { brightness, colors, ctx: sCtx } = sampleCanvas(
        source, s.cols, s.rows, m.ctx, m.buf,
        s.needColors ? m.colorBuf : undefined
      );
      m.ctx = sCtx;
      m.buf = brightness;
      if (colors) m.colorBuf = colors;
      out.set(source, { cols: s.cols, rows: s.rows, brightness, colors: s.needColors ? colors : null });
    }
    return out;
  }

  /**
   * Copy or box-downsample the master sample into layer-owned buffers.
   * Layers get their own copy because pattern blending mutates in place.
   */
  _layerSample(master, grid, layer, needColors, mutatesBrightness = false) {
    const len = grid.cols * grid.rows;
    const same = grid.cols === master.cols && grid.rows === master.rows;
    let buf = null;
    if (same && !mutatesBrightness) {
      buf = master.brightness;
    } else {
      buf = layer._sampleBuf;
      if (!buf || buf.length !== len) {
        buf = new Float32Array(len);
        layer._sampleBuf = buf;
      }
      if (same) {
        buf.set(master.brightness);
      } else {
        downsampleBrightness(master.brightness, master.cols, master.rows, buf, grid.cols, grid.rows);
      }
    }

    let colors = null;
    if (needColors && master.colors) {
      if (same) {
        colors = master.colors;
      } else {
        let cbuf = layer._sampleColorBuf;
        if (!cbuf || cbuf.length !== len * 4) {
          cbuf = new Uint8ClampedArray(len * 4);
          layer._sampleColorBuf = cbuf;
        }
        downsampleColors(master.colors, master.cols, master.rows, cbuf, grid.cols, grid.rows);
        colors = cbuf;
      }
    }
    return { brightness: buf, colors };
  }

  _edgeBufferState(owner) {
    if (!owner._edgeBuffers) owner._edgeBuffers = {};
    return owner._edgeBuffers;
  }

  _resolveEdgeCharset(name) {
    const preset = EDGE_CHARSETS.find(c => c.name === name);
    return preset ? preset.chars : EDGE_CHARSETS[0].chars;
  }

  _resolveChars(charset) {
    if (typeof charset === 'string') {
      const preset = CHARSETS.find(c => c.name === charset);
      if (preset) return preset.chars;
      // Raw character string
      return charset;
    }
    return CHARSETS[0].chars;
  }

  _resolveSchemeIndex(scheme) {
    if (typeof scheme === 'number') return scheme;
    const idx = COLOR_SCHEMES.findIndex(s => s.name === scheme);
    return idx >= 0 ? idx : 0;
  }

  _resolvePattern(name) {
    const p = PATTERNS.find(p => p.name === name);
    return p ? p.fn : null;
  }

  _projectionOptions(w, h, fontSize) {
    return {
      width: w,
      height: h,
      fontSize,
      depthScale: this._params.depthScale,
      perspective: this._params.perspective,
      rotationX: this._params.rotationX,
      rotationY: this._params.rotationY,
      rotationZ: this._params.rotationZ,
      cameraZ: this._params.cameraZ,
      opacityDepth: this._params.depthOpacity,
    };
  }

  _gridKey(grid) {
    return `${grid.cols}:${grid.rows}`;
  }

  _beginFontSizeSmoothing(owner, w, h, duration, key) {
    const state = this._ensureFontSmoothState(owner, w, h);
    if (state.hasFrame && state.key !== key) {
      state.prevCtx.save();
      state.prevCtx.setTransform(1, 0, 0, 1, 0, 0);
      state.prevCtx.clearRect(0, 0, state.prev.width, state.prev.height);
      state.prevCtx.drawImage(state.current, 0, 0);
      state.prevCtx.restore();
      state.progress = 0;
      state.transitioning = duration > 0;
    } else if (!state.hasFrame) {
      state.progress = 1;
      state.transitioning = false;
    }
    state.key = key;
    return state.currentCtx;
  }

  _finishFontSizeSmoothing(owner, outputCtx, w, h, duration) {
    const state = owner._fontSmooth;
    let mix = 1;
    if (state.transitioning) {
      state.progress = Math.min(1, state.progress + (duration > 0 ? this._dt / duration : 1));
      mix = state.progress * state.progress * (3 - 2 * state.progress);
      if (state.progress >= 1) state.transitioning = false;
    }

    outputCtx.save();
    if (state.transitioning || mix < 1) {
      outputCtx.globalAlpha = 1 - mix;
      outputCtx.drawImage(state.prev, 0, 0, w, h);
      outputCtx.globalAlpha = mix;
      outputCtx.drawImage(state.current, 0, 0, w, h);
    } else {
      outputCtx.drawImage(state.current, 0, 0, w, h);
    }
    outputCtx.restore();
    state.hasFrame = true;
  }

  _ensureFontSmoothState(owner, w, h) {
    if (!owner._fontSmooth) {
      owner._fontSmooth = {
        current: document.createElement('canvas'),
        currentCtx: null,
        prev: document.createElement('canvas'),
        prevCtx: null,
        key: null,
        progress: 1,
        transitioning: false,
        hasFrame: false,
      };
      owner._fontSmooth.currentCtx = owner._fontSmooth.current.getContext('2d');
      owner._fontSmooth.prevCtx = owner._fontSmooth.prev.getContext('2d');
    }

    const state = owner._fontSmooth;
    const dpr = devicePixelRatio || 1;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    const resizedCurrent = this._resizeSmoothCanvas(state.current, state.currentCtx, pw, ph, dpr);
    const resizedPrev = this._resizeSmoothCanvas(state.prev, state.prevCtx, pw, ph, dpr);
    const resized = resizedCurrent || resizedPrev;
    if (resized) {
      state.hasFrame = false;
      state.transitioning = false;
      state.progress = 1;
      state.key = null;
    }
    return state;
  }

  _resizeSmoothCanvas(canvas, ctx, pw, ph, dpr) {
    const resized = canvas.width !== pw || canvas.height !== ph;
    if (resized) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return resized;
  }

  _depthValues(signal, owner) {
    const smoothing = this._params.depthSmoothing ?? 0;
    if (smoothing <= 0) {
      owner._depthBuf = null;
      return signal;
    }

    const len = signal.length;
    let buf = owner._depthBuf;
    if (!buf || buf.length !== len) {
      buf = new Float32Array(signal);
      owner._depthBuf = buf;
      return buf;
    }

    const keep = smoothing < 0 ? 0 : smoothing > 0.95 ? 0.95 : smoothing;
    const take = 1 - keep;
    for (let i = 0; i < len; i++) {
      buf[i] = buf[i] * keep + signal[i] * take;
    }
    return buf;
  }
}

// Layer import — resolved when layer.js exists
let _Layer = null;
function _getLayerClass() {
  if (!_Layer) {
    // Dynamic import is resolved synchronously after first addLayer call
    throw new Error('Layer system not initialized. Import layer.js first.');
  }
  return _Layer;
}
/** @internal Called by layer.js to register itself */
export function _registerLayerClass(cls) { _Layer = cls; }
