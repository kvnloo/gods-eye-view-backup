// src/ui/omnibarRows.test.mjs — the Omnibar's one pipeline from typed text
// to rows, read without the DOM: what Enter runs for a line before any row is
// chosen, what may go to the place service, and the rows themselves.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aircraftLine,
  aircraftQuery,
  createOmnibar,
  readLine,
} from './omnibarRows.js';
import { normalizeLine } from './omnibarIntent.js';

const LAYERS = [
  { id: 'flights', name: 'Live Flights', enabled: false },
  { id: 'military', name: 'Military Flights', enabled: false },
  { id: 'radio', name: 'Radio', enabled: false },
  { id: 'cctv', name: 'CCTV', enabled: false },
  { id: 'earthquakes', name: 'Earthquakes', enabled: false },
  { id: 'traffic', name: 'Traffic', enabled: false },
  { id: 'weather-radar', name: 'Weather radar', enabled: false },
];
const layers = (on = []) =>
  LAYERS.map((layer) => ({ ...layer, enabled: on.includes(layer.id) }));

/** One step of a plan, as the table writes it. */
function stepOutcome(step) {
  switch (step.kind) {
    case 'place':
      return `fly(${step.place})`;
    case 'layer':
      return `layer(${step.layer.id},${step.enabled ? 'on' : 'off'})`;
    case 'style':
      return `style(${step.style})`;
    case 'stack':
      return `map(${step.stack})`;
    case 'camera':
      return `camera(${step.act || step.args?.motion || step.args?.direction || step.name})`;
    case 'hud':
      return `hud(${step.visible})`;
    case 'panel':
      return `panel(${step.action} ${step.item || step.side})`;
    case 'radio':
      return `radio(${step.action || 'enable'})`;
    case 'follow':
      return `follow(${step.query})`;
    default:
      return step.kind;
  }
}

/** What Enter runs for a line before any row is chosen. */
function outcome(text, { on = [], places = [] } = {}) {
  const omnibar = createOmnibar({ layers: layers(on) });
  const { rows, defaultIndex } = omnibar.rows(text, { places });
  const row = rows[defaultIndex];
  if (!row) return 'nothing';
  switch (row.kind) {
    case 'place':
      return `search(${row.place})`;
    case 'layer':
      return `layer(${row.id},${row.enabled ? 'on' : 'off'})`;
    case 'ask':
      return `ask(${row.query})`;
    case 'plan':
      return row.steps.map(stepOutcome).join(' + ');
    case 'aircraft':
      return `aircraft(${row.aircraft})`;
    default:
      return row.kind;
  }
}

