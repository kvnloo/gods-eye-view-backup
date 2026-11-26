import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCTV_ACTIVATION_RESULT } from '../../cctvFocusRequest.js';
import { createControls } from './controls.js';

function layer({ enabled = true } = {}) {
  const cameras = [
    {
      id: 'tfl:1',
      name: 'Tower Bridge Rd',
      city: 'London',
      provider: 'TfL',
      lat: 51.5,
      lon: -0.07,
    },
    {
      id: 'sf:2',
      name: 'Bay Bridge',
      city: 'San Francisco',
      provider: 'Caltrans',
      lat: 37.8,
      lon: -122.37,
    },
    {
      id: 'sf:3',
      name: 'I-80 at Bay Bridge Toll Plaza',
      city: 'San Francisco',
      provider: 'Caltrans',
      lat: 37.82,
      lon: -122.31,
    },
  ];
  const records = cameras.map((camera) => ({ camera }));
  const state = {
    _enabled: enabled,
    _records: records,
    _recordById: new Map(records.map((record) => [record.camera.id, record])),
    _activeCameraId: null,
  };
  const calls = [];
  const { methods } = createControls({
    state,
    services: {
      render: { holdContinuousRender() {}, releaseContinuousRender() {} },
      activation: { CCTV_ACTIVATION_RESULT },
    },
    parts: {
      selection: {
        setActiveCamera(id) {
          calls.push(['activate', id]);
          if (!state._recordById.has(id))
            return CCTV_ACTIVATION_RESULT.NOT_FOUND;
          state._activeCameraId = id;
          return CCTV_ACTIVATION_RESULT.ACTIVATED;
        },
      },
      navigation: {
        focusCamera(id) {
          calls.push(['focus', id]);
          return 'focused';
        },
      },
    },
    source: {},
  });
  return { methods, state, calls };
}

test('loaded cameras are found by every word of their name, place or operator, best name first', () => {
  const { methods } = layer();
  const ids = (text, options) =>
    methods.findCameras(text, options).map(({ id }) => id);
  assert.deepEqual(ids('bay bridge'), ['sf:2', 'sf:3']);
  assert.deepEqual(ids('BRIDGE london'), ['tfl:1']);
  assert.deepEqual(ids('caltrans toll'), ['sf:3']);
  assert.deepEqual(ids('bridge', { limit: 1 }).length, 1);
  assert.deepEqual(ids('bridge paris'), []);
  assert.deepEqual(ids(' '), []);
  assert.deepEqual(methods.findCameras('bay bridge')[0], {
    id: 'sf:2',
    name: 'Bay Bridge',
    city: 'San Francisco',
    provider: 'Caltrans',
    lat: 37.8,
    lon: -122.37,
  });
  // A layer that is off has no loaded cameras.
  assert.deepEqual(
    layer({ enabled: false }).methods.findCameras('bay bridge'),
    [],
  );
});

test('a camera is picked by id as a click picks it: activated, centred only when asked', () => {
  const { methods, state, calls } = layer();
  assert.equal(
    methods.pickById('sf:2', { origin: 'user', center: false }),
    true,
  );
  assert.equal(state._activeCameraId, 'sf:2');
  assert.deepEqual(calls, [['activate', 'sf:2']]);
  calls.length = 0;
  assert.equal(methods.pickById('tfl:1'), true);
  assert.deepEqual(calls, [
    ['activate', 'tfl:1'],
    ['focus', 'tfl:1'],
  ]);
  calls.length = 0;
  assert.equal(methods.pickById('nowhere:9'), false);
  assert.equal(methods.pickById(''), false);
  assert.deepEqual(calls, [['activate', 'nowhere:9']]);
  // Nothing is picked in a layer that is off.
  const off = layer({ enabled: false });
  assert.equal(off.methods.pickById('sf:2'), false);
  assert.deepEqual(off.calls, []);
});
