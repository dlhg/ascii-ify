import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevels, PluginConnection } from '../web/connection.js';

test('valid packets clamp levels and distinguish live, silence, stop and bypass', () => {
  const data = { version: 1, sequence: 1, active: true, bypass: false, rms: 0.5, bass: 2, mid: -1, high: 0.2 };
  assert.deepEqual(parseLevels(data), { state: 'live', levels: { rms: 0.5, bass: 1, mid: 0, high: 0.2 } });
  assert.equal(parseLevels({ ...data, rms: 0 }).state, 'silent');
  assert.equal(parseLevels({ ...data, active: false }).state, 'waiting');
  assert.deepEqual(parseLevels({ ...data, bypass: true }), { state: 'bypass', levels: { rms: 0, bass: 0, mid: 0, high: 0 } });
});
test('invalid packets cannot inject invalid visual parameters', () => {
  for (const data of [null, {}, { version: 2 }, { version: 1, sequence: 1, active: true, bypass: false, rms: NaN, bass: 0, mid: 0, high: 0 }])
    assert.throws(() => parseLevels(data));
});
test('disconnect clears levels and stop prevents further callbacks', async () => {
  let state;
  const connection = new PluginConnection({ url: 'http://127.0.0.1/levels', onChange: s => { state = s; }, fetcher: async () => { throw new Error('gone'); } });
  connection.running = true;
  connection.levels.bass = 1;
  await connection.poll();
  connection.stop();
  assert.equal(state, 'disconnected');
  assert.equal(connection.levels.bass, 0);
  state = 'stopped';
  await connection.poll();
  assert.equal(state, 'stopped');
});