// Every line is read with no row chosen. `search(q)` is the place search,
// `nothing` means Enter runs nothing.
const OUTCOMES = [
  // A switch after what it switches is a switch, never a place.
  ['noir off', 'style(normal)'],
  ['Noir off', 'style(normal)'],
  ['noir on', 'style(noir)'],
  ['turn off noir', 'style(normal)'],
  ['thermal off', 'style(normal)'],
  ['night vision off', 'style(normal)'],
  ['orbit off', 'camera(stop)'],
  ['osm off', 'nothing'],
  ['hud off', 'hud(off)'],
  ['radio off', 'radio(disable)'],
  ['cctv off', 'layer(cctv,off)'],
  ['Bath on', 'search(Bath on)'],
  // A verb ends at a space: hyphenated names are names.
  ['Hide-A-Way Lake noir', 'search(Hide-A-Way Lake noir)'],
  ['Hide-A-Way Lake', 'search(Hide-A-Way Lake)'],
  ['Show-Me Lake radio', 'search(Show-Me Lake radio)'],
  // A closing full stop, curly apostrophes and "please".
  ['Show flights.', 'layer(flights,on)'],
  ['show flights!', 'layer(flights,on)'],
  ['please show flights', 'layer(flights,on)'],
  ['Please, show flights', 'layer(flights,on)'],
  ['show flights please', 'layer(flights,on)'],
  ['North up.', 'camera(northUp)'],
  ['please north up', 'camera(northUp)'],
  ['Clear all layers!', 'camera(clear)'],
  ['what’s here', 'ask(what’s here)'],
  ['what’s here?', 'ask(what’s here?)'],
  ['Paris, Texas.', 'search(Paris, Texas.)'],
  ['Washington D.C.', 'search(Washington D.C.)'],
  ['please', 'search(please)'],
  // Ask GEV (a billed call) needs a question, not a name.
  ['Do it Best Hardware', 'search(Do it Best Hardware)'],
  ['Can You Imagine', 'search(Can You Imagine)'],
  ['Is This It', 'search(Is This It)'],
  ['Where Is My Mind', 'search(Where Is My Mind)'],
  ['can you show me', 'nothing'],
  ['is it raining in tokyo', 'nothing'],
  ['is it raining in tokyo?', 'ask(is it raining in tokyo?)'],
  ['where is my mind', 'ask(where is my mind)'],
  ['how far is paris', 'ask(how far is paris)'],
  ['Can Tho City', 'search(Can Tho City)'],
  ['Is there', 'search(Is there)'],
  // Pasted sentences are no place, and words about a layer are no place.
  ['Show radio stations', 'layer(radio,on)'],
  ['show radio station', 'layer(radio,on)'],
  ['show flights here', 'layer(flights,on)'],
  ['flights here', 'search(flights here)'],
  ['I went to the store yesterday and it was really great', 'nothing'],
  ['the quick brown fox jumps over the lazy dog', 'nothing'],
  ['we saw so many flights over the city and it was loud', 'nothing'],
  ['go to Austin and show flights', 'fly(austin) + layer(flights,on)'],
  // keywords without a verb ask for nothing,
  // however many clauses they fill, and names keep their words.
  ['Fire and Rain', 'search(Fire and Rain)'],
  ['Rain, Thermal', 'search(Rain, Thermal)'],
  ['Weather and Traffic', 'search(Weather and Traffic)'],
  // Each word alone is a command that runs ("orbit", "tilt").
  ['Orbit and Tilt', 'camera(orbit) + camera(tilt)'],
  ['Noir and Thermal', 'search(Noir and Thermal)'],
  ['Trains and Boats and Planes', 'search(Trains and Boats and Planes)'],
  ['Storm Lake and Spencer', 'search(Storm Lake and Spencer)'],
  ['Fire Island and Ocean Beach', 'search(Fire Island and Ocean Beach)'],
  ['Thermal and Indio', 'search(Thermal and Indio)'],
  ['Please Touch Museum', 'search(Please Touch Museum)'],
  ['Kindly Lane', 'search(Kindly Lane)'],
  ['Pretty Please', 'search(Pretty Please)'],
  ['Yahoo!', 'search(Yahoo!)'],
  ['Draw Bridge', 'search(Draw Bridge)'],
  ['draw well', 'search(draw well)'],
  ['draw a line', 'open-draw'],
  ['How To Train Your Dragon', 'nothing'],
  ['how to see satelites', 'ask(how to see satelites)'],
  ['Train Station', 'search(Train Station)'],
  ['Traffic Status', 'search(Traffic Status)'],
  ['Remove Island', 'search(Remove Island)'],
  ['Toggle Inn', 'search(Toggle Inn)'],
  ['Disable Canyon', 'search(Disable Canyon)'],
  ['remove island', 'nothing'],
  ['show noir and show cctv', 'style(noir) + layer(cctv,on)'],
  // a name with "?" is offered to GEV,
  // never sent; a question's form is.
  ['New York?', 'nothing'],
  ['Truth or Consequences?', 'nothing'],
  ['Ho Chi Minh City?', 'nothing'],
  ['Santa Cruz de la Sierra?', 'nothing'],
  ['東京都？', 'nothing'],
  ['東京はどこ？', 'ask(東京はどこ？)'],
  ['is it far?', 'ask(is it far?)'],
  ['how about the weather in paris today?', 'nothing'],
  // a switch with its place after "in" asks;
  // a vague "how do I" runs no walk; names with "senha" or "xox" in them
  // and addresses with numbers are places.
  ['turn on radio in tokyo', 'fly(tokyo) + radio(enable)'],
  ['enable radio in tokyo', 'fly(tokyo) + radio(enable)'],
  ['turn on noir in tokyo', 'fly(tokyo) + style(noir)'],
  ['how do I share', 'guide'],
  ['how do I sha', 'nothing'],
  ['Sachsenhausen', 'search(Sachsenhausen)'],
  ['Xoxocotla', 'search(Xoxocotla)'],
  ['Meguro Honmachi 2-chome', 'search(Meguro Honmachi 2-chome)'],
  [
    '1600 Pennsylvania Ave NW Washington DC 20500',
    'search(1600 Pennsylvania Ave NW Washington DC 20500)',
  ],
  // A long comma address beside a layer word is a sentence; a verb that
  // starts a name asks for nothing; small talk asks no question.
  ['San Jose, Santa Clara County, California, USA flights', 'nothing'],
  ['Start Point noir', 'search(Start Point noir)'],
  ['Track Hill noir', 'search(Track Hill noir)'],
  ['Open Bay north up', 'search(Open Bay north up)'],
  ['show noir', 'style(noir)'],
  ['play radio tokyo', 'fly(tokyo) + radio(enable)'],
  ["what's up", "search(what's up)"],
  ["how's it going", "search(how's it going)"],
  ["what's the weather in paris", "ask(what's the weather in paris)"],
  ['Hauptstrasse 12 10115 Berlin', 'search(Hauptstrasse 12 10115 Berlin)'],
  // "of" and "at" may join the words of a name; CJK addresses and
  // postcodes are places.
  ['Planes of Fame Air Museum', 'search(Planes of Fame Air Museum)'],
  ['Boats at Sea', 'search(Boats at Sea)'],
  ['flights over texas', 'fly(texas) + layer(flights,on)'],
  ['北京市朝阳区建国路88号', 'search(北京市朝阳区建国路88号)'],
  ['東京都港区六本木6丁目', 'search(東京都港区六本木6丁目)'],
  ['Washington DC 20500-0003', 'search(Washington DC 20500-0003)'],
  ['Calle 100 # 19-61 Bogota', 'search(Calle 100 # 19-61 Bogota)'],
  // Long names are offered to search on purpose; Enter runs nothing.
  // "Track 7" and "Nearest Plane Crash Site" are names.
  ['Tverskaya 13 125009 Moscow', 'search(Tverskaya 13 125009 Moscow)'],
  ['San Miguel de las Piedras Primera Sección', 'nothing'],
  ['Goto', 'search(Goto)'],
  ['goto tokyo', 'search(tokyo)'],
  ['Track 7', 'search(Track 7)'],
  ['Track 29', 'search(Track 29)'],
  ['Nearest Plane Crash Site', 'search(Nearest Plane Crash Site)'],
  ['nearest plane', 'nearest'],
  // Lines the mounted Enter table pins too, read through the module.
  ['tokyo traffic', 'search(tokyo traffic)'],
  ['flights near tokyo', 'fly(tokyo) + layer(flights,on)'],
  ['radio near Clear Lake', 'search(clear lake)'],
  ['Thermal', 'search(Thermal)'],
  ['Thermal, California', 'search(Thermal, California)'],
  ['radio', 'search(radio)'],
  ['share', 'nothing'],
  ['hide', 'nothing'],
  ['Turn on the radio', 'layer(radio,on)'],
];

for (const [text, expected] of OUTCOMES)
  test(`Enter on ${JSON.stringify(text)} runs ${expected}`, () => {
    assert.equal(outcome(text), expected);
  });

test('"show flights" with Live Flights on offers Live Flights, not Military Flights', () => {
  assert.equal(
    outcome('show flights', { on: ['flights'] }),
    'layer(flights,on)',
  );
  assert.equal(
    outcome('turn on flights', { on: ['flights'] }),
    'layer(flights,on)',
  );
  const { rows, defaultIndex } = createOmnibar({
    layers: layers(['flights']),
  }).rows('show flights');
  // Nothing to switch on the default row; Military Flights is offered after.
  assert.equal(rows[defaultIndex].hint, 'Layer');
  assert.ok(rows.some((row) => row.id === 'military'));
  assert.equal(outcome('hide flights', { on: [] }), 'layer(flights,off)');
  // "military" names Military Flights, never Live Flights.
  assert.equal(outcome('show military'), 'layer(military,on)');
});

test('a layer near a place cannot admit an unrelated bare style step', () => {
  assert.doesNotMatch(outcome('flights near Austin and noir'), /style\(noir\)/);
  assert.equal(
    outcome('flights near Austin'),
    'fly(austin) + layer(flights,on)',
  );
});

test('postcodes, street numbers and coordinates are places; callsigns are not', () => {
  const omnibar = createOmnibar({ layers: layers() });
  assert.equal(omnibar.placeQuery('SW1A 1AA'), 'SW1A 1AA');
  assert.equal(omnibar.placeQuery('10 Downing Street'), '10 Downing Street');
  assert.equal(omnibar.placeQuery('Route 66'), 'Route 66');
  for (const callsign of ['UAL2110', 'BAW15K', 'N123AB'])
    assert.equal(omnibar.placeQuery(callsign), null, callsign);
  // A road that only looks like a callsign is asked of the place service.
  assert.equal(omnibar.placeQuery('US101'), 'US101');
  for (const text of ['30.2672, -97.7431', '14R PU 2090 4906']) {
    const { rows, defaultIndex } = omnibar.rows(text);
    assert.equal(rows[defaultIndex].kind, 'place', text);
    assert.ok(rows[defaultIndex].coords, text);
  }
});

