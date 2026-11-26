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

/** Satellites with a legend: Starlink's catalog loads only with its class shown. */
function legendLayer({ hidden = [], starlinkInCatalog = true } = {}) {
  const layer = oneLayer('satellites', () => null);
  const shown = new Set(
    ['stations', 'imaging', 'debris', 'starlink'].filter(
      (c) => !hidden.includes(c),
    ),
  );
  const catalog = new Map([
    ['ISS (ZARYA)', { noradId: 25544, satelliteClass: 'stations' }],
    ['FENGYUN 1C DEB', { noradId: 29733, satelliteClass: 'debris' }],
  ]);
  const starlink = { noradId: 44238, satelliteClass: 'starlink' };
  const calls = [];
  const module = layer.dataManager.layers.get('satellites').module;
  module.findByQuery = (query) => {
    if (!layer.state.loaded) return null;
    const wanted = String(query).toUpperCase();
    let found = catalog.get(wanted);
    if (
      !found &&
      wanted === 'STARLINK-1007' &&
      shown.has('starlink') &&
      starlinkInCatalog
    )
      found = starlink;
    return found
      ? {
          ...found,
          name: wanted,
          classShown: shown.has(found.satelliteClass),
          latitude: 1,
          longitude: 2,
        }
      : null;
  };
  module.getParams = () => ({
    catalog: shown.has('starlink') ? 'dense' : 'core',
  });
  module.showSatelliteClass = async (satelliteClass) => {
    calls.push(['show', satelliteClass]);
    shown.add(satelliteClass);
    return true;
  };
  module.setParams = (params) => {
    calls.push(['set', params]);
    for (const [name, on] of Object.entries(params.classes || {}))
      if (on) shown.add(name);
      else shown.delete(name);
    return true;
  };
  return { ...layer, calls, shown };
}

test('a satellite in a class the legend hides is found and its class shown, so its pick is on screen', async () => {
  const layer = legendLayer({ hidden: ['debris'] });
  const found = await findSatellite({ query: 'FENGYUN 1C DEB', ...layer });
  assert.equal(found.ok, true);
  assert.equal(found.identity.id, '29733');
  assert.deepEqual(layer.calls, [['show', 'debris']]);
  // A class already shown is left as it is.
  const shownLayer = legendLayer();
  await findSatellite({ query: 'ISS (ZARYA)', ...shownLayer });
  assert.deepEqual(shownLayer.calls, []);
});

test("a Starlink name has Starlink's catalog loaded to look, and hidden again when it is not there", async () => {
  const layer = legendLayer({ hidden: ['starlink'] });
  const found = await findSatellite({ query: 'Starlink-1007', ...layer });
  assert.equal(found.ok, true);
  assert.equal(found.identity.id, '44238');
  assert.deepEqual(layer.calls, [['show', 'starlink']]);
  assert.ok(layer.shown.has('starlink'));
  const missing = legendLayer({
    hidden: ['starlink'],
    starlinkInCatalog: false,
  });
  const none = await findSatellite({ query: 'Starlink-1007', ...missing });
  assert.equal(none.reason, 'not-found');
  assert.ok(!missing.shown.has('starlink'));
  // Satellites itself, switched on only to look, goes back off.
  assert.equal(missing.state.enabled, false);
  // Another name never loads Starlink's catalog.
  const other = legendLayer({ hidden: ['starlink'] });
  await findSatellite({ query: 'NOAA 99', ...other });
  assert.deepEqual(other.calls, []);
});
