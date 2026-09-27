// Audio sources a mapping can listen to, and how a route names one.
//
// A route's `source` is a path of URI-encoded parts, so exported mappings stay
// readable and survive Live renumbering its tracks:
//
//   link/<peer>/<track>/<feature>   a Live track received over Link Audio
//   plugin/<track>/<feature>        the track an ASCII Visuals device sits on
//   plugin/*/<feature>              whichever track the first device sits on
//   song/<signal>/<count>/<unit>/<start>   a pulse or ramp repeating every <count>
//                                   units, starting on unit <start> (1-based)
//   song/playing                    Live's transport state
//
// Link channel ids only last while a channel exists, so routes store names and are
// resolved against the latest /signals packet.

// Wire order from the native plugin (native/Meter.h).
export const FEATURES = [
  { id: 'rms', name: 'Level', kind: 'level' },
  { id: 'bass', name: 'Bass', kind: 'level' },
  { id: 'mid', name: 'Mids', kind: 'level' },
  { id: 'high', name: 'Highs', kind: 'level' },
  { id: 'kick', name: 'Kick hits', kind: 'hit' },
  { id: 'snare', name: 'Snare hits', kind: 'hit' },
  { id: 'hat', name: 'Hat hits', kind: 'hit' },
];
// Timed signals repeat over a length chosen on the mapping; `length` is the default.
export const SONG = [
  { id: 'pulse', name: 'Pulse', detail: 'Jumps at the start of each cycle, then fades. Set its length on the mapping.', length: { count: 1, unit: 'beat', start: 1 } },
  { id: 'ramp', name: 'Ramp', detail: 'Rises from 0 to 1 across each cycle. Set its length on the mapping.', length: { count: 1, unit: 'bar', start: 1 } },
  { id: 'playing', name: 'Playing', detail: '1 while Live is playing' },
];
// Bars follow Live's time signature; the others are fractions of a quarter-note beat.
export const UNITS = [
  { id: '16th', one: '16th', many: '16ths', perBeat: 4 },
  { id: '8th', one: '8th', many: '8ths', perBeat: 2 },
  { id: 'beat', one: 'beat', many: 'beats', perBeat: 1 },
  { id: 'bar', one: 'bar', many: 'bars' },
];
export const MAX_COUNT = 64;
const featureIds = new Set(FEATURES.map(f => f.id));
const timedIds = new Set(SONG.filter(s => s.length).map(s => s.id));
const unitIds = new Set(UNITS.map(u => u.id));
// Keys from before lengths were configurable.
const legacySong = { pulse: 'song/pulse/1/beat/1', beat: 'song/ramp/1/beat/1', bar: 'song/ramp/1/bar/1' };
const maxPart = 256;

const enc = encodeURIComponent;
export const THIS_TRACK = '*';
export const sourceKey = {
  link: (peer, track, feature) => `link/${enc(peer)}/${enc(track)}/${feature}`,
  plugin: (track, feature) => `plugin/${track === THIS_TRACK ? THIS_TRACK : enc(track)}/${feature}`,
  song: (signal, { count, unit, start } = SONG.find(s => s.id === signal).length ?? {}) =>
    (timedIds.has(signal) ? `song/${signal}/${count}/${unit}/${start}` : `song/${signal}`),
};
/** The current form of a route source key; older song keys are rewritten. */
export function canonicalSource(key) {
  const name = /^song\/(\w+)$/.exec(key)?.[1];
  return name && Object.hasOwn(legacySong, name) ? legacySong[name] : key;
}
const whole = (text, max) => (/^[1-9]\d{0,2}$/.test(text) && Number(text) <= max ? Number(text) : null);

/** Parse a route source; returns null when it is not a supported source. */
export function parseSource(key) {
  if (typeof key !== 'string' || key.length > 1024) return null;
  const parts = key.split('/');
  let decoded;
  try { decoded = parts.map(p => decodeURIComponent(p)); } catch { return null; }
  if (decoded.some(p => p.length > maxPart)) return null;
  if (canonicalSource(key) !== key) return parseSource(canonicalSource(key));
  const [kind] = decoded;
  if (kind === 'link' && parts.length === 4 && decoded[1] && decoded[2] && featureIds.has(decoded[3]))
    return { kind, peer: decoded[1], track: decoded[2], feature: decoded[3] };
  if (kind === 'plugin' && parts.length === 3 && decoded[1] && featureIds.has(decoded[2]))
    return { kind, track: parts[1] === THIS_TRACK ? THIS_TRACK : decoded[1], feature: decoded[2] };
  if (kind === 'song' && parts.length === 2 && decoded[1] === 'playing') return { kind, signal: 'playing' };
  if (kind === 'song' && parts.length === 5 && timedIds.has(decoded[1]) && unitIds.has(decoded[3])) {
    const count = whole(decoded[2], MAX_COUNT), start = whole(decoded[4], MAX_COUNT);
    if (count && start && start <= count) return { kind, signal: decoded[1], count, unit: decoded[3], start };
  }
  return null;
}
export const validSource = key => parseSource(key) !== null;