test("a map item the line names exactly leads, even a place's namesake; a callsign leads", () => {
  const omnibar = createOmnibar({ layers: layers() });
  const entities = (text) =>
    [
      {
        key: 's1',
        icon: 'directions_boat',
        identity: 's1',
        title: 'HAMBURG',
        layerName: 'Vessels',
      },
      {
        key: 'f1',
        icon: 'flight',
        identity: 'f1',
        title: 'UAL123',
        layerName: 'Flights',
      },
    ].filter((item) => item.title.toLowerCase().startsWith(text.toLowerCase()));
  const hamburg = omnibar.rows('Hamburg', { entities });
  assert.equal(hamburg.defaultIndex, 0);
  assert.equal(hamburg.rows[0].kind, 'entity');
  assert.equal(hamburg.rows[1].kind, 'place');
  // One that only starts with the line follows the place.
  const partial = omnibar.rows('Hamb', { entities });
  assert.equal(partial.rows[partial.defaultIndex].kind, 'place');
  assert.equal(partial.rows[1].kind, 'entity');
  const callsign = omnibar.rows('UAL123', { entities });
  assert.equal(callsign.rows[callsign.defaultIndex].kind, 'entity');
});

test('an aircraft a line clearly names is offered first, to select, never followed', () => {
  const omnibar = createOmnibar({ layers: layers() });
  // Nothing loaded (every layer off): Enter looks for the aircraft by name.
  for (const [text, query, label] of [
    ['JAL58', 'JAL58', 'JAL58'],
    ['jal58', 'JAL58', 'JAL58'],
    ['UAL 123', 'UAL123', 'UAL123'],
    ['N123AB', 'N123AB', 'N123AB'],
    ['G-EUPT', 'G-EUPT', 'G-EUPT'],
    ['BAW15K', 'BAW15K', 'BAW15K'],
    ['EZY12AB', 'EZY12AB', 'EZY12AB'],
    ['RYR4QW', 'RYR4QW', 'RYR4QW'],
    ['a12b2e', 'A12B2E', 'A12B2E'],
    // Flight numbers as tickets write them, shown as their callsigns.
    ['JL58', 'JL58', 'JAL58'],
    ['UA 123', 'UA123', 'UAL123'],
    ['U2 1234', 'U21234', 'EZY1234'],
    ['BA2490', 'BA2490', 'BAW2490'],
  ]) {
    const { rows, defaultIndex } = omnibar.rows(text, { entities: () => [] });
    assert.equal(defaultIndex, 0, text);
    assert.equal(rows[0].kind, 'aircraft', text);
    assert.equal(rows[0].aircraft, query, text);
    assert.equal(rows[0].label, label, text);
    assert.equal(outcome(text), `aircraft(${query})`, text);
    // Never a "Follow" row: a search result is selected, not followed.
    assert.ok(!rows.some((row) => row.kind === 'plan'), text);
    // The place service is never asked for it.
    assert.equal(omnibar.placeQuery(text), null, text);
  }
  // A word or a number that only looks like a code is still a place.
  assert.equal(aircraftQuery('decade'), null);
  assert.equal(aircraftQuery('123456'), null);
  assert.equal(aircraftQuery('Tokyo'), null);
  assert.equal(outcome('Tokyo'), 'search(Tokyo)');
  // A loaded aircraft called exactly that leads, with no second row for it;
  // one whose callsign only begins with it comes after the aircraft row.
  const entities = (text) =>
    [
      {
        key: 'f1',
        icon: 'flight',
        identity: 'f1',
        title: 'JAL581',
        layerName: 'Flights',
      },
      {
        key: 'f2',
        icon: 'flight',
        identity: 'f2',
        title: 'UAL123',
        layerName: 'Flights',
      },
    ].filter((item) => item.title.toLowerCase().startsWith(text.toLowerCase()));
  const prefix = omnibar.rows('JAL58', { entities });
  assert.deepEqual(
    prefix.rows.slice(0, 2).map((row) => row.key),
    ['aircraft:JAL58', 'entity:f1'],
  );
  assert.equal(prefix.defaultIndex, 0);
  const exact = omnibar.rows('UAL 123', { entities });
  assert.equal(exact.rows[exact.defaultIndex].key, 'entity:f2');
  assert.ok(!exact.rows.some((row) => row.kind === 'aircraft'));
});

test('roads, postcodes, aircraft types and gadgets still go to the place search', () => {
  const omnibar = createOmnibar({ layers: layers() });
  // Not aircraft at all: no aircraft row, and Enter searches the place.
  for (const text of [
    'US101',
    'HWY1',
    'RT66',
    'SW1A',
    'SE10',
    'NW3',
    'EC1',
    'SR71',
    'MD11',
    'CO2',
    'MP4',
    'PS5',
    'iOS17',
    'Al-Ahbub',
  ]) {
    const { rows } = omnibar.rows(text, { entities: () => [] });
    assert.equal(outcome(text), `search(${text})`, text);
    assert.equal(aircraftLine(text), null, text);
    assert.ok(!rows.some((row) => row.kind === 'aircraft'), text);
    assert.ok(
      !rows.some((row) => row.kind === 'layer' && row.id === 'flights'),
      text,
    );
  }
  // Also a flight number: Enter still searches the place, and the aircraft
  // is offered right after it, run only when chosen.
  for (const text of [
    'CA1',
    'A303',
    'A320',
    'A380',
    'B6135',
    'KC135',
    'BA15',
    'N12',
  ]) {
    const { rows, defaultIndex } = omnibar.rows(text, { entities: () => [] });
    assert.equal(outcome(text), `search(${text})`, text);
    assert.equal(rows[defaultIndex].kind, 'place', text);
    assert.equal(rows[defaultIndex + 1].kind, 'aircraft', text);
    assert.equal(aircraftQuery(text), null, text);
  }
});

