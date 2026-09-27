const keys = ['rms', 'bass', 'mid', 'high'];
export const emptyLevels = () => ({ rms: 0, bass: 0, mid: 0, high: 0 });

export function parseLevels(data) {
  if (!data || data.version !== 1 || typeof data.active !== 'boolean' || typeof data.bypass !== 'boolean'
      || !Number.isSafeInteger(data.sequence) || data.sequence < 0
      || keys.some(key => typeof data[key] !== 'number' || !Number.isFinite(data[key]))) {
    throw new Error('Unsupported plugin signal data');
  }
  const levels = Object.fromEntries(keys.map(key => [key, data.active && !data.bypass ? Math.max(0, Math.min(1, data[key])) : 0]));
  const state = data.bypass ? 'bypass' : !data.active ? 'waiting' : levels.rms > 0.0001 ? 'live' : 'silent';
  return { levels, state };
}

export class PluginConnection {
  constructor({ url = new URL('../../levels', location.href), onChange = () => {}, fetcher = (...args) => globalThis.fetch(...args) } = {}) {
    this.url = url;
    this.onChange = onChange;
    this.fetcher = fetcher;
    this.levels = emptyLevels();
    this.running = false;
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
    this.levels = emptyLevels();
  }
  async poll() {
    if (!this.running) return;
    this.abort = new AbortController();
    const deadline = setTimeout(() => this.abort?.abort(), 1200);
    let delay = 33;
    try {
      const response = await this.fetcher(this.url, { signal: this.abort.signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Device disconnected');
      const packet = parseLevels(await response.json());
      if (!this.running) return;
      this.levels = packet.levels;
      this.onChange(packet.state);
    } catch {
      if (!this.running) return;
      this.levels = emptyLevels();
      this.onChange('disconnected');
      delay = 1000;
    } finally {
      clearTimeout(deadline);
      if (this.running) this.timer = setTimeout(() => this.poll(), delay);
    }
  }
}
