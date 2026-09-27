import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceKey, parseSource, canonicalSource, cyclePhase, sourceValue, channelsFor, trackGroups, sourceLabel, sourceProblem, THIS_TRACK } from '../web/sources.js';

const values = (rms, kick = 0) => [rms, 0, 0, 0, kick, 0, 0];
const packet = {
  receivedAt: 1000,
  song: { valid: true, tempo: 120, beat: 7.5, playing: true }, link: { running: true, peers: 1 },
  sources: [
    { id: 'local:1', kind: 'local', name: 'Main', live: true, bypass: false, values: values(0.25) },
    { id: 'link:00000000000000aa', kind: 'link', name: 'Drums', peer: 'Live', live: true, subscribed: true, values: values(0.64, 0.9) },
    { id: 'link:00000000000000bb', kind: 'link', name: 'Drums', peer: 'Live', live: false, subscribed: false, values: values(0) },
    { id: 'link:00000000000000cc', kind: 'link', name: 'Keys/Pad “A”', peer: 'Live', live: false, subscribed: false, values: values(0) },
  ],
};
test('source keys round-trip any track name', () => {
  for (const name of ['Keys/Pad “A”', '50% wet', 'a%2Fb', '  spaced  ']) {
    assert.deepEqual(parseSource(sourceKey.link('Live', name, 'bass')), { kind: 'link', peer: 'Live', track: name, feature: 'bass' });
    assert.deepEqual(parseSource(sourceKey.plugin(name, 'hat')), { kind: 'plugin', track: name, feature: 'hat' });
  }
  assert.deepEqual(parseSource(sourceKey.plugin(THIS_TRACK, 'rms')), { kind: 'plugin', track: THIS_TRACK, feature: 'rms' });
  for (const bad of ['rms', 'song/tempo', 'link/Live/Drums', 'link//Drums/rms', 'plugin/x/y/rms', 42, 'x'.repeat(2000)]) assert.equal(parseSource(bad), null);
});
test('values resolve by track name, square-root levels and keep hits linear', () => {
  assert.equal(sourceValue(packet, 'plugin/*/rms'), 0.5);
  assert.equal(sourceValue(packet, 'plugin/Main/rms'), 0.5);
  assert.equal(sourceValue(packet, 'link/Live/Drums/rms'), 0.8);
  assert.equal(sourceValue(packet, 'link/Live/Drums/kick'), 0.9);
  assert.equal(sourceValue(packet, 'link/Live/Missing/rms'), 0);
});
test('song signals follow the beat between packets', () => {
  assert.equal(sourceValue(packet, 'song/beat', 1000), 0.5);
  assert.equal(sourceValue(packet, 'song/bar', 1000), 7.5 / 4 % 1);
  assert.equal(sourceValue(packet, 'song/beat', 1250), 0); // 120 bpm: a quarter second later is the next beat
  assert.equal(sourceValue(packet, 'song/pulse', 1250), 1);
  assert.equal(sourceValue(packet, 'song/playing'), 1);
  assert.equal(sourceValue({ ...packet, song: { ...packet.song, playing: false } }, 'song/pulse'), 0);
});
test('timed song keys carry a length and reject bad ones', () => {
  assert.equal(sourceKey.song('ramp'), 'song/ramp/1/bar/1');
  assert.equal(sourceKey.song('pulse', { count: 4, unit: '8th', start: 2 }), 'song/pulse/4/8th/2');
  assert.equal(sourceKey.song('playing'), 'song/playing');
  assert.deepEqual(parseSource('song/ramp/4/bar/3'), { kind: 'song', signal: 'ramp', count: 4, unit: 'bar', start: 3 });
  for (const bad of ['song/ramp', 'song/ramp/0/bar/1', 'song/ramp/65/bar/1', 'song/ramp/4/bar/5', 'song/ramp/4/bar/0',
    'song/ramp/1.5/bar/1', 'song/ramp/04/bar/1', 'song/ramp/4/bars/1', 'song/playing/1/bar/1', 'song/constructor'])
    assert.equal(parseSource(bad), null, bad);
});
test('old song keys migrate to their timed form', () => {
  assert.equal(canonicalSource('song/bar'), 'song/ramp/1/bar/1');
  assert.equal(canonicalSource('song/beat'), 'song/ramp/1/beat/1');
  assert.equal(canonicalSource('song/pulse'), 'song/pulse/1/beat/1');
  assert.equal(canonicalSource('song/playing'), 'song/playing');
  assert.equal(canonicalSource('song/constructor'), 'song/constructor');
  assert.equal(sourceLabel('song/bar'), 'Song · Ramp · 1 bar');
});
test('cycles follow the time signature and start offset', () => {
  const at = (beat, num = 4, den = 4, barStart = 0) => ({ beat, num, den, barStart });
  const ramp = (count, unit, start = 1) => ({ count, unit, start });
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
  assert.equal(cyclePhase(at(6), ramp(4, 'bar')), 6 / 16);
  assert.equal(cyclePhase(at(8), ramp(4, 'bar', 3)), 0); // bar 3 starts on beat 8
  assert.equal(cyclePhase(at(4), ramp(4, 'bar', 3)), 0.75); // bar 2 is the last of the cycle before
  assert.equal(cyclePhase(at(3, 3, 4, 3), ramp(2, 'bar')), 0.5); // 3/4: beat 3 is bar 2
  assert.equal(cyclePhase(at(7, 7, 8, 7), ramp(1, 'bar')), 0); // 7/8 bars are 3.5 beats
  assert.equal(cyclePhase(at(8.75, 7, 8, 7), ramp(1, 'bar')), 0.5);
  // A signature change keeps downbeats on Live's bar starts.
  near(cyclePhase(at(17, 3, 4, 16), ramp(1, 'bar')), 1 / 3);
  assert.equal(cyclePhase(at(0.25), ramp(1, '16th')), 0);
  near(cyclePhase(at(0.75), ramp(3, '8th', 2)), 1 / 6);
});
test('pulse and ramp values use the chosen length', () => {
  const song = { ...packet, song: { ...packet.song, beat: 6, num: 4, den: 4, barStart: 4 } };
  assert.equal(sourceValue(song, 'song/ramp/2/bar/1', 1000), 0.75);
  assert.equal(sourceValue(song, 'song/pulse/2/beat/1', 1000), 1);
  assert.equal(sourceValue(song, 'song/pulse/4/beat/1', 1000), 0.125);
  assert.equal(sourceLabel('song/pulse/2/bar/2'), 'Song · Pulse · 2 bars from bar 2');
});
test('only Link tracks used by mappings are streamed', () => {
  assert.deepEqual(channelsFor(packet, ['plugin/*/rms', 'link/Live/Drums/kick', 'link/Live/Drums/rms', 'song/pulse', 'link/Live/Nope/rms']), ['00000000000000aa']);
});
test('picker groups list this device first, one entry per track name, then peers', () => {
  const groups = trackGroups(packet);
  assert.deepEqual(groups.map(g => g.name), ['This device', 'Live tracks']);
  assert.equal(groups[0].tracks[0].prefix, 'plugin/*');
  assert.deepEqual(groups[1].tracks.map(t => t.label), ['Drums', 'Keys/Pad “A”']);
  assert.equal(groups[1].tracks[1].prefix, 'link/Live/Keys%2FPad%20%E2%80%9CA%E2%80%9D');
});
test('labels and problems explain missing tracks', () => {
  assert.equal(sourceLabel('plugin/*/kick', packet), 'This device (Main) · Kick hits');
  assert.equal(sourceLabel('link/Live/Drums/hat', packet), 'Drums · Hat hits');
  assert.equal(sourceProblem('link/Live/Drums/hat', packet), '');
  assert.match(sourceProblem('link/Live/Vox/hat', packet), /Vox.*Link Audio/);
});
