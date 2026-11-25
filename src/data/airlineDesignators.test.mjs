import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IATA_TO_ICAO_AIRLINE,
  flightNumberCallsign,
} from './airlineDesignators.js';

test('a flight number reads as the callsign it is flown under', () => {
  for (const [typed, callsign] of [
    ['JL58', 'JAL58'],
    ['jl58', 'JAL58'],
    ['JL 058', 'JAL58'],
    ['BA15', 'BAW15'],
    ['UA 123', 'UAL123'],
    ['U2 1234', 'EZY1234'],
    ['6E2341', 'IGO2341'],
    ['LH400A', 'DLH400A'],
  ])
    assert.equal(flightNumberCallsign(typed), callsign, typed);
});

test('only a listed designator and a flight number are read', () => {
  for (const typed of ['JAL58', 'ZZ12', 'BA', 'BA12345', 'Tokyo', '', 'A12B2E'])
    assert.equal(flightNumberCallsign(typed), null, typed);
  // Designators whose airlines no longer fly: Compass Airlines (CP), closed
  // in 2020, and Ukraine International (PS), grounded since 2022.
  for (const typed of ['CP1', 'PS5'])
    assert.equal(flightNumberCallsign(typed), null, typed);
});

test('every designator pair has the shape of one', () => {
  const icao = Object.values(IATA_TO_ICAO_AIRLINE);
  for (const [iata, code] of Object.entries(IATA_TO_ICAO_AIRLINE)) {
    assert.match(iata, /^[A-Z0-9]{2}$/, iata);
    assert.match(iata, /[A-Z]/, iata);
    assert.match(code, /^[A-Z]{3}$/, iata);
  }
  // Each airline once: a callsign is never read as two airlines'.
  assert.equal(new Set(icao).size, icao.length);
});