test("ships the host's lookup found are offered, exact ones first", () => {
  const omnibar = createOmnibar({ layers: layers() });
  const vessels = [
    { id: '353136000', name: 'EVER GIVEN', imo: '9811000', lat: 30, lon: 32 },
    { id: '477000001', name: 'EVER GIVEN II', imo: null, lat: 1, lon: 2 },
    { id: '311000999', name: 'GIVEN', callsign: 'C6AB2', lat: 3, lon: 4 },
  ];
  // An MMSI, IMO number or callsign: that ship leads and Enter shows it.
  for (const [text, key] of [
    ['353136000', 'vessel:353136000'],
    ['9811000', 'vessel:353136000'],
    ['C6AB2', 'vessel:311000999'],
  ]) {
    const { rows, defaultIndex } = omnibar.rows(text, { vessels });
    assert.equal(rows[defaultIndex].key, key, text);
  }
  // A name no place is found by: the ship called exactly that leads, and
  // Enter shows it rather than geocoding the name; the others come last.
  const named = omnibar.rows('Ever Given', { vessels });
  assert.equal(named.rows[named.defaultIndex].key, 'vessel:353136000');
  assert.equal(named.rows[1].kind, 'place');
  assert.deepEqual(
    named.rows.slice(-2).map((row) => row.key),
    ['vessel:477000001', 'vessel:311000999'],
  );
  const places = [
    { name: 'Ever Given Lane', detail: 'Texas', latitude: 30, longitude: -97 },
  ];
  // The ship named exactly leads a place found by that name too.
  const withPlace = omnibar.rows('Ever Given', { vessels, places });
  assert.equal(withPlace.rows[withPlace.defaultIndex].key, 'vessel:353136000');
  assert.equal(withPlace.rows[1].kind, 'place');
  // A ship that only holds the line never leads, nor beats Ask GEV.
  const partial = omnibar.rows('Given', {
    vessels: vessels.filter((vessel) => vessel.name !== 'GIVEN'),
  });
  assert.notEqual(partial.rows[partial.defaultIndex].kind, 'vessel');
  const ask = partial.rows.findIndex((row) => row.kind === 'ask');
  const ship = partial.rows.findIndex((row) => row.kind === 'vessel');
  assert.ok(ask !== -1 && ship > ask);
  // A ship already loaded, by MMSI, is listed once, whatever it is called.
  const loaded = omnibar.rows('Ever Given', {
    vessels,
    entities: () => [
      {
        key: 'v1',
        icon: 'directions_boat',
        identity: {
          layerId: 'ais-live-vessels',
          id: 'v1',
          record: { mmsi: 353136000 },
        },
        title: 'EVER GIVEN (loaded)',
        layerName: 'Vessels',
      },
    ],
  });
  assert.ok(!loaded.rows.some((row) => row.key === 'vessel:353136000'));
  // Another ship with the same name as a loaded one is still offered.
  const namesake = omnibar.rows('Ever Given', {
    vessels,
    entities: () => [
      {
        key: 'v2',
        icon: 'directions_boat',
        identity: {
          layerId: 'ais-live-vessels',
          id: 'v2',
          record: { mmsi: 999000111 },
        },
        title: 'EVER GIVEN',
        layerName: 'Vessels',
      },
    ],
  });
  assert.ok(namesake.rows.some((row) => row.key === 'vessel:353136000'));
  // An aircraft line, a command or a layer switch is never a ship.
  for (const text of ['JAL58', 'zoom in', 'show flights', 'go to Ever Given']) {
    const { rows, defaultIndex } = omnibar.rows(text, { vessels });
    assert.ok(!rows.some((row) => row.kind === 'vessel'), text);
    assert.equal(omnibar.lookupQuery(text), null, text);
    assert.notEqual(rows[defaultIndex]?.kind, 'vessel', text);
  }
  assert.equal(omnibar.lookupQuery('Ever Given'), 'Ever Given');
  assert.equal(omnibar.lookupQuery('353136000'), '353136000');
});

test('a looked-up ship already loaded is listed once, by the layer id or the MMSI', () => {
  const omnibar = createOmnibar({ layers: layers() });
  const uuid = '7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6';
  const loadedAs = (id, mmsi) => () => [
    {
      key: `ais-live-vessels:${id}`,
      icon: 'directions_boat',
      identity: { layerId: 'ais-live-vessels', id, record: { mmsi } },
      title: 'EVER GIVEN',
      layerName: 'Vessels',
    },
  ];
  const vessels = [
    { id: uuid, mmsi: '353136000', name: 'EVER GIVEN', lat: 30, lon: 32 },
  ];
  // Keyed by its UUID, with no MMSI on the record.
  const byId = omnibar.rows('Ever Given', {
    vessels,
    entities: loadedAs(uuid, ''),
  });
  assert.ok(!byId.rows.some((row) => row.kind === 'vessel'));
  // Keyed otherwise, with the same MMSI.
  const byMmsi = omnibar.rows('Ever Given', {
    vessels,
    entities: loadedAs('other-key', '353136000'),
  });
  assert.ok(!byMmsi.rows.some((row) => row.kind === 'vessel'));
  // Its MMSI typed: that ship leads.
  const typed = omnibar.rows('353136000', { vessels });
  assert.equal(typed.rows[typed.defaultIndex].key, `vessel:${uuid}`);
});

test('cameras the layer holds or the host found are offered, exact ones first', () => {
  const omnibar = createOmnibar({ layers: layers() });
  const cameras = [
    {
      id: 'sf:3',
      name: 'I-80 at Bay Bridge Toll Plaza',
      city: 'San Francisco',
      lat: 37.82,
      lon: -122.31,
    },
    {
      id: 'sf:2',
      name: 'Bay Bridge',
      city: 'San Francisco',
      lat: 37.8,
      lon: -122.37,
    },
    // The same camera, loaded and found by the host: listed once.
    {
      id: 'sf:2',
      name: 'Bay Bridge',
      city: 'San Francisco',
      lat: 37.8,
      lon: -122.37,
    },
  ];
  // The camera called exactly that leads and Enter opens it; one holding
  // every typed word comes next, over the line as a place.
  const named = omnibar.rows('bay bridge', { cameras });
  assert.equal(named.defaultIndex, 0);
  assert.equal(named.rows[0].key, 'camera:sf:2');
  assert.equal(named.rows[1].key, 'camera:sf:3');
  assert.equal(named.rows[2].kind, 'place');
  assert.equal(named.rows.filter((row) => row.kind === 'camera').length, 2);
  assert.deepEqual(named.rows[0].camera, cameras[1]);
  // A place found by that name: the camera named exactly still leads; one
  // only holding the words comes after the place.
  const places = [
    {
      name: 'Bay Bridge',
      detail: 'California',
      latitude: 37.8,
      longitude: -122.37,
    },
  ];
  const withPlace = omnibar.rows('Bay Bridge', { cameras, places });
  assert.equal(withPlace.rows[withPlace.defaultIndex].key, 'camera:sf:2');
  assert.equal(withPlace.rows[1].kind, 'place');
  assert.ok(withPlace.rows.findIndex((row) => row.key === 'camera:sf:3') > 1);
  // A camera missing a typed word never leads, nor beats Ask GEV.
  const partial = omnibar.rows('plaza oakland', { cameras });
  assert.notEqual(partial.rows[partial.defaultIndex].kind, 'camera');
  const ask = partial.rows.findIndex((row) => row.kind === 'ask');
  const camera = partial.rows.findIndex((row) => row.kind === 'camera');
  assert.ok(ask !== -1 && camera > ask);
  // Ships come before cameras.
  const both = omnibar.rows('Bay Bridge', {
    cameras,
    vessels: [{ id: '353136000', name: 'BAY BRIDGE', lat: 1, lon: 2 }],
  });
  assert.deepEqual(
    both.rows.slice(0, 2).map((row) => row.kind),
    ['vessel', 'camera'],
  );
  // A command or a layer switch is never a camera.
  for (const text of ['show cctv', 'zoom in', 'go to Bay Bridge', 'JAL58']) {
    const { rows } = omnibar.rows(text, { cameras });
    assert.ok(!rows.some((row) => row.kind === 'camera'), text);
  }
});

