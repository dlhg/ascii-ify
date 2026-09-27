// Audio sources a mapping can listen to, and how a route names one.
//
// A route's `source` is a path of URI-encoded parts, so exported mappings stay
// readable and survive Live renumbering its tracks:
//
//   link/<peer>/<track>/<feature>   a Live track received over Link Audio
//   plugin/<track>/<feature>        the track an ASCII Visuals device sits on
//   plugin/*/<feature>              whichever track the first device sits on
//   song/<signal>                   tempo-synced signals from Live's transport
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
export const SONG = [
  { id: 'pulse', name: 'Beat pulse', detail: 'Jumps on every beat, then fades' },
  { id: 'beat', name: 'Beat ramp', detail: 'Rises from 0 to 1 across each beat' },
  { id: 'bar', name: 'Bar ramp', detail: 'Rises from 0 to 1 across each 4-beat bar' },
  { id: 'playing', name: 'Playing', detail: '1 while Live is playing' },
];
const featureIds = new Set(FEATURES.map(f => f.id));
const songIds = new Set(SONG.map(s => s.id));
const maxPart = 256;

const enc = encodeURIComponent;
export const THIS_TRACK = '*';
export const sourceKey = {
  link: (peer, track, feature) => `link/${enc(peer)}/${enc(track)}/${feature}`,
  plugin: (track, feature) => `plugin/${track === THIS_TRACK ? THIS_TRACK : enc(track)}/${feature}`,
  song: signal => `song/${signal}`,
};

/** Parse a route source; returns null when it is not a supported source. */
export function parseSource(key) {
  if (typeof key !== 'string' || key.length > 1024) return null;
  const parts = key.split('/');
  let decoded;
  try { decoded = parts.map(p => decodeURIComponent(p)); } catch { return null; }
  if (decoded.some(p => p.length > maxPart)) return null;
  const [kind] = decoded;
  if (kind === 'link' && parts.length === 4 && decoded[1] && decoded[2] && featureIds.has(decoded[3]))
    return { kind, peer: decoded[1], track: decoded[2], feature: decoded[3] };
  if (kind === 'plugin' && parts.length === 3 && decoded[1] && featureIds.has(decoded[2]))
    return { kind, track: parts[1] === THIS_TRACK ? THIS_TRACK : decoded[1], feature: decoded[2] };
  if (kind === 'song' && parts.length === 2 && songIds.has(decoded[1])) return { kind, signal: decoded[1] };
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
  return { ...song, beat: song.playing ? song.beat + elapsed * song.tempo / 60 : song.beat };
}

/** Current 0..1 value of a route source. Level features are square-rooted for a livelier response. */
export function sourceValue(packet, key, now = performance.now()) {
  const parsed = parseSource(key);
  if (!parsed) return 0;
  if (parsed.kind === 'song') {
    const song = songAt(packet, now);
    if (!song) return 0;
    if (parsed.signal === 'playing') return song.playing ? 1 : 0;
    if (!song.playing) return 0;
    if (parsed.signal === 'beat') return frac(song.beat);
    if (parsed.signal === 'bar') return frac(song.beat / 4);
    return Math.pow(1 - frac(song.beat), 3); // pulse
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
  if (parsed.kind === 'song') return `Song · ${SONG.find(s => s.id === parsed.signal).name}`;
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
