// A camera or a satellite the search box names, found in its layer with that
// layer switched on as a click would (src/data/aircraftSearch.js
// findSwitchingOn): the Omnibar then selects it and centres it once through
// its layer's pick (src/ui/views/panels/Omnibar.vue).

import { FIRST_DATA_MS, findSwitchingOn } from '../data/aircraftSearch.js';

/**
 * The cameras in the host's lookup answer (src/app/controls.js
 * `entityLookup`), each once, with a position on the globe, in its order.
 * @param {unknown} answer
 * @returns {Array<{id: string, name: ?string, city: ?string, lat: number, lon: number}>}
 */
export function cameraMatches(answer) {
  if (!Array.isArray(answer)) return [];
  const seen = new Set();
  const matches = [];
  const text = (value) => String(value ?? '').trim() || null;
  for (const item of answer) {
    if (item?.kind !== 'camera') continue;
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
    matches.push({
      kind: 'camera',
      id,
      name: text(item.name),
      city: text(item.city),
      lat,
      lon,
    });
  }
  return matches;
}

/** The layer's own record for a query, or null (never throws). */
function findIn(dataManager, layerId, query) {
  if (!dataManager?.isEnabled?.(layerId)) return null;
  const module = dataManager.layers?.get?.(layerId)?.module;
  if (typeof module?.findByQuery !== 'function') return null;
  return module.findByQuery(query) || null;
}

const finite = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Show a camera the search found (loaded or from the host's lookup): CCTV
 * switched on if it is off, and the camera looked up in its list. CCTV
 * switched on here goes back off when the camera is not in the list, the
 * list fails to load or the search is cancelled.
 * @param {object} options
 * @param {{id: string, name?: ?string, lat?: number, lon?: number}} options.camera
 * @param {object} options.dataManager The layers.
 * @param {(id: string, enabled: boolean) => unknown} options.setLayer Switch a layer.
 * @param {AbortSignal} [options.signal] Aborts when the request is superseded.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ok: true, identity: object} | {ok: false, reason: string, say?: string}>}
 */
export async function showCamera({
  camera,
  dataManager,
  setLayer,
  signal = null,
  timeoutMs = FIRST_DATA_MS,
}) {
  const id = String(camera?.id ?? '');
  const name = String(camera?.name || id);
  const result = await findSwitchingOn({
    layerId: 'cctv',
    find: () => (id ? findIn(dataManager, 'cctv', id) : null),
    dataManager,
    setLayer,
    signal,
    timeoutMs,
    missing: `${name} is not in the camera list right now.`,
    failed:
      'The camera list did not load, so this camera could not be shown. Please try again.',
    refused: 'CCTV could not be switched on.',
  });
  if (!result.ok) return result;
  const found = result.found;
  return {
    ok: true,
    identity: {
      layerId: 'cctv',
      id,
      label: found.name || name,
      lat: finite(found.latitude) ?? finite(camera.lat),
      lon: finite(found.longitude) ?? finite(camera.lon),
    },
  };
}

/**
 * Find a satellite by name or NORAD number in the Satellites layer's
 * catalog, with the layer switched on if it is off; switched back off when
 * nothing is found, the catalog fails to load or the search is cancelled.
 * @param {object} options
 * @param {string} options.query A name ("ISS") or a NORAD number ("25544").
 * @param {object} options.dataManager The layers.
 * @param {(id: string, enabled: boolean) => unknown} options.setLayer Switch a layer.
 * @param {AbortSignal} [options.signal] Aborts when the request is superseded.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ok: true, identity: object} | {ok: false, reason: string, say?: string}>}
 */
export async function findSatellite({
  query,
  dataManager,
  setLayer,
  signal = null,
  timeoutMs = FIRST_DATA_MS,
}) {
  const wanted = String(query ?? '').trim();
  const result = await findSwitchingOn({
    layerId: 'satellites',
    find: () => (wanted ? findIn(dataManager, 'satellites', wanted) : null),
    dataManager,
    setLayer,
    signal,
    timeoutMs,
    missing: `No satellite in the catalog is ${wanted}.`,
    failed:
      'The satellite catalog did not load, so this satellite could not be looked for. Please try again.',
    refused: 'Satellites could not be switched on.',
  });
  if (!result.ok) return result;
  const found = result.found;
  return {
    ok: true,
    identity: {
      layerId: 'satellites',
      id: String(found.noradId),
      label: String(found.name || found.noradId).trim(),
      lat: finite(found.latitude),
      lon: finite(found.longitude),
    },
  };
}