test('satellites are looked for by NORAD number, and by name while their layer is off', () => {
  const withSatellites = (enabled) => [
    ...layers(),
    { id: 'satellites', name: 'Satellites', enabled },
  ];
  const off = createOmnibar({ layers: withSatellites(false) });
  const on = createOmnibar({ layers: withSatellites(true) });
  // A NORAD number named as one leads, on or off, and is never a place.
  for (const omnibar of [off, on])
    for (const text of ['NORAD 25544', 'norad id 25544', 'NORAD #25544']) {
      const { rows, defaultIndex } = omnibar.rows(text, { entities: () => [] });
      assert.equal(rows[defaultIndex].kind, 'satellite', text);
      assert.equal(rows[defaultIndex].satellite, '25544', text);
      assert.equal(omnibar.placeQuery(text), null, text);
    }
  // A satellite's name, with the layer off: offered after the place, run only
  // when chosen.
  for (const text of ['NOAA 19', 'Starlink-1007', 'ISS', 'Tiangong']) {
    const { rows, defaultIndex } = off.rows(text, { entities: () => [] });
    const index = rows.findIndex((row) => row.kind === 'satellite');
    assert.ok(index !== -1, text);
    assert.equal(rows[index].satellite, text, text);
    assert.notEqual(rows[defaultIndex].kind, 'satellite', text);
  }
  // With the layer on its satellites are found as loaded items instead.
  const loaded = on.rows('NOAA 19', { entities: () => [] });
  assert.ok(!loaded.rows.some((row) => row.kind === 'satellite'));
  // Other names are not satellites.
  for (const text of ['Hamburg', 'Ever Given', 'show satellites', 'zoom in']) {
    const { rows } = off.rows(text, { entities: () => [] });
    assert.ok(!rows.some((row) => row.kind === 'satellite'), text);
  }
});

test('with Satellites on, one the legend hides is offered from the catalog, and a Starlink name the catalog lacks', () => {
  const omnibar = createOmnibar({
    layers: [
      ...layers(),
      { id: 'satellites', name: 'Satellites', enabled: true },
    ],
  });
  const debris = { noradId: 29733, name: 'FENGYUN 1C DEB' };
  // Not among the loaded items (its class is hidden): the catalog's row
  // leads for its exact name, and Enter picks it.
  const exact = omnibar.rows('Fengyun 1C DEB', {
    entities: () => [],
    satellite: debris,
  });
  assert.equal(exact.rows[exact.defaultIndex].key, 'satellite:29733');
  assert.equal(exact.rows[exact.defaultIndex].satellite, '29733');
  assert.equal(exact.rows[exact.defaultIndex].label, 'FENGYUN 1C DEB');
  // Only holding the line: offered last.
  const partial = omnibar.rows('Fengyun', {
    entities: () => [],
    satellite: debris,
  });
  assert.equal(partial.rows.at(-1).key, 'satellite:29733');
  assert.notEqual(partial.rows[partial.defaultIndex].kind, 'satellite');
  // Already a loaded item: listed once.
  const loaded = omnibar.rows('Fengyun 1C DEB', {
    satellite: debris,
    entities: () => [
      {
        key: 'satellites:29733',
        icon: 'satellite_alt',
        identity: { layerId: 'satellites', id: '29733' },
        title: 'FENGYUN 1C DEB',
        layerName: 'Satellites',
      },
    ],
  });
  assert.ok(!loaded.rows.some((row) => row.kind === 'satellite'));
  // A Starlink name the catalog does not hold (Starlink hidden): offered,
  // and choosing it loads Starlink's catalog to look.
  const starlink = omnibar.rows('Starlink-1007', {
    entities: () => [],
    satellite: null,
  });
  const row = starlink.rows.find((item) => item.kind === 'satellite');
  assert.equal(row?.satellite, 'Starlink-1007');
});

test('an item the line names exactly leads every place, landmark and command', () => {
  const omnibar = createOmnibar({
    layers: [
      ...layers(),
      { id: 'satellites', name: 'Satellites', enabled: true },
    ],
  });
  // A satellite named exactly, over a street the geocoder matched loosely.
  const goes = omnibar.rows('GOES 18', {
    entities: () => [],
    satellite: { noradId: 51850, name: 'GOES 18' },
    places: [
      {
        name: 'Albrecht-Goes-Straße 18',
        detail: 'Stuttgart',
        latitude: 48.7,
        longitude: 9.2,
      },
    ],
  });
  assert.equal(goes.rows[0].key, 'satellite:51850');
  assert.equal(goes.defaultIndex, 0);
  // A ship named exactly, over a place named after it.
  const vessels = [
    { id: '353136000', name: 'EVER GIVEN', imo: '9811000', lat: 30, lon: 32 },
  ];
  const ship = omnibar.rows('ever given', {
    vessels,
    places: [
      {
        name: 'Ever Given memorial',
        detail: 'Suez',
        latitude: 30,
        longitude: 32.5,
      },
    ],
  });
  assert.equal(ship.rows[0].key, 'vessel:353136000');
  assert.equal(ship.defaultIndex, 0);
  // Case, spaces and punctuation aside: "london rd staines av" names the
  // camera "London Rd / Staines Av".
  const cameras = [
    {
      id: 'tfl:1',
      name: 'London Rd / Staines Av',
      city: 'London',
      lat: 51.43,
      lon: -0.5,
    },
    {
      id: 'tfl:2',
      name: 'Clockhouse Lane/Staines Rd',
      city: 'London',
      lat: 51.44,
      lon: -0.48,
    },
    {
      id: 'tfl:3',
      name: 'Staines Bridge',
      city: 'London',
      lat: 51.4,
      lon: -0.5,
    },
  ];
  const places = [
    {
      name: 'RD Hair Salon',
      detail: 'London',
      latitude: 51.5,
      longitude: -0.1,
    },
    { name: 'Staines Road', detail: 'London', latitude: 51.4, longitude: -0.4 },
  ];
  const exactCamera = omnibar.rows('london rd staines av', { cameras, places });
  assert.equal(exactCamera.rows[0].key, 'camera:tfl:1');
  assert.equal(exactCamera.defaultIndex, 0);
  assert.ok(exactCamera.rows[0].leads);
  // Cameras holding every typed word (in their name or city) come before
  // the places the geocoder matched loosely, and ahead of the city's
  // landmarks; one that does not stays after the places.
  const loose = omnibar.rows('London Rd Staines', { cameras, places });
  assert.deepEqual(
    loose.rows.slice(0, 2).map((row) => row.key),
    ['camera:tfl:1', 'camera:tfl:2'],
  );
  assert.ok(loose.rows[0].leads);
  const bridge = loose.rows.findIndex((row) => row.key === 'camera:tfl:3');
  const place = loose.rows.findIndex((row) => row.kind === 'place');
  assert.ok(place !== -1 && bridge > place);
  // A place named exactly by the line keeps the top over cameras that only
  // hold its words.
  const city = omnibar.rows('Staines', {
    cameras,
    places: [
      { name: 'Staines', detail: 'Surrey', latitude: 51.43, longitude: -0.51 },
    ],
  });
  assert.equal(city.rows[0].kind, 'place');
  assert.ok(!city.rows[0].leads);
  // Nothing named exactly, no cameras: the place leads as before.
  const plain = omnibar.rows('ever given', {
    vessels: [{ id: '1', name: 'EVER GIVEN II', lat: 1, lon: 2 }],
    places: [
      {
        name: 'Ever Given memorial',
        detail: 'Suez',
        latitude: 30,
        longitude: 32.5,
      },
    ],
  });
  assert.equal(plain.rows[0].kind, 'place');
});

