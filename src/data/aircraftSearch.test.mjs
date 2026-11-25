import assert from 'node:assert/strict';
import test from 'node:test';
import { findAircraft, waitForLayerFirstData } from './aircraftSearch.js';

const JAL58 = {
  icao24: '86d5a2',
  callsign: 'JAL58',
  latitude: 47,
  longitude: -150,
};
const JAL581 = { ...JAL58, icao24: '86d5a3', callsign: 'JAL581' };

/**
 * Flights, off until switched on; once on, its feed answers on the next tick
 * (or fails, or never answers).
 */
function flightsLayer(fleet, { feed = 'answers' } = {}) {
  const state = { enabled: false, loaded: false, switches: [] };
  const activity = new Set();
  const changes = new Set();
  const dataManager = {
    layers: new Map([
      [
        'flights',
        {
          module: {
            findByQuery: (query) => {
              if (!state.loaded) return null;
              const wanted = query.toLowerCase();
              return (
                fleet.find((a) => a.callsign.toLowerCase() === wanted) ||
                fleet.find((a) => a.callsign.toLowerCase().includes(wanted)) ||
                null
              );
            },
            getStats: () => ({ lastUpdate: state.loaded ? 1 : null }),
          },
        },
      ],
    ]),
    isEnabled: (id) => id === 'flights' && state.enabled,
    subscribeActivity(fn) {
      activity.add(fn);
      return () => activity.delete(fn);
    },
    subscribe(fn) {
      changes.add(fn);
      return () => changes.delete(fn);
    },
  };
  const setLayer = (id, enabled) => {
    state.switches.push([id, enabled]);
    state.enabled = enabled;
    if (!enabled) state.loaded = false;
    if (enabled && feed !== 'silent')
      setTimeout(() => {
        if (feed === 'fails') {
          for (const fn of changes)
            fn({ type: 'refresh-failed', layerId: 'flights' });
          return;
        }
        state.loaded = true;
        for (const fn of activity)
          fn({ type: 'data-updated', layerId: 'flights' });
      }, 0);
    return true;
  };
  return { state, dataManager, setLayer };
}

test('an aircraft is found by exactly its name, with Flights switched on to look', async () => {
  const layer = flightsLayer([JAL581, JAL58]);
  const found = await findAircraft({ query: 'JL58', ...layer });
  assert.equal(found.ok, true);
  assert.equal(found.found.icao24, '86d5a2');
  assert.deepEqual(layer.state.switches, [['flights', true]]);
});

test('Flights switched on only to look goes back off when nothing matches', async () => {
  const layer = flightsLayer([JAL581]);
  const found = await findAircraft({ query: 'JAL58', ...layer });
  assert.equal(found.ok, false);
  assert.equal(found.reason, 'not-found');
  assert.match(found.say, /JAL58/);
  assert.deepEqual(layer.state.switches, [
    ['flights', true],
    ['flights', false],
  ]);
});

test('a failed or silent feed is not read as "no such aircraft"', async () => {
  for (const feed of ['fails', 'silent']) {
    const layer = flightsLayer([JAL58], { feed });
    const found = await findAircraft({
      query: 'JAL58',
      ...layer,
      timeoutMs: 20,
    });
    assert.equal(found.reason, 'feed-failed', feed);
    assert.doesNotMatch(found.say, /No aircraft/, feed);
    assert.equal(layer.state.enabled, false, feed);
  }
});

test('a search superseded while the feed loads switches Flights back off', async () => {
  const layer = flightsLayer([JAL58], { feed: 'silent' });
  const controller = new AbortController();
  const pending = findAircraft({
    query: 'JAL58',
    ...layer,
    signal: controller.signal,
  });
  controller.abort();
  const found = await pending;
  assert.equal(found.reason, 'cancelled');
  assert.equal(layer.state.enabled, false);
});

test("a layer's first data is given up on after the timeout", async () => {
  const layer = flightsLayer([JAL58], { feed: 'silent' });
  layer.setLayer('flights', true);
  assert.equal(
    await waitForLayerFirstData(layer.dataManager, 'flights', {
      timeoutMs: 10,
    }),
    'timeout',
  );
});

test('a switch-on whose first update stalls still gives up on time or when superseded', async () => {
  for (const ending of ['timeout', 'abort']) {
    const layer = flightsLayer([JAL58], { feed: 'silent' });
    // As the layer lifecycle does: the layer is on at once, and the switch
    // settles only with its first update, which never comes; a later
    // switch-off does settle.
    const switchOn = layer.setLayer;
    layer.setLayer = (id, enabled) => {
      switchOn(id, enabled);
      return enabled ? new Promise(() => {}) : true;
    };
    const controller = new AbortController();
    const pending = findAircraft({
      query: 'JAL58',
      ...layer,
      signal: controller.signal,
      timeoutMs: 30,
    });
    if (ending === 'abort') setTimeout(() => controller.abort(), 5);
    const settled = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve('still pending'), 500)),
    ]);
    assert.notEqual(settled, 'still pending', ending);
    assert.equal(
      settled.reason,
      ending === 'abort' ? 'cancelled' : 'feed-failed',
      ending,
    );
    // Switched on by this search, so switched off again.
    assert.equal(layer.state.enabled, false, ending);
  }
});
