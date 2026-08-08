import { _registerLayerClass } from './ascii-ify.js';
import { DEFAULTS } from './data/defaults.js';
import { clamp } from './utils.js';
import { PARAM_RANGES } from './data/defaults.js';
import { AutomationSet } from './automation.js';

let _nextId = 1;

export class Layer {
  /**
   * @param {import('./ascii-ify.js').AsciiIfy} parent
   * @param {object} options
   */
  constructor(parent, options = {}) {
    this.id = _nextId++;
    this._parent = parent;
    this.visible = options.visible ?? true;
    this.source = options.source || null;

    this._params = {
      fontSize: options.fontSize ?? DEFAULTS.fontSize,
      fontSizeSmoothing: options.fontSizeSmoothing ?? DEFAULTS.fontSizeSmoothing,
      density: options.density ?? DEFAULTS.density,
      charset: options.charset ?? null,
      colorScheme: options.colorScheme ?? null,
      pattern: options.pattern ?? DEFAULTS.pattern,
      patternMix: options.patternMix ?? DEFAULTS.patternMix,
      fade: options.fade ?? null,
      opacity: options.opacity ?? DEFAULTS.opacity,
      blendMode: options.blendMode ?? DEFAULTS.blendMode,
      offsetX: options.offsetX ?? DEFAULTS.offsetX,
      offsetY: options.offsetY ?? DEFAULTS.offsetY,
      zIndex: options.zIndex ?? DEFAULTS.zIndex,
      edgeDetect: options.edgeDetect ?? DEFAULTS.edgeDetect,
      edgeThreshold: options.edgeThreshold ?? DEFAULTS.edgeThreshold,
      edgeCharset: options.edgeCharset ?? DEFAULTS.edgeCharset,
      maskLayer: options.maskLayer ?? DEFAULTS.maskLayer,
      invertMask: options.invertMask ?? DEFAULTS.invertMask,
    };
    this._automations = new AutomationSet((key, value, automated) => this._setOne(key, value, automated));
    if (options.automations) {
      for (const [key, automation] of Object.entries(options.automations)) {
        this._automations.set(key, this._automationValue(key), automation);
      }
    }

    // Reusable offscreen canvases
    this._sampleCtx = null;
    this._sampleBuf = null;
    this._sampleColorBuf = null;
    this._edgeBuffers = null;
    this._depthBuf = null;
    this._offscreen = null;
    this._offCtx = null;
    this._fontSmooth = null;
  }

  /**
   * Get a parameter value.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    if (key === 'visible') return this.visible;
    if (key === 'source') return this.source;
    return this._params[key];
  }

  /**
   * Set parameter(s).
   * @param {string|object} key
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
    if (key === 'visible') {
      this.visible = !!value;
      return;
    }
    if (key === 'source') {
      this.source = value;
      return;
    }
    const range = PARAM_RANGES[key];
    if (range) {
      value = clamp(value, range.min, range.max);
    }
    if (!automated) {
      this._automations.updateBase(key, value);
    }
    this._params[key] = value;
  }

  /**
   * Animate a numeric layer parameter over time.
   * @param {string} key
   * @param {object} options - { type, amount, min, max, rate, phase, seed }
   * @returns {object} normalized automation definition
   */
  automate(key, options = {}) {
    return this._automations.set(key, this._automationValue(key), options);
  }

  /** Stop animating one parameter and restore its base value. */
  stopAutomation(key, restore = true) {
    return this._automations.delete(key, restore);
  }

  /** Stop all layer automation. */
  clearAutomations(restore = true) {
    this._automations.clear(restore);
  }

  getAutomation(key) {
    return this._automations.get(key);
  }

  getAutomations() {
    return this._automations.all();
  }

  /** @internal Apply active automations for the current render time. */
  _applyAutomations(time) {
    this._automations.apply(time);
  }

  _automationValue(key) {
    const value = this.get(key);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parentValue = this._parent?.get(key);
    return typeof parentValue === 'number' && Number.isFinite(parentValue) ? parentValue : value;
  }

  /** @internal Ensure the offscreen canvas exists at the right size */
  _ensureOffscreen(w, h) {
    if (!this._offscreen) {
      this._offscreen = document.createElement('canvas');
      this._offCtx = this._offscreen.getContext('2d');
    }
    const dpr = devicePixelRatio || 1;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (this._offscreen.width !== pw || this._offscreen.height !== ph) {
      this._offscreen.width = pw;
      this._offscreen.height = ph;
      this._offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return this._offscreen;
  }

  /** @internal Cleanup */
  destroy() {
    this._offscreen = null;
    this._offCtx = null;
    this._fontSmooth = null;
    this._sampleCtx = null;
    this._sampleBuf = null;
    this._sampleColorBuf = null;
    this._edgeBuffers = null;
    this._depthBuf = null;
    this._automations.clear(false);
    this._parent = null;
  }
}

// Register with the main module
_registerLayerClass(Layer);
