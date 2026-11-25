/**
 * Airlines' two-character IATA designators and the three-letter ICAO
 * designators their callsigns are flown under, so a flight number as tickets
 * and departure boards write it ("JL58", "BA15", "UA 123") finds the
 * aircraft that transponder feeds name by callsign (JAL58, BAW15, UAL123).
 *
 * The pairs are the airlines' published designators (IATA airline codes and
 * ICAO Doc 8585), written out by hand for large passenger and cargo airlines
 * that fly under them today. Each IATA designator names one ICAO designator:
 * an airline whose flights also fly under a regional or charter arm's
 * designator is listed with its main one only, so those flights are found by
 * callsign, not flight number. A designator no airline flies under any more
 * is left out.
 */
export const IATA_TO_ICAO_AIRLINE = Object.freeze({
  // North America
  AA: 'AAL',
  UA: 'UAL',
  DL: 'DAL',
  WN: 'SWA',
  B6: 'JBU',
  AS: 'ASA',
  NK: 'NKS',
  F9: 'FFT',
  G4: 'AAY',
  HA: 'HAL',
  SY: 'SCX',
  OO: 'SKW',
  YX: 'RPA',
  '9E': 'EDV',
  MQ: 'ENY',
  OH: 'JIA',
  ZW: 'AWI',
  YV: 'ASH',
  QX: 'QXE',
  G7: 'GJS',
  C5: 'UCA',
  AC: 'ACA',
  WS: 'WJA',
  PD: 'POE',
  TS: 'TSC',
  AM: 'AMX',
  Y4: 'VOI',
  VB: 'VIV',
  '5X': 'UPS',
  FX: 'FDX',
  '5Y': 'GTI',
  K4: 'CKS',
  PO: 'PAC',
  // Central and South America
  CM: 'CMP',
  AV: 'AVA',
  LA: 'LAN',
  JJ: 'TAM',
  G3: 'GLO',
  AD: 'AZU',
  AR: 'ARG',
  H2: 'SKU',
  // Europe
  BA: 'BAW',
  VS: 'VIR',
  U2: 'EZY',
  FR: 'RYR',
  W6: 'WZZ',
  LH: 'DLH',
  LX: 'SWR',
  OS: 'AUA',
  SN: 'BEL',
  EW: 'EWG',
  EN: 'DLA',
  AF: 'AFR',
  KL: 'KLM',
  IB: 'IBE',
  VY: 'VLG',
  UX: 'AEA',
  TP: 'TAP',
  AZ: 'ITY',
  SK: 'SAS',
  AY: 'FIN',
  EI: 'EIN',
  LO: 'LOT',
  A3: 'AEE',
  TK: 'THY',
  PC: 'PGT',
  VF: 'TKJ',
  XQ: 'SXS',
  BT: 'BTI',
  OU: 'CTN',
  LG: 'LGL',
  HV: 'TRA',
  DE: 'CFG',
  X3: 'TUI',
  BY: 'TOM',
  LS: 'EXS',
  '4Y': 'OCN',
  WK: 'EDW',
  RO: 'ROT',
  FB: 'LZB',
  B2: 'BRU',
  CV: 'CLX',
  // Middle East, Africa and Central Asia
  LY: 'ELY',
  MS: 'MSR',
  ET: 'ETH',
  KQ: 'KQA',
  SA: 'SAA',
  AT: 'RAM',
  EK: 'UAE',
  EY: 'ETD',
  QR: 'QTR',
  GF: 'GFA',
  WY: 'OMA',
  SV: 'SVA',
  XY: 'KNE',
  RJ: 'RJA',
  KU: 'KAC',
  ME: 'MEA',
  FZ: 'FDB',
  G9: 'ABY',
  J9: 'JZR',
  KC: 'KZR',
  HY: 'UZB',
  J2: 'AHY',
  // South Asia
  AI: 'AIC',
  '6E': 'IGO',
  SG: 'SEJ',
  IX: 'AXB',
  QP: 'AKJ',
  UL: 'ALK',
  BG: 'BBC',
  // East and Southeast Asia
  SQ: 'SIA',
  TR: 'TGW',
  MH: 'MAS',
  AK: 'AXM',
  D7: 'XAX',
  TG: 'THA',
  FD: 'AIQ',
  PG: 'BKP',
  VN: 'HVN',
  VJ: 'VJC',
  GA: 'GIA',
  QZ: 'AWQ',
  PR: 'PAL',
  '5J': 'CEB',
  BI: 'RBA',
  CX: 'CPA',
  UO: 'HKE',
  NX: 'AMU',
  CI: 'CAL',
  BR: 'EVA',
  JX: 'SJX',
  CA: 'CCA',
  MU: 'CES',
  CZ: 'CSN',
  HU: 'CHH',
  '3U': 'CSC',
  ZH: 'CSZ',
  MF: 'CXA',
  FM: 'CSH',
  '9C': 'CQH',
  HO: 'DKH',
  KE: 'KAL',
  OZ: 'AAR',
  '7C': 'JJA',
  LJ: 'JNA',
  TW: 'TWB',
  JL: 'JAL',
  NH: 'ANA',
  MM: 'APJ',
  GK: 'JJP',
  BC: 'SKY',
  NU: 'JTA',
  // Oceania
  QF: 'QFA',
  JQ: 'JST',
  VA: 'VOZ',
  NZ: 'ANZ',
  FJ: 'FJI',
});

/** The ICAO designators in IATA_TO_ICAO_AIRLINE: callsigns airlines fly. */
export const ICAO_AIRLINES = Object.freeze(
  new Set(Object.values(IATA_TO_ICAO_AIRLINE)),
);

const FLIGHT_NUMBER = /^([A-Z0-9]{2})0*(\d{1,4})([A-Z]?)$/;

/**
 * The ICAO callsign a flight number is flown under, or null: "JL58",
 * "JL 058" and "jl58" give JAL58, "U2 1234" gives EZY1234. Only a
 * designator in IATA_TO_ICAO_AIRLINE is read; leading zeros are dropped, as
 * callsigns drop them.
 * @param {string} text
 * @returns {?string}
 */
export function flightNumberCallsign(text) {
  const match = FLIGHT_NUMBER.exec(
    String(text || '')
      .replace(/\s+/g, '')
      .toUpperCase(),
  );
  const icao = match && IATA_TO_ICAO_AIRLINE[match[1]];
  return icao ? `${icao}${match[2]}${match[3]}` : null;
}