/** The packet source (track) a parsed route source refers to, if present now. */
export function findTrack(packet, parsed) {
  if (!packet || !parsed) return null;
  if (parsed.kind === 'plugin') {
    const locals = packet.sources.filter(s => s.kind === 'local');
    return parsed.track === THIS_TRACK ? locals[0] ?? null : locals.find(s => s.name === parsed.track) ?? null;
  }
  if (parsed.kind === 'link') return packet.sources.find(s => s.kind === 'link' && s.peer === parsed.peer && s.name === parsed.track) ?? null;
  return null;
}

const frac = x => x - Math.floor(x);
/** Song position extrapolated from the packet to `now` (ms, performance.now()). */
export function songAt(packet, now) {
  const song = packet?.song;
  if (!song?.valid) return null;
  const elapsed = Math.max(0, Math.min(1000, now - packet.receivedAt)) / 1000;
  return { num: 4, den: 4, barStart: 0, ...song, beat: song.playing ? song.beat + elapsed * song.tempo / 60 : song.beat };
}

/** Song position in `unit`s. Bars assume the current time signature held since bar 1. */
function position(song, unit) {
  if (unit !== 'bar') return song.beat * UNITS.find(u => u.id === unit).perBeat;
  const barLength = song.num * 4 / song.den;
  return (song.beat - song.barStart) / barLength + Math.round(song.barStart / barLength);
}
/** 0..1 through the current cycle of a timed song signal. */
export const cyclePhase = (song, { count, unit, start }) => frac((position(song, unit) - (start - 1)) / count);

/** Current 0..1 value of a route source. Level features are square-rooted for a livelier response. */
export function sourceValue(packet, key, now = performance.now()) {
  const parsed = parseSource(key);
  if (!parsed) return 0;
  if (parsed.kind === 'song') {
    const song = songAt(packet, now);
    if (!song) return 0;
    if (parsed.signal === 'playing') return song.playing ? 1 : 0;
    if (!song.playing) return 0;
    const phase = cyclePhase(song, parsed);
    return parsed.signal === 'ramp' ? phase : Math.pow(1 - phase, 3);
  }
  const track = findTrack(packet, parsed);
  if (!track?.live) return 0;
  const index = FEATURES.findIndex(f => f.id === parsed.feature);
  const value = track.values[index] ?? 0;
  return FEATURES[index].kind === 'level' ? Math.sqrt(value) : value;
}

/** Link channel ids that must be streamed for these route sources. */
export function channelsFor(packet, keys) {
  const ids = new Set();
  for (const key of keys) {
    const track = findTrack(packet, parseSource(key));
    if (track?.kind === 'link') ids.add(track.id.slice(5));
  }
  return [...ids];
}

/** Display name for a route source, e.g. "Drums · Kick hits". */
export function sourceLabel(key, packet) {
  const parsed = parseSource(key);
  if (!parsed) return 'Unknown input';
  if (parsed.kind === 'song') {
    const name = `Song · ${SONG.find(s => s.id === parsed.signal).name}`;
    if (!parsed.count) return name;
    const unit = UNITS.find(u => u.id === parsed.unit);
    return `${name} · ${parsed.count} ${parsed.count === 1 ? unit.one : unit.many}${parsed.start > 1 ? ` from ${unit.one} ${parsed.start}` : ''}`;
  }
  const feature = FEATURES.find(f => f.id === parsed.feature).name;
  if (parsed.kind === 'plugin' && parsed.track === THIS_TRACK) {
    const name = findTrack(packet, parsed)?.name;
    return `This device${name ? ` (${name})` : ''} · ${feature}`;
  }
  return `${parsed.track} · ${feature}`;
}

/** Why a source currently reads zero, or '' when it is fine. */
export function sourceProblem(key, packet) {
  const parsed = parseSource(key);
  if (!parsed || !packet) return '';
  if (parsed.kind === 'song') return packet.song.valid ? '' : 'Live has not reported its transport yet.';
  if (findTrack(packet, parsed)) return '';
  if (parsed.kind === 'link')
    return `Track “${parsed.track}” from ${parsed.peer} isn’t available. Check Link and Link Audio are on in Live, and the track name is unchanged.`;
  return `No ASCII Visuals device on a track named “${parsed.track}”.`;
}

/**
 * Tracks grouped for the input picker: this device first, then each Link peer's
 * tracks, then the song transport.
 */
export function trackGroups(packet) {
  const groups = [];
  const locals = packet?.sources.filter(s => s.kind === 'local') ?? [];
  if (locals.length) groups.push({ name: 'This device', tracks: locals.map((s, i) => ({
    key: i === 0 ? THIS_TRACK : s.name, label: i === 0 ? `This device${s.name ? ` · ${s.name}` : ''}` : s.name,
    source: s, prefix: i === 0 ? 'plugin/*' : `plugin/${enc(s.name)}`,
  })) });
  const byPeer = new Map();
  for (const s of packet?.sources ?? []) {
    if (s.kind !== 'link') continue;
    if (!byPeer.has(s.peer)) byPeer.set(s.peer, []);
    const list = byPeer.get(s.peer);
    // Live track names can repeat; only the first is addressable by name.
    if (!list.some(t => t.source.name === s.name)) list.push({ key: s.name, label: s.name, source: s, prefix: `link/${enc(s.peer)}/${enc(s.name)}` });
  }
  for (const [peer, tracks] of byPeer) groups.push({ name: `${peer} tracks`, tracks, link: true });
  return groups;
}
