import { FEATURES } from './sources.js';

const featureIds = FEATURES.map(f => f.id);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = (s, max = 256) => typeof s === 'string' && s.length <= max;
const idPattern = /^(local:\d{1,6}|link:[0-9a-f]{16})$/;
const maxSources = 256;
// A busy page (heavy scene, slow machine) can miss a poll deadline while the device
// is fine. Keep the last packet through short gaps instead of flashing "disconnected".
const graceMs = 2500;

export const emptyPacket = () => ({
  song: { valid: false, tempo: 0, beat: 0, playing: false, num: 4, den: 4, barStart: 0 },
  link: { running: false, peers: 0 }, sources: [], receivedAt: 0,
});

/** Validate a /signals response. Values are clamped so nothing can push a parameter out of range. */
export function parseSignals(data, receivedAt = 0) {
  if (!data || data.version !== 2 || !Array.isArray(data.features) || data.features.join() !== featureIds.join()
      || !data.song || typeof data.song.valid !== 'boolean' || typeof data.song.playing !== 'boolean'
      || !finite(data.song.tempo) || !finite(data.song.beat)
      || !data.link || typeof data.link.running !== 'boolean' || !Number.isSafeInteger(data.link.peers)
      || !Array.isArray(data.sources) || data.sources.length > maxSources) throw new Error('Unsupported plugin signal data');
  const sources = data.sources.map(s => {
    if (!s || !idPattern.test(s.id) || !['local', 'link'].includes(s.kind) || s.id.split(':')[0] !== s.kind
        || !text(s.name) || typeof s.live !== 'boolean' || !Array.isArray(s.values) || s.values.length !== featureIds.length
        || s.values.some(v => !finite(v)) || (s.kind === 'link' && (!text(s.peer) || typeof s.subscribed !== 'boolean'))
        || (s.kind === 'local' && typeof s.bypass !== 'boolean')) throw new Error('Unsupported plugin signal data');
    const values = s.values.map(v => (s.live ? Math.max(0, Math.min(1, v)) : 0));
    return s.kind === 'link'
      ? { id: s.id, kind: s.kind, name: s.name, peer: s.peer, live: s.live, subscribed: s.subscribed, values }
      : { id: s.id, kind: s.kind, name: s.name, live: s.live, bypass: s.bypass, values };
  });
  const { valid, tempo, beat, playing } = data.song;
  // Time signature and the latest bar start; older plugins and some hosts omit them.
  const meter = n => Number.isInteger(n) && n >= 1 && n <= 64;
  const signed = meter(data.song.num) && meter(data.song.den);
  const song = { valid, tempo, beat, playing, num: signed ? data.song.num : 4, den: signed ? data.song.den : 4,
    barStart: finite(data.song.barStart) ? data.song.barStart : 0 };
  return { song, link: { running: data.link.running, peers: data.link.peers }, sources, receivedAt };
}

/** One word for the header: live, silent, waiting, bypass (or disconnected, set by the poller). */
export function connectionState(packet) {
  const locals = packet.sources.filter(s => s.kind === 'local');
  if (packet.sources.some(s => s.live && s.values[0] > 0.0001)) return 'live';
  if (packet.sources.some(s => s.live)) return 'silent';
  if (locals.length && locals.every(s => s.bypass) && !packet.sources.some(s => s.kind === 'link')) return 'bypass';
  return 'waiting';
}

export class PluginConnection {
  // `channels()` returns the Link channel ids to stream; the plugin drops any that
  // no open page has asked for in the last two seconds.
  constructor({ url = new URL('../../signals', location.href), onChange = () => {}, channels = () => [],
    fetcher = (...args) => globalThis.fetch(...args), clock = () => performance.now() } = {}) {
    this.url = url;
    this.onChange = onChange;
    this.channels = channels;
    this.fetcher = fetcher;
    this.clock = clock;
    this.packet = emptyPacket();
    this.running = false;
    this.lastOk = null;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.abort?.abort();
    this.packet = emptyPacket();
    this.lastOk = null;
  }
  async poll() {
    if (!this.running) return;
    this.abort = new AbortController();
    const deadline = setTimeout(() => this.abort?.abort(), 1200);
    let delay = 33;
    try {
      const url = new URL(this.url);
      const ids = this.channels().slice(0, 64);
      if (ids.length) url.search = `sub=${ids.join(',')}`;
      const response = await this.fetcher(url, { signal: this.abort.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Device disconnected');
      const packet = parseSignals(await response.json(), this.clock());
      if (!this.running) return;
      this.packet = packet;
      this.lastOk = this.clock();
      this.onChange(connectionState(packet), packet);
    } catch {
      if (!this.running) return;
      if (this.lastOk !== null && this.clock() - this.lastOk < graceMs) { delay = 100; return; }
      this.lastOk = null;
      this.packet = emptyPacket();
      this.onChange('disconnected', this.packet);
      delay = 1000;
    } finally {
      clearTimeout(deadline);
      if (this.running) this.timer = setTimeout(() => this.poll(), delay);
    }
  }
}