test('a NORAD number row shows the satellite it names', () => {
  const omnibar = createOmnibar({
    layers: [
      ...layers(),
      { id: 'satellites', name: 'Satellites', enabled: true },
    ],
  });
  assert.equal(omnibar.satelliteQuery('NORAD 25544'), '25544');
  assert.equal(omnibar.satelliteQuery('ISS (ZARYA)'), 'ISS (ZARYA)');
  assert.equal(omnibar.satelliteQuery('zoom in'), null);
  const named = omnibar.rows('NORAD 25544', {
    entities: () => [],
    satellite: { noradId: 25544, name: 'ISS (ZARYA)' },
  });
  assert.equal(named.rows[0].satellite, '25544');
  assert.equal(named.rows[0].label, 'ISS (ZARYA) · NORAD 25544');
  // Not in the catalog (or Satellites off): the number as typed.
  const unknown = omnibar.rows('NORAD 25544', { entities: () => [] });
  assert.equal(unknown.rows[0].label, 'NORAD 25544');
});

test('a long name can be searched on purpose', () => {
  const omnibar = createOmnibar({ layers: layers() });
  for (const text of ['San Miguel de las Piedras Primera Sección']) {
    const { rows, defaultIndex } = omnibar.rows(text);
    assert.equal(defaultIndex, -1, text);
    const row = rows.find((each) => each.explicit);
    assert.equal(row?.place, text, text);
    assert.equal(omnibar.placeQuery(text), null, text);
  }
});

test('a pasted sentence is never sent to the place service', () => {
  const omnibar = createOmnibar({ layers: layers() });
  for (const text of [
    'I went to the store yesterday and it was really great',
    'we saw so many flights over the city and it was loud',
    'Show radio stations',
    'noir off',
    'can you show me',
  ])
    assert.equal(omnibar.placeQuery(text), null, text);
  assert.equal(omnibar.placeQuery('Tokyo traffic'), 'Tokyo traffic');
  assert.equal(omnibar.placeQuery('flights near Tokyo.'), 'tokyo');
  assert.equal(omnibar.placeQuery('Paris, Texas.'), 'Paris, Texas.');
  assert.equal(omnibar.placeQuery('go to Paris, noir'), 'paris');
  assert.equal(omnibar.placeQuery('turn on radio in tokyo'), 'tokyo');
  assert.equal(omnibar.placeQuery('Sachsenhausen'), 'Sachsenhausen');
});

// The wording people use reaches each feature's own walk, and Enter starts
// it.
const GUIDE_PHRASES = [
  ['how do i change the map style', 'styles'],
  ['how to change the visual style', 'styles'],
  ['show me how to use night vision', 'styles'],
  ['how do i turn on the hud', 'hud'],
  ['how do i hide the hud', 'hud'],
  ['how do i tilt', 'tilt'],
  ['how do i tilt the map', 'tilt'],
  ['how to tilt the camera', 'tilt'],
  ['how to share this view', 'share'],
  ['how do i share a link', 'share'],
  ['how do i reset', 'globe'],
  ['how do i get back to the globe', 'globe'],
  ['how do i see the whole globe', 'globe'],
  ['how do i point north', 'north'],
  ['how do i use the compass', 'north'],
  ['how do i clear all layers', 'clear'],
  ['how to turn off all layers', 'clear'],
  ['how do i change the map', 'map-source'],
  ['how do i switch to openstreetmap', 'map-source'],
  ['how to measure distance', 'draw'],
  ['how do i draw', 'draw'],
  ['how do i draw a line', 'draw'],
  ['how do i measure an area', 'draw'],
  ['how do i search layers', 'find-layer'],
  ['how do i change language', 'preferences'],
];
for (const [text, feature] of GUIDE_PHRASES)
  test(`${JSON.stringify(text)} starts the ${feature} walk`, () => {
    const { rows, defaultIndex } = createOmnibar({ layers: layers() }).rows(
      text,
    );
    assert.equal(rows[defaultIndex]?.kind, 'guide', text);
    assert.equal(rows[defaultIndex].guide.feature, feature, text);
  });

test('a layer named in full leads a feature topic its words also hold', () => {
  const all = createOmnibar({
    layers: [
      ...layers(),
      { id: 'recent-imagery', name: 'Recent Imagery', enabled: false },
      { id: 'weather-lightning', name: 'Lightning density', enabled: false },
    ],
  });
  for (const [text, id] of [
    ['how do I see recent imagery', 'recent-imagery'],
    ['how do I see lightning density', 'weather-lightning'],
  ]) {
    const { rows, defaultIndex } = all.rows(text);
    assert.equal(rows[defaultIndex].guide.layer?.id, id, text);
  }
  // The Context panel's walk stays first beside a layer named Global
  // Context.
  const context = createOmnibar({
    layers: [
      { id: 'military-awareness', name: 'Global Context', enabled: false },
    ],
  }).rows('how do I open global context');
  assert.equal(context.rows[context.defaultIndex].guide.feature, 'context');
});

test("a line naming a layer still starts that layer's walk", () => {
  const { rows, defaultIndex } = createOmnibar({ layers: layers() }).rows(
    'how to turn on flights',
  );
  assert.equal(rows[defaultIndex].guide.layer.id, 'flights');
});

