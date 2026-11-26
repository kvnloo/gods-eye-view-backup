import assert from 'node:assert/strict';
import test from 'node:test';
import { findSatellite, showCamera } from './layerLookup.js';

/**
 * One layer, off until switched on; once on, its first data is in on the
 * next tick (or never, or it fails).
 */
function oneLayer(layerId, findByQuery, { feed = 'answers' } = {}) {
  const state = { enabled: false, loaded: false, switches: [] };
  const activity = new Set();
  const changes = new Set();
  const dataManager = {
    layers: new Map([
      [
        layerId,
        {
          module: {
            findByQuery: (query) => (state.loaded ? findByQuery(query) : null),
            getStats: () => ({ lastUpdate: state.loaded ? 1 : null }),
          },
        },
      ],
    ]),
    isEnabled: (id) => id === layerId && state.enabled,
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
          for (const fn of changes) fn({ type: 'refresh-failed', layerId });
          return;
        }
        state.loaded = true;
        for (const fn of activity) fn({ type: 'data-updated', layerId });
      }, 0);
    return true;
  };
  return { state, dataManager, setLayer };
}

const CAMERAS = new Map([
  ['sf:2', { name: 'Bay Bridge', latitude: 37.8, longitude: -122.37 }],
]);
const cameraLayer = (options) =>
  oneLayer('cctv', (id) => CAMERAS.get(id) || null, options);

test('a found camera is shown with CCTV switched on: its identity for the card', async () => {
  const layer = cameraLayer();
  const shown = await showCamera({
    camera: { id: 'sf:2', name: 'Bay Bridge', lat: 37.8, lon: -122.37 },
    ...layer,
  });
  assert.deepEqual(shown, {
    ok: true,
    identity: {
      layerId: 'cctv',
      id: 'sf:2',
      label: 'Bay Bridge',
      lat: 37.8,
      lon: -122.37,
    },
  });
  assert.deepEqual(layer.state.switches, [['cctv', true]]);
  // Already on: nothing is switched.
  const again = await showCamera({
    camera: { id: 'sf:2', name: 'Bay Bridge' },
    ...layer,
  });
  assert.equal(again.ok, true);
  assert.deepEqual(layer.state.switches, [['cctv', true]]);
});

test('a camera the list no longer has, a failed list or a cancelled search switches CCTV back off', async () => {
  const missing = cameraLayer();
  const gone = await showCamera({
    camera: { id: 'sf:9', name: 'Old Camera' },
    ...missing,
  });
  assert.equal(gone.ok, false);
  assert.equal(gone.reason, 'not-found');
  assert.match(gone.say, /Old Camera/);
  assert.deepEqual(missing.state.switches, [
    ['cctv', true],
    ['cctv', false],
  ]);
  const failing = cameraLayer({ feed: 'fails' });
  const failed = await showCamera({ camera: { id: 'sf:2' }, ...failing });
  assert.equal(failed.reason, 'feed-failed');
  assert.ok(failed.say);
  assert.equal(failing.state.enabled, false);
  const silent = cameraLayer({ feed: 'silent' });
  const controller = new AbortController();
  const pending = showCamera({
    camera: { id: 'sf:2' },
    ...silent,
    signal: controller.signal,
  });
  controller.abort();
  assert.equal((await pending).reason, 'cancelled');
  assert.equal(silent.state.enabled, false);
});

const ISS = {
  noradId: 25544,
  name: 'ISS (ZARYA)',
  latitude: 51,
  longitude: 10,
  altitudeM: 420_000,
};
const satelliteLayer = (options) =>
  oneLayer(
    'satellites',
    (query) =>
      String(query) === '25544' || /iss/i.test(String(query)) ? ISS : null,
    options,
  );

test('a satellite is found by name or NORAD number with Satellites switched on', async () => {
  for (const query of ['25544', 'ISS']) {
    const layer = satelliteLayer();
    const found = await findSatellite({ query, ...layer });
    assert.deepEqual(
      found,
      {
        ok: true,
        identity: {
          layerId: 'satellites',
          id: '25544',
          label: 'ISS (ZARYA)',
          lat: 51,
          lon: 10,
        },
      },
      query,
    );
    assert.deepEqual(layer.state.switches, [['satellites', true]], query);
  }
  const layer = satelliteLayer();
  const none = await findSatellite({ query: 'NOAA 99', ...layer });
  assert.equal(none.reason, 'not-found');
  assert.match(none.say, /NOAA 99/);
  assert.equal(layer.state.enabled, false);
});
