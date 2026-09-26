import { registerSignal } from './automation.js';
import { clamp } from './utils.js';

// ─── Audio analysis → automation signals ─────────────────────────────────
// AudioAnalyzer turns sound into named 0..1 signals ('audio:bass',
// 'audio:kick', …) that plug into ascii.automate() like mouseX does:
//
//   const audio = new AudioAnalyzer();
//   await audio.connectMic();                       // or connectElement(el)
//   ascii.automate('crtGlow', { type: 'audio:kick', min: 0, max: 0.8 });
//
// Continuous signals (rms, bands, centroid) are envelope-followed with a
// fast attack and slow release. Onset signals jump to ~1 on a transient and
// decay. Every level is auto-gained against a slowly-decaying peak, so quiet
// and loud material both use the full 0..1 range.
//
// The input is pluggable: anything with { sampleRate, binCount, spectrum,
// waveform, pull() } can be passed to useSource() (a future plugin/network
// feed, for example). Web Audio sources are built in.

const DEFAULT_BANDS = {
  bass: { lo: 20, hi: 150 },
  lowmid: { lo: 150, hi: 500 },
  mid: { lo: 500, hi: 2000 },
  high: { lo: 2000, hi: 12000 },
};

const DEFAULT_ONSETS = {
  kick: { lo: 20, hi: 150 },
  snare: { lo: 500, hi: 3000 },
  hat: { lo: 6000, hi: 16000 },
  onset: { lo: 20, hi: 16000 },
};

const PEAK_DECAY_SECONDS = 8;   // how fast auto-gain forgets loud passages
const MIN_UPDATE_MS = 2;        // several reads in one frame share one analysis

