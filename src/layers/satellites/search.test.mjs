// A satellite asked for by name or NORAD number is found in the whole
// catalog, whatever classes the legend shows, best name first; one in a
// hidden class can have its class shown (src/ui/layerLookup.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createControls } from './controls.js';

const part = (named = {}) =>
  new Proxy(named, {
    get: (target, key) => (key in target ? target[key] : () => undefined),
  });

function satellites({ catalog = 'core', classes = null } = {}) {
  const entries = [
    [44238, { name: 'STARLINK-1007', satelliteClass: 'starlink' }],
    [99001, { name: 'MISSION ISSUE', satelliteClass: 'probes' }],
    [28654, { name: 'NOAA 18 DEB', satelliteClass: 'debris' }],
    [33592, { name: 'NOAA 19 R/B', satelliteClass: 'debris' }],
    [33591, { name: 'NOAA 19', satelliteClass: 'imaging' }],
    [43013, { name: 'NOAA 20 (JPSS-1)', satelliteClass: 'imaging' }],
    [25544, { name: 'ISS (ZARYA)', satelliteClass: 'stations' }],
    [12345, { name: 'SAT 25544', satelliteClass: 'probes' }],
  ];
  const state = {
    _catalog: new Map(entries.map(([id, sat]) => [id, { ...sat, satrec: id }])),
    _points: new Map(entries.map(([id]) => [id, {}])),
    _params: { catalog, ...(classes ? { classes } : {}) },
    _denseIds: [],
    _trackedNorad: null,
    _orbitPaths: new Map(),
    _detectionObjects: new Map(),
    now: () => 0,
  };
  const loads = [];
  const { methods } = createControls({
    state,
    services: { layerState: { isExplicitLayerStateOrigin: () => true } },
    parts: {
      orbits: part({
        propagatePosition: (satrec) => ({
          latitude: satrec % 50,
          longitude: satrec % 90,
          altitude: 500_000,
        }),
      }),
      rendering: part(),
      tracking: part(),
      labels: part(),
      catalog: part({
        _loadDenseCatalog: () => {
          loads.push('dense');
          return Promise.resolve({ status: 'ready', added: 1 });
        },
        _removeDenseCatalog: () => {},
      }),
    },
    source: {},
  });
  return { methods, state, loads };
}

test('a NORAD number wins, then a name that is the query, then one that starts with it, then one holding it', () => {
  const { methods } = satellites();
  const id = (query) => methods.findByQuery(query)?.noradId ?? null;
  assert.equal(id('25544'), 25544);
  assert.equal(id(' 33591 '), 33591);
  // "NOAA 19 R/B" comes first in the catalog and starts with "NOAA 19".
  assert.equal(id('noaa 19'), 33591);
  assert.equal(id('NOAA 2'), 43013);
  assert.equal(id('NOAA 1'), 28654);
  // "MISSION ISSUE" comes first and holds "iss"; "ISS (ZARYA)" starts with it.
  assert.equal(id('iss'), 25544);
  // A NORAD number beats a name that holds the digits.
  assert.equal(id('SAT 25544'), 12345);
  assert.equal(id('zarya'), 25544);
  assert.equal(id('nowhere'), null);
});

test('a satellite in a class the legend hides is still found, and says its class is hidden', () => {
  const { methods } = satellites({
    classes: {
      stations: true,
      imaging: true,
      telecom: true,
      probes: true,
      debris: false,
    },
  });
  const debris = methods.findByQuery('NOAA 18 DEB');
  assert.equal(debris.noradId, 28654);
  assert.equal(debris.satelliteClass, 'debris');
  assert.equal(debris.classShown, false);
  // Starlink shows only with its own catalog loaded.
  const starlink = methods.findByQuery('Starlink-1007');
  assert.equal(starlink.noradId, 44238);
  assert.equal(starlink.classShown, false);
  assert.equal(methods.findByQuery('NOAA 19').classShown, true);
});

test("a hidden class is shown on request; Starlink's catalog is loaded for it", async () => {
  const { methods, loads } = satellites({
    classes: {
      stations: true,
      imaging: true,
      telecom: true,
      probes: true,
      debris: false,
    },
  });
  assert.equal(await methods.showSatelliteClass('debris'), true);
  assert.equal(methods.getParams().classes.debris, true);
  assert.equal(methods.findByQuery('NOAA 18 DEB').classShown, true);
  assert.deepEqual(loads, []);
  assert.equal(await methods.showSatelliteClass('starlink'), true);
  assert.deepEqual(loads, ['dense']);
  assert.equal(methods.getParams().catalog, 'dense');
  assert.equal(methods.findByQuery('STARLINK-1007').classShown, true);
  // A class already shown changes nothing.
  assert.equal(await methods.showSatelliteClass('imaging'), true);
  assert.deepEqual(loads, ['dense']);
});