test('every feature the words name has a walk', async () => {
  const { FEATURE_GUIDES } = await import('./omnibarGuide.js');
  const omnibar = createOmnibar({ layers: layers() });
  for (const [text] of GUIDE_PHRASES) {
    const { rows, defaultIndex } = omnibar.rows(text);
    const feature = rows[defaultIndex].guide.feature;
    assert.equal(typeof FEATURE_GUIDES[feature], 'function', feature);
  }
});

test('the line is normalised once, in one place', () => {
  assert.equal(normalizeLine('  Show   flights.  '), 'Show flights');
  // "please" goes only around a request; in a name it stays.
  assert.equal(readLine('please, north up!'), 'north up');
  assert.equal(readLine('please show flights'), 'show flights');
  assert.equal(readLine('Please Touch Museum'), 'Please Touch Museum');
  assert.equal(readLine('Kindly Lane'), 'Kindly Lane');
  assert.equal(readLine('Pretty Please'), 'Pretty Please');
  assert.equal(normalizeLine('please, north up!'), 'please, north up');
  assert.equal(normalizeLine('what’s here'), "what's here");
  assert.equal(normalizeLine('東京？'), '東京?');
  assert.equal(normalizeLine('Ｔｏｋｙｏ'), 'Tokyo');
  assert.equal(normalizeLine('Washington D.C.'), 'Washington D.C.');
  assert.equal(normalizeLine('St. Louis.'), 'St. Louis');
  assert.equal(normalizeLine('please'), 'please');
});

test('the rows the parser and the Enter rule agree on come from one place', () => {
  // A command named exactly is the default; one merely begun only follows.
  const omnibar = createOmnibar({ layers: layers() });
  assert.equal(outcome('North up'), 'camera(northUp)');
  assert.equal(outcome('> North up'), 'camera(northUp)');
  const begun = omnibar.rows('> nort');
  assert.equal(begun.defaultIndex, -1);
  assert.equal(begun.rows[0].command, 'north');
  // A Photon place counts for the credit.
  const { rows } = omnibar.rows('Shibuya', {
    places: [
      {
        name: 'Shibuya',
        detail: 'Tokyo, Japan',
        latitude: 35.66,
        longitude: 139.7,
      },
    ],
  });
  assert.equal(rows[0].source, 'photon');
});

test('coordinates named as the place are flown to, never refused or looked up', () => {
  const omnibar = createOmnibar({ layers: layers() });
  for (const text of [
    'go to 30.27, -97.74',
    'go to 48.85 2.35',
    'go to 14R PU 2090 4906',
  ]) {
    const { rows, defaultIndex } = omnibar.rows(text);
    assert.equal(rows[defaultIndex]?.kind, 'place', text);
    assert.match(rows[defaultIndex].label, /°[NS] .*°[EW]/, text);
    assert.equal(omnibar.placeQuery(text), null, text);
  }
  const { rows, defaultIndex } = omnibar.rows(
    'show flights near 30.27, -97.74',
  );
  assert.equal(rows[defaultIndex].kind, 'plan');
  assert.equal(omnibar.placeQuery('show flights near 30.27, -97.74'), null);
  assert.equal(omnibar.placeQuery('go to ,'), null);
});

test('only a layer in or near a place is counted, never a name', () => {
  const omnibar = createOmnibar({
    layers: [...layers(), { id: 'ships', name: 'Ships', enabled: false }],
  });
  assert.ok(omnibar.countRequest('flights over Texas'));
  assert.ok(omnibar.countRequest('quakes above M5 in Japan'));
  for (const text of [
    'Ship Bottom',
    'Radio City Music Hall',
    'radio settings',
    'show me how to turn off flights',
  ])
    assert.equal(omnibar.countRequest(text), null, text);
});

test('a place named Left or Right is no panel to close', () => {
  const omnibar = createOmnibar({ layers: layers(['flights']) });
  const { rows, defaultIndex } = omnibar.rows(
    'hide flights near Left Bank, Paris',
  );
  assert.equal(rows[defaultIndex].kind, 'plan');
  assert.ok(rows[defaultIndex].steps.every((step) => step.kind !== 'panel'));
  for (const text of ['hide the left panel', 'close right side']) {
    const read = omnibar.rows(text);
    assert.ok(
      read.rows[read.defaultIndex].steps.some((step) => step.kind === 'panel'),
      text,
    );
  }
});

test('the place service gets the whole place, however it is asked', () => {
  const omnibar = createOmnibar({ layers: layers() });
  assert.equal(
    omnibar.placeQuery('flights near Trinidad and Tobago'),
    'trinidad and tobago',
  );
  assert.equal(
    omnibar.placeQuery('take me to New York City NY'),
    'New York City NY',
  );
  // A signed longitude or a semicolon stays inside the coordinates.
  for (const text of [
    'show flights near 30.27, +97.74',
    'go to 30.27; -97.74',
  ]) {
    const { rows, defaultIndex } = omnibar.rows(text);
    assert.ok(defaultIndex >= 0, text);
    assert.equal(omnibar.placeQuery(text), null, text);
    assert.notEqual(rows[defaultIndex].kind, 'none', text);
  }
});

test('several switches in one line are one plan', () => {
  const omnibar = createOmnibar({ layers: layers(['flights']) });
  for (const text of ['hide flights, show radio', 'hide flights; show radio']) {
    const { rows, defaultIndex } = omnibar.rows(text);
    assert.equal(rows[defaultIndex].kind, 'plan', text);
  }
});

test('a place named with "and" stays whole, and a place keeps how it was typed', () => {
  const omnibar = createOmnibar({
    layers: [{ id: 'flights', name: 'Live Flights', enabled: false }],
  });
  const first = (text) => omnibar.rows(text, { places: [] }).rows[0];
  const plan = first('flights near Trinidad and Tobago');
  assert.equal(plan.kind, 'plan');
  assert.equal(plan.steps[0].place, 'trinidad and tobago');
  assert.equal(
    first('flights near Bosnia & Herzegovina').steps[0].place,
    'bosnia and herzegovina',
  );
  assert.equal(
    first('flights near Saint Vincent and the Grenadines').steps[0].place,
    'saint vincent and the grenadines',
  );
  // Two places joined by "and" are still two.
  assert.equal(
    first('flights near Austin and Dallas').steps[0].place,
    'austin',
  );
  // "İstanbul" is searched without a stray combining dot, and labelled as typed.
  const istanbul = first('show flights in İstanbul');
  assert.equal(istanbul.steps[0].place, 'istanbul');
  assert.match(istanbul.label, /^İstanbul /);
  assert.equal(first('iPhone store').label, 'Go to iPhone store');
});

