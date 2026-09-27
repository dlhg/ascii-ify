import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceKey, parseSource, sourceValue, channelsFor, trackGroups, sourceLabel, sourceProblem, THIS_TRACK } from '../web/sources.js';

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
