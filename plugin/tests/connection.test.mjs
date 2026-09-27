import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSignals, connectionState, PluginConnection } from '../web/connection.js';

const features = ['rms', 'bass', 'mid', 'high', 'kick', 'snare', 'hat'];
const local = (o = {}) => ({ id: 'local:1', kind: 'local', name: 'Main', live: true, bypass: false, values: [0.5, 2, -1, 0.2, 0, 0, 0], ...o });
const link = (o = {}) => ({ id: 'link:0123456789abcdef', kind: 'link', name: 'Drums', peer: 'Live', subscribed: true, live: true, values: [0.3, 0, 0, 0, 1, 0, 0], ...o });
const packet = (sources = [local()], o = {}) => ({ version: 2, features, song: { valid: true, tempo: 120, beat: 4, playing: true }, link: { running: true, peers: 1 }, sources, ...o });

test('valid packets clamp values and distinguish live, silence, stop and bypass', () => {
  const parsed = parseSignals(packet([local(), link()]), 7);
  assert.deepEqual(parsed.sources[0].values, [0.5, 1, 0, 0.2, 0, 0, 0]);
  assert.equal(parsed.sources[1].peer, 'Live');
  assert.equal(parsed.receivedAt, 7);
  assert.equal(connectionState(parsed), 'live');
  assert.equal(connectionState(parseSignals(packet([local({ values: [0, 0, 0, 0, 0, 0, 0] })]))), 'silent');
  assert.equal(connectionState(parseSignals(packet([local({ live: false })]))), 'waiting');
  const bypassed = parseSignals(packet([local({ live: false, bypass: true })]));
  assert.equal(connectionState(bypassed), 'bypass');
  assert.deepEqual(bypassed.sources[0].values, [0, 0, 0, 0, 0, 0, 0], 'sources that are not live read zero');
});
test('invalid packets cannot inject invalid visual parameters', () => {
  for (const data of [null, {}, { version: 1 }, packet([local({ values: [NaN, 0, 0, 0, 0, 0, 0] })]),
    packet([local({ values: [0, 0] })]), packet([link({ id: 'link:xyz' })]), packet([link({ kind: 'local' })]),
    packet([link({ name: 'x'.repeat(300) })]), packet([], { features: ['rms'] }), packet([], { song: { valid: true, tempo: Infinity, beat: 0, playing: true } }),
    packet(Array.from({ length: 300 }, () => local()))])
    assert.throws(() => parseSignals(data));
});
test('polling requests the wanted Link channels', async () => {
  let requested;
  const connection = new PluginConnection({ url: 'http://127.0.0.1/t/signals', channels: () => ['0123456789abcdef', 'fedcba9876543210'],
    fetcher: async url => { requested = String(url); return { ok: true, json: async () => packet() }; } });
  connection.running = true;
  await connection.poll();
  connection.stop();
  assert.equal(requested, 'http://127.0.0.1/t/signals?sub=0123456789abcdef,fedcba9876543210');
});
test('disconnect clears signals and stop prevents further callbacks', async () => {
  let state;
  const connection = new PluginConnection({ url: 'http://127.0.0.1/signals', onChange: s => { state = s; }, fetcher: async () => { throw new Error('gone'); } });
  connection.running = true;
  connection.packet.sources.push(local());
  await connection.poll();
  connection.stop();
  assert.equal(state, 'disconnected');
  assert.equal(connection.packet.sources.length, 0);
  state = 'stopped';
  await connection.poll();
  assert.equal(state, 'stopped');
});