test('"everything except" keeps the layers named and switches off the rest', () => {
  const omnibar = createOmnibar({
    layers: layers(['flights', 'radio', 'cctv']),
  });
  const first = (text) => omnibar.rows(text, { places: [] }).rows[0];
  for (const text of [
    'hide everything except flights',
    'turn off all but live flights',
    'clear everything other than flights',
  ]) {
    const plan = first(text);
    assert.equal(plan.kind, 'plan', text);
    assert.deepEqual(
      plan.steps.map(stepOutcome),
      ['layer(radio,off)', 'layer(cctv,off)'],
      text,
    );
  }
  assert.deepEqual(
    first('hide everything except flights and the cctv').steps.map(stepOutcome),
    ['layer(radio,off)'],
  );
  // Enter runs it: the line asked for it in so many words.
  assert.equal(
    outcome('hide everything except flights', { on: ['flights', 'radio'] }),
    'layer(radio,off)',
  );
  // A layer to keep that is not read switches nothing off.
  const unread = omnibar.rows('hide everything except flights and the fog', {
    places: [],
  });
  assert.deepEqual(
    unread.rows.map((row) => row.kind),
    ['ask'],
  );
  assert.equal(unread.defaultIndex, -1);
  const alone = createOmnibar({ layers: layers(['flights']) });
  assert.equal(
    alone.rows('hide everything except flights').rows[0].kind,
    'none',
  );
  // Naming no layer to keep is not this reading.
  assert.notEqual(first('hide everything except the coast').kind, 'plan');
});

test('"from the map" and a doubled verb do not change the request', () => {
  assert.equal(
    outcome('remove flights from the map', { on: ['flights'] }),
    'layer(flights,off)',
  );
  assert.equal(
    outcome('hide flights off the globe', { on: ['flights'] }),
    'layer(flights,off)',
  );
  assert.equal(normalizeLine('show show flights'), 'show flights');
  assert.equal(normalizeLine('turn off turn off flights'), 'turn off flights');
});

test('a grid reference after "near" is the place', () => {
  const omnibar = createOmnibar({ layers: layers() });
  const plan = omnibar.rows('flights near 14R PU 2090 4906', { places: [] })
    .rows[0];
  assert.equal(plan.kind, 'plan');
  assert.equal(plan.steps[0].kind, 'place');
  assert.match(plan.steps[0].place, /^14R PU 2090 4906$/i);
});

test('a keyword that begins a name offers no plan to the rest of it', () => {
  const omnibar = createOmnibar({ layers: layers() });
  for (const text of ['Radio City', 'Traffic Island', 'radio island']) {
    const { rows } = omnibar.rows(text, { places: [] });
    assert.equal(rows[0].kind, 'place', text);
    assert.ok(!rows.some((row) => row.kind === 'plan'), text);
    assert.ok(
      rows.some((row) => row.kind === 'layer'),
      text,
    );
  }
  // A keyword after the place, or before a place that is no name's
  // fragment, still offers its plan.
  for (const text of [
    'tokyo traffic',
    'earthquakes japan',
    'radio London',
    'traffic city hall',
    'traffic county cork',
    'earthquakes valley forge',
    'traffic road to hana',
  ]) {
    const { rows } = omnibar.rows(text, { places: [] });
    assert.ok(
      rows.some((row) => row.kind === 'plan'),
      text,
    );
  }
});

test('"except" keeps a layer and the one it shows through together', () => {
  const omnibar = createOmnibar({
    layers: [
      { id: 'flights', name: 'Live Flights', enabled: true },
      { id: 'satellites', name: 'Satellites', enabled: true },
      { id: 'rocket-launches', name: 'Space Missions', enabled: true },
    ],
  });
  for (const text of [
    'hide everything except space missions',
    'hide everything except satellites',
  ])
    assert.deepEqual(
      omnibar.rows(text, { places: [] }).rows[0].steps.map(stepOutcome),
      ['layer(flights,off)'],
      text,
    );
});

test('"except" leaves Satellites to switch off with Space Missions off', () => {
  const omnibar = createOmnibar({
    layers: [
      { id: 'flights', name: 'Live Flights', enabled: true },
      { id: 'satellites', name: 'Satellites', enabled: true },
      { id: 'rocket-launches', name: 'Space Missions', enabled: false },
    ],
  });
  assert.deepEqual(
    omnibar
      .rows('hide everything except space missions', { places: [] })
      .rows[0].steps.map(stepOutcome),
    ['layer(flights,off)', 'layer(satellites,off)'],
  );
  for (const text of [
    'hide everything except flights from the map',
    'clear everything except flights from the map',
    'please clear everything except flights from the map',
    'hide everything except flights from the map, please',
  ])
    assert.deepEqual(
      omnibar.rows(text, { places: [] }).rows[0].steps.map(stepOutcome),
      ['layer(satellites,off)'],
      text,
    );
  // "clear" takes the ending off only for the whole map: "clear flights
  // from the map" never offers to turn Flights on.
  for (const text of [
    'clear flights from the map',
    'clear all flights from the map',
    'clear all flights except ships from the map',
  ])
    assert.ok(
      !omnibar
        .rows(text, { places: [] })
        .rows.some((row) =>
          (row.steps || []).some(
            (step) => step.kind === 'layer' && step.enabled,
          ),
        ),
    );
  // After "show" the ending is part of what is asked.
  assert.equal(
    omnibar.rows('show me the view from the map', { places: [] }).defaultIndex,
    -1,
  );
  // The whole map cleared "from the map" is the same plan, not a place.
  for (const text of [
    'hide everything from the map',
    'remove all layers from the map',
    'clear the layers from the map',
  ]) {
    const { rows } = omnibar.rows(text, { places: [] });
    assert.equal(rows[0].kind, 'plan', text);
    assert.ok(!rows.some((row) => row.kind === 'place'), text);
  }
});

test('"turn off the screen" is no layer switch and no place', () => {
  for (const text of ['turn off the screen', 'switch off the map'])
    assert.equal(outcome(text, { on: ['flights'] }), 'nothing', text);
});

test('a place after a compound country is another place', () => {
  const omnibar = createOmnibar({ layers: layers() });
  const places = (text) =>
    omnibar
      .rows(text, { places: [] })
      .rows.filter((row) => row.kind === 'place')
      .map((row) => row.place.toLowerCase());
  assert.deepEqual(places('flights near trinidad and tobago and barbados'), [
    'trinidad and tobago',
    'barbados',
  ]);
  assert.deepEqual(places('flights near Paris and Trinidad and Tobago'), [
    'paris',
    'trinidad and tobago',
  ]);
});

test('a kind of place written before its name keeps the plan', () => {
  const omnibar = createOmnibar({ layers: layers() });
  for (const text of [
    'earthquakes lake tahoe',
    'earthquakes mount fuji',
    'traffic tower bridge',
  ]) {
    const { rows } = omnibar.rows(text, { places: [] });
    assert.ok(
      rows.some((row) => row.kind === 'plan'),
      text,
    );
  }
});