function follow(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export class AudioAnalyzer {
  /**
   * @param {object} [options]
   * @param {number} [options.fftSize=2048]
   * @param {boolean} [options.autoGain=true] normalize levels to a running peak
   * @param {string} [options.prefix='audio'] signal namespace ('audio:bass')
   * @param {() => number} [options.clock] time source in ms (for tests)
   */
  constructor({ fftSize = 2048, autoGain = true, prefix = 'audio', clock = null } = {}) {
    this.fftSize = fftSize;
    this.autoGain = autoGain;
    this.prefix = prefix;
    this._clock = clock || (() => performance.now());
    this._source = null;
    this._ctx = null;
    this._nodes = [];
    this._elementSources = new WeakMap();
    this._unregister = [];
    this._listeners = new Map();
    this._last = null;
    this._prev = null;

    this._bands = new Map();
    this._onsets = new Map();
    this._rms = { value: 0, peak: 0, attack: 0.01, release: 0.2 };
    this._centroid = { value: 0.5, attack: 0.08, release: 0.2 };

    this._expose('rms', () => this._rms.value);
    this._expose('centroid', () => this._centroid.value);
    for (const [name, opts] of Object.entries(DEFAULT_BANDS)) this.band(name, opts);
    for (const [name, opts] of Object.entries(DEFAULT_ONSETS)) this.onset(name, opts);
  }

  // ─── Inputs ────────────────────────────────────────────────────────────

  /** Analyze an <audio>/<video> element. It stays audible. */
  async connectElement(el) {
    const ctx = await this._context();
    let node = this._elementSources.get(el);
    if (!node) {
      node = ctx.createMediaElementSource(el); // only allowed once per element
      this._elementSources.set(el, node);
    }
    return this._connectNode(node, true);
  }

  /** Analyze the microphone / line-in. Not routed to speakers (no feedback). */
  async connectMic(constraints = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...constraints },
    });
    return this.connectStream(stream);
  }

  /** Analyze any MediaStream (mic, tab capture, WebRTC…). */
  async connectStream(stream) {
    const ctx = await this._context();
    this._stream = stream;
    return this._connectNode(ctx.createMediaStreamSource(stream), false);
  }

  /** Analyze an existing Web Audio node; `audible` also routes it to the speakers. */
  async connectNode(node, audible = false) {
    this._ctx = node.context;
    await this._resume();
    return this._connectNode(node, audible);
  }

  /** Use a custom source: { sampleRate, binCount, spectrum, waveform, pull() }. */
  useSource(source) {
    this._disconnectNodes();
    return this._setSource(source);
  }

  /** Disconnect the current input and release the mic, keeping the analyzer reusable. */
  stop() {
    this._disconnectNodes();
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._source = null;
    for (const b of this._bands.values()) b.value = b.level = 0;
    for (const o of this._onsets.values()) o.value = 0;
    this._rms.value = 0;
  }

  /** Resume a suspended AudioContext (call from a user gesture if needed). */
  async resume() {
    await this._resume();
  }

  get context() { return this._ctx; }
  get connected() { return !!this._source; }

  // ─── Signal definitions ────────────────────────────────────────────────

  /** Define (or redefine) a frequency band signal `audio:<name>`. */
  band(name, { lo, hi, attack = 0.01, release = 0.25 } = {}) {
    if (lo == null || hi == null) throw new TypeError(`band("${name}") needs lo and hi (Hz)`);
    this._bands.set(name, { lo, hi, attack, release, level: 0, peak: 0, value: 0 });
    this._expose(name, () => this._bands.get(name)?.value ?? 0);
    return this.signal(name);
  }

  /**
   * Define an onset (transient) signal `audio:<name>`: jumps to ~1 when the
   * band's spectral flux exceeds its recent average, then decays.
   * `sensitivity` is the flux multiple over average needed (lower = more triggers).
   * `minFlux` and `minLevel` are absolute floors (0..1) so room noise and mic hiss
   * never count as hits: the jump must be real and the band must actually be loud.
   */
  onset(name, { lo, hi, sensitivity = 1.8, decay = 0.2, cooldown = 0.12, minFlux = 0.04, minLevel = 0.3 } = {}) {
    if (lo == null || hi == null) throw new TypeError(`onset("${name}") needs lo and hi (Hz)`);
    this._onsets.set(name, { lo, hi, sensitivity, decay, cooldown, minFlux, minLevel, mean: 0, sinceTrigger: 1, value: 0, count: 0 });
    this._expose(name, () => this._onsets.get(name)?.value ?? 0);
    return this.signal(name);
  }

  /** Function returning the current 0..1 value of a signal. */
  signal(name) {
    return () => this.value(name);
  }

  /** Current 0..1 value of a signal (rms, centroid, or any band/onset name). */
  value(name) {
    this._ensureFresh();
    if (name === 'rms') return this._rms.value;
    if (name === 'centroid') return this._centroid.value;
    return this._bands.get(name)?.value ?? this._onsets.get(name)?.value ?? 0;
  }

  /** Snapshot of every signal, for scenes that read audio directly. */
  get levels() {
    this._ensureFresh();
    const out = { rms: this._rms.value, centroid: this._centroid.value };
    for (const [name, b] of this._bands) out[name] = b.value;
    for (const [name, o] of this._onsets) out[name] = o.value;
    return out;
  }

  /** Total triggers fired so far by an onset signal. */
  triggerCount(name) {
    return this._onsets.get(name)?.count ?? 0;
  }

  /** Call `fn(strength)` each time an onset signal fires. Returns an unsubscribe fn. */
  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this._listeners.get(name)?.delete(fn);
  }

  /** Signal names available as automation types, e.g. ['audio:bass', …]. */
  get signalNames() {
    return ['rms', 'centroid', ...this._bands.keys(), ...this._onsets.keys()]
      .map(n => `${this.prefix}:${n}`);
  }

  // ─── Analysis ──────────────────────────────────────────────────────────

  /** Run one analysis step. Called lazily by signal reads; safe to call manually. */
  update(now = this._clock()) {
    const src = this._source;
    if (!src) return;
    const dt = this._last == null ? 1 / 60 : clamp((now - this._last) / 1000, 0.001, 0.1);
    this._last = now;

    this._prev.set(src.spectrum);
    src.pull();
    const spec = src.spectrum;
    const binHz = src.sampleRate / 2 / src.binCount;
    const binRange = (lo, hi) => [
      clamp(Math.floor(lo / binHz), 0, src.binCount - 1),
      clamp(Math.ceil(hi / binHz), 1, src.binCount),
    ];

    // RMS from the waveform
    const wave = src.waveform;
    let sum = 0;
    for (let i = 0; i < wave.length; i++) {
      const v = (wave[i] - 128) / 128;
      sum += v * v;
    }
    const rms = wave.length ? Math.sqrt(sum / wave.length) : 0;
    this._rms.value = follow(this._rms.value, this._normalize(this._rms, rms, 0.05, dt), dt, this._rms.attack, this._rms.release);

    // Bands
    for (const b of this._bands.values()) {
      const [i0, i1] = binRange(b.lo, b.hi);
      let s = 0;
      for (let i = i0; i < i1; i++) s += spec[i];
      b.level = i1 > i0 ? s / (i1 - i0) / 255 : 0;
      b.value = follow(b.value, this._normalize(b, b.level, 0.15, dt), dt, b.attack, b.release);
    }

    // Spectral centroid (log-scaled brightness, 100 Hz … 8 kHz → 0..1)
    let weighted = 0;
    let total = 0;
    for (let i = 1; i < src.binCount; i++) {
      weighted += i * binHz * spec[i];
      total += spec[i];
    }
    if (total > src.binCount * 2) {
      const hz = weighted / total;
      const n = clamp(Math.log2(Math.max(hz, 1) / 100) / Math.log2(80), 0, 1);
      this._centroid.value = follow(this._centroid.value, n, dt, this._centroid.attack, this._centroid.release);
    }

    // Onsets (spectral flux against a running mean)
    for (const [name, o] of this._onsets) {
      const [i0, i1] = binRange(o.lo, o.hi);
      let flux = 0;
      let level = 0;
      for (let i = i0; i < i1; i++) {
        const d = spec[i] - this._prev[i];
        if (d > 0) flux += d;
        level += spec[i];
      }
      const n = i1 - i0;
      flux = n > 0 ? flux / n / 255 : 0;
      level = n > 0 ? level / n / 255 : 0;

      o.sinceTrigger += dt;
      o.value *= Math.exp(-dt / o.decay);
      const threshold = o.mean * o.sensitivity + o.minFlux;
      if (flux > threshold && level >= o.minLevel && o.sinceTrigger >= o.cooldown) {
        const strength = clamp(0.5 + 0.5 * (flux / threshold - 1), 0.5, 1);
        o.value = Math.max(o.value, strength);
        o.sinceTrigger = 0;
        o.count++;
        this._listeners.get(name)?.forEach(fn => fn(strength));
      }
      o.mean += (flux - o.mean) * Math.min(1, dt / 0.5);
    }
  }

  /** Tear down: unregister signals, disconnect nodes, release mic, close the context. */
  destroy() {
    for (const off of this._unregister) off();
    this._unregister = [];
    this._disconnectNodes();
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._source = null;
    this._listeners.clear();
    if (this._ctx && this._ctx.state !== 'closed') this._ctx.close?.();
    this._ctx = null;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  _expose(name, read) {
    this._unregister.push(registerSignal(`${this.prefix}:${name}`, read));
  }

  _ensureFresh() {
    if (!this._source) return;
    const now = this._clock();
    if (this._last == null || now - this._last >= MIN_UPDATE_MS) this.update(now);
  }

  _normalize(state, level, floor, dt) {
    if (!this.autoGain) return clamp(level, 0, 1);
    state.peak = Math.max(level, floor, (state.peak || 0) * Math.exp(-dt / PEAK_DECAY_SECONDS));
    return clamp(level / state.peak, 0, 1);
  }

  async _context() {
    if (!this._ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio is not supported in this browser');
      this._ctx = new Ctx();
    }
    await this._resume();
    return this._ctx;
  }

  async _resume() {
    if (this._ctx?.state === 'suspended') await this._ctx.resume();
  }

  _connectNode(node, audible) {
    this._disconnectNodes();
    const ctx = this._ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = this.fftSize;
    analyser.smoothingTimeConstant = 0.3;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -20;
    node.connect(analyser);
    if (audible) analyser.connect(ctx.destination);

    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Uint8Array(analyser.fftSize);
    this._nodes = [{ node, analyser, audible, ctx }];
    return this._setSource({
      sampleRate: ctx.sampleRate,
      binCount: analyser.frequencyBinCount,
      spectrum,
      waveform,
      pull() {
        analyser.getByteFrequencyData(spectrum);
        analyser.getByteTimeDomainData(waveform);
      },
    });
  }

  _setSource(source) {
    this._source = source;
    this._prev = new Uint8Array(source.binCount);
    this._last = null;
    return this;
  }

  _disconnectNodes() {
    for (const { node, analyser, audible, ctx } of this._nodes) {
      try {
        node.disconnect(analyser);
        if (audible) analyser.disconnect(ctx.destination);
      } catch { /* already disconnected */ }
    }
    this._nodes = [];
  }
}
