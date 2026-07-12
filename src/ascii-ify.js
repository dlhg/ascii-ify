import { EventEmitter } from './events.js';
import { DEFAULTS, PARAM_RANGES } from './data/defaults.js';
import { CHARSETS } from './data/charsets.js';
import { EDGE_CHARSETS } from './data/edge-charsets.js';
import { COLOR_SCHEMES } from './color/schemes.js';
import { PATTERNS } from './patterns.js';
import { calculateGrid } from './grid.js';
import { sampleCanvas } from './sampler.js';
import { detectEdges } from './edge-detect.js';
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

    // Offscreen sampling context + brightness buffer (reused)
    this._sampleCtx = null;
    this._sampleBuf = null;
    this._sampleColorBuf = null;
    this._depthBuf = null;

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
      const layerKeys = ['fontSize', 'density', 'charset', 'colorScheme', 'pattern', 'patternMix', 'fade', 'opacity', 'blendMode', 'offsetX', 'offsetY', 'zIndex', 'edgeDetect', 'edgeThreshold', 'edgeCharset'];
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

    const useSourceColors = this._params.colorScheme === 'source';
    const schemeIndex = useSourceColors ? 0 : this._resolveSchemeIndex(this._params.colorScheme);
    ctx.font = `${this._params.fontSize}px monospace`;

    // Edge detection path
    if (this._params.edgeDetect) {
      const { magnitude, direction, colors, ctx: sCtx } = detectEdges(
        this._source, grid.cols, grid.rows, this._sampleCtx, this._params.edgeThreshold,
        useSourceColors ? this._sampleColorBuf : undefined
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
    const sorted = [...this._layers].sort((a, b) => (a.get('zIndex') || 0) - (b.get('zIndex') || 0));

    // Pass 1: Render all visible layers to their offscreen canvases
    for (const layer of sorted) {
      if (this._soloLayer ? layer !== this._soloLayer : !layer.visible) continue;

      const grid = calculateGrid(w, h, layer.get('fontSize'), layer.get('density'));
      if (grid.cols <= 0 || grid.rows <= 0) continue;

      const source = layer.source || this._source;
      const schemeVal = layer.get('colorScheme') || this._params.colorScheme;
      const useSourceColors = schemeVal === 'source';
      const schemeIndex = useSourceColors ? 0 : this._resolveSchemeIndex(schemeVal);
      const fade = layer.get('fade') ?? this._params.fade;

      // Render layer to its offscreen canvas
      const offCanvas = layer._ensureOffscreen(w, h);
      const offCtx = layer._offCtx;
      offCtx.clearRect(0, 0, w, h);
      offCtx.font = `${layer.get('fontSize')}px monospace`;

      if (layer.get('edgeDetect')) {
        // Edge detection path
        const { magnitude, direction, colors, ctx: sCtx } = detectEdges(
          source, grid.cols, grid.rows, layer._sampleCtx, layer.get('edgeThreshold'),
          useSourceColors ? layer._sampleColorBuf : undefined
        );
        layer._sampleCtx = sCtx;
        if (colors) layer._sampleColorBuf = colors;

        const edgeChars = this._resolveEdgeCharset(layer.get('edgeCharset') || this._params.edgeCharset);
        const colorLUT = useSourceColors ? null : buildColorLUT(schemeIndex, 256, t, {
          cycling: this._params.colorCycle,
          phase: this._colorPhase,
        });

        if (this._params.renderMode === '3d') {
          const opts = this._projectionOptions(w, h, layer.get('fontSize'));
          opts.depthValues = this._depthValues(magnitude, layer);
          renderEdgeLayer3D(offCtx, magnitude, direction, grid, colorLUT, edgeChars, fade, t, opts, colors);
        } else {
          renderEdgeLayer(offCtx, magnitude, direction, grid, colorLUT, edgeChars, fade, t, colors);
        }
      } else {
        // Standard brightness path
        const { brightness, colors, ctx: sCtx } = sampleCanvas(
          source, grid.cols, grid.rows, layer._sampleCtx, layer._sampleBuf,
          useSourceColors ? layer._sampleColorBuf : undefined
        );
        layer._sampleCtx = sCtx;
        layer._sampleBuf = brightness;
        if (colors) layer._sampleColorBuf = colors;

        // Blend with pattern
        const patternName = layer.get('pattern');
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
          renderLayer3D(offCtx, brightness, grid, colorLUT, chars, fade, t, opts, colors);
        } else {
          renderLayer(offCtx, brightness, grid, colorLUT, chars, fade, t, colors);
        }
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
