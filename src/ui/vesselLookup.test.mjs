import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_VESSEL_MATCHES,
  VESSEL_LAYER_ID,
  showVessel,
  vesselMatches,
} from './vesselLookup.js';

test("a lookup's ships are kept once each, with an id and a position", () => {
  const ship = {
    kind: 'vessel',
    id: '366998410',
    name: 'EVER GIVEN',
    lat: 30,
    lon: 32,
  };
  assert.deepEqual(
    vesselMatches([
      ship,
      { ...ship, name: 'again' },
      { kind: 'aircraft', id: 'a12b2e', lat: 1, lon: 2 },
      { kind: 'vessel', id: '', lat: 1, lon: 2 },
      { kind: 'vessel', id: '1', lat: 95, lon: 2 },
      { kind: 'vessel', id: '2', lat: 'x', lon: 2 },
      {
        kind: 'vessel',
        id: 353136000,
        name: '  ',
        imo: 9811000,
        lat: -1,
        lon: 179,
      },
    ]),
    [
      {
        kind: 'vessel',
        id: '366998410',
        name: 'EVER GIVEN',
        imo: null,
        callsign: null,
        lat: 30,
        lon: 32,
      },
      {
        kind: 'vessel',
        id: '353136000',
        name: null,
        imo: '9811000',
        callsign: null,
        lat: -1,
        lon: 179,
      },
    ],
  );
  assert.deepEqual(vesselMatches(null), []);
  const many = Array.from({ length: 9 }, (_, i) => ({
    ...ship,
    id: String(i),
  }));
  assert.equal(vesselMatches(many).length, MAX_VESSEL_MATCHES);
});

/** A vessels layer that is off and loads the ship on its next update. */
function vesselLayer({ arrives = true } = {}) {
  const state = {
    enabled: false,
    loaded: false,
    selected: [],
    centred: [],
    switched: [],
    tracked: 0,
  };
  let listener = null;
  const dataManager = {
    layers: new Map([
      [
        VESSEL_LAYER_ID,
        {
          module: {
            findByQuery: (query) =>
              state.loaded && query === '366998410'
                ? { id: 'uuid-1', mmsi: '366998410', name: 'EVER GIVEN' }
                : null,
            selectById: (id) => {
              state.selected.push(id);
              return true;
            },
            trackById: () => {
              state.tracked++;
              return true;
            },
          },
        },
      ],
    ]),
    isEnabled: (id) => id === VESSEL_LAYER_ID && state.enabled,
    subscribeActivity(fn) {
      listener = fn;
      return () => {
        listener = null;
      };
    },
  };
  return {
    state,
    dataManager,
    setLayer: (id, enabled) => {
      state.switched.push([id, enabled]);
      state.enabled = enabled;
      return true;
    },
    centre: (lat, lon) => {
      state.centred.push([lat, lon]);
      // The layer loads around the new view.
      setTimeout(() => {
        state.loaded = arrives;
        listener?.({ type: 'data-updated', layerId: VESSEL_LAYER_ID });
      }, 0);
    },
  };
}

test('a looked-up ship switches Vessels on, is centred once and selected, never followed', async () => {
  const layer = vesselLayer();
  const shown = await showVessel({
    vessel: { id: '366998410', lat: 30.5, lon: 32.3 },
    ...layer,
  });
  assert.deepEqual(shown, { ok: true, id: 'uuid-1' });
  assert.deepEqual(layer.state.switched, [[VESSEL_LAYER_ID, true]]);
  assert.deepEqual(layer.state.centred, [[30.5, 32.3]]);
  assert.deepEqual(layer.state.selected, ['uuid-1']);
  assert.equal(layer.state.tracked, 0);
});

test('a ship that never arrives in the layer is not selected', async () => {
  const layer = vesselLayer({ arrives: false });
  const shown = await showVessel({
    vessel: { id: '366998410', lat: 30.5, lon: 32.3 },
    ...layer,
    timeoutMs: 30,
  });
  assert.deepEqual(shown, { ok: false, reason: 'not-loaded' });
  assert.deepEqual(layer.state.selected, []);
});
