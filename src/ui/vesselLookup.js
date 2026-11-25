// Ships found by a host's entity lookup (the `entityLookup` option of
// createApplicationControls, src/app/controls.js): the answers the Omnibar
// shows as rows, and showing one picked there: Vessels switched on as a click
// would, the camera centred on the ship once, and the ship selected as a click
// on it selects it (its card in Context), never followed.

/** The layer looked-up ships are shown in. */
export const VESSEL_LAYER_ID = 'ais-live-vessels';
/** The most ships a lookup offers. */
export const MAX_VESSEL_MATCHES = 5;
/** How long a picked ship may take to arrive in the layer, in ms. */
export const VESSEL_ARRIVAL_MS = 20_000;

/**
 * A lookup's answer as the Omnibar offers it: ships only, each with an id
 * (its MMSI) and a position, once each, at most MAX_VESSEL_MATCHES.
 * @param {unknown} answer What `entityLookup` resolved with.
 * @returns {Array<{kind: 'vessel', id: string, name: ?string, imo: ?string, callsign: ?string, lat: number, lon: number}>}
 */
export function vesselMatches(answer) {
  if (!Array.isArray(answer)) return [];
  const seen = new Set();
  const matches = [];
  for (const item of answer) {
    if (item?.kind !== 'vessel') continue;
    const id = String(item.id ?? '').trim();
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (
      !id ||
      seen.has(id) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      continue;
    seen.add(id);
    const text = (value) => String(value ?? '').trim() || null;
    matches.push({
      kind: 'vessel',
      id,
      name: text(item.name),
      imo: text(item.imo),
      callsign: text(item.callsign),
      lat,
      lon,
    });
    if (matches.length === MAX_VESSEL_MATCHES) break;
  }
  return matches;
}

/** The loaded ship with this MMSI, as the vessels layer describes it, or null. */
function loadedVessel(dataManager, mmsi) {
  try {
    const found = dataManager?.layers
      ?.get?.(VESSEL_LAYER_ID)
      ?.module?.findByQuery?.(mmsi);
    return found && String(found.mmsi) === mmsi ? found : null;
  } catch {
    return null;
  }
}

/**
 * The loaded ship with this MMSI once the vessels layer has it: now, or after
 * one of its updates, within `timeoutMs`. Null when it never arrives, the
 * layer goes off, or `signal` aborts.
 */
export function waitForVessel(
  dataManager,
  mmsi,
  { signal = null, timeoutMs = VESSEL_ARRIVAL_MS } = {},
) {
  const now = loadedVessel(dataManager, mmsi);
  if (now || signal?.aborted) return Promise.resolve(now);
  if (typeof dataManager?.subscribeActivity !== 'function')
    return Promise.resolve(null);
  return new Promise((resolve) => {
    let off = null;
    const timer = setTimeout(() => done(null), timeoutMs);
    const onAbort = () => done(null);
    function done(value) {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      off?.();
      off = null;
      resolve(value);
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
    off = dataManager.subscribeActivity((change) => {
      if (!dataManager.isEnabled?.(VESSEL_LAYER_ID)) return done(null);
      if (change?.layerId && change.layerId !== VESSEL_LAYER_ID) return;
      const found = loadedVessel(dataManager, mmsi);
      if (found) done(found);
    });
  });
}

/**
 * Show a looked-up ship: switch Vessels on if it is off (`setLayer`, as a
 * click would), centre the camera on the ship's position once (`centre`),
 * wait for the ship to arrive in the layer and select it there as a click
 * does. The camera is never handed to the ship.
 * @param {object} options
 * @param {{id: string, lat: number, lon: number}} options.vessel A match.
 * @param {object} options.dataManager The layers.
 * @param {(id: string, enabled: boolean) => Promise<boolean>|boolean} options.setLayer
 * @param {(lat: number, lon: number) => unknown} options.centre
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ok: boolean, id?: string, reason?: string}>}
 */
export async function showVessel({
  vessel,
  dataManager,
  setLayer,
  centre,
  signal = null,
  timeoutMs = VESSEL_ARRIVAL_MS,
}) {
  const name = vessel.name || `MMSI ${vessel.id}`;
  if (!dataManager?.layers?.has?.(VESSEL_LAYER_ID))
    return { ok: false, reason: 'no-layer', say: 'There is no Vessels layer.' };
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  if (!dataManager.isEnabled?.(VESSEL_LAYER_ID)) {
    const switched = await setLayer(VESSEL_LAYER_ID, true);
    if (signal?.aborted) return { ok: false, reason: 'cancelled' };
    if (switched === false || !dataManager.isEnabled?.(VESSEL_LAYER_ID))
      return {
        ok: false,
        reason: 'layer-off',
        say: 'Vessels could not be switched on.',
      };
  }
  // Once, at the position the lookup gave: the layer loads around the view.
  centre(vessel.lat, vessel.lon);
  const found = await waitForVessel(dataManager, vessel.id, {
    signal,
    timeoutMs,
  });
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  // The camera is at its last reported position, but the live feed has not
  // shown it there: said as such, not as a failure to act.
  if (!found)
    return {
      ok: false,
      reason: 'not-loaded',
      say: `${name} has not shown up in the live vessel feed here yet. It may have stopped reporting.`,
    };
  const module = dataManager.layers.get(VESSEL_LAYER_ID)?.module;
  const selected = Boolean(module?.selectById?.(found.id ?? found.mmsi));
  return selected
    ? { ok: true, id: String(found.id ?? found.mmsi) }
    : {
        ok: false,
        reason: 'not-selected',
        say: `${name} could not be selected.`,
      };
}
