// An aircraft found by name in the live feed: by its transponder code,
// callsign or registration exactly, or by a flight number read as the
// callsign it is flown under ("JL58" is JAL58). The search box picks it this
// way (src/ui/views/panels/Omnibar.vue), and so does tracking by name
// (track_entity in src/voice/gevActions.js).

import { flightNumberCallsign } from './airlineDesignators.js';
import { CONTACT_MATCH_TIER, rankContactMatch } from './contactMatch.js';

/** The layers an aircraft is looked for in, in this order. */
export const AIRCRAFT_LAYER_IDS = Object.freeze(['flights', 'military']);
/** How long a layer switched on may take to bring its first data, in ms. */
export const FIRST_DATA_MS = 20_000;

/**
 * Whether a found aircraft is the one asked for by name: its transponder
 * code, callsign or registration exactly, never one that only begins with or
 * holds the query ("JAL58" is not JAL581).
 */
export function namesAircraft(found, query) {
  return (
    rankContactMatch({
      query,
      hex: found?.icao24,
      callsign: found?.callsign,
      registration: found?.registration,
    }) <= CONTACT_MATCH_TIER.REGISTRATION_EXACT
  );
}

/** The names an aircraft is searched by: the query, then its callsign. */
export function aircraftNames(query) {
  const text = String(query || '').trim();
  return [...new Set([text, flightNumberCallsign(text)].filter(Boolean))];
}

/**
 * The first aircraft layer that is on and has an aircraft named exactly by
 * one of `names`, or null.
 * @returns {?{layerId: string, module: object, found: object}}
 */
export function findLoadedAircraft(
  dataManager,
  names,
  layerIds = AIRCRAFT_LAYER_IDS,
) {
  for (const layerId of layerIds) {
    if (!dataManager?.isEnabled?.(layerId)) continue;
    const module = dataManager.layers?.get?.(layerId)?.module;
    if (typeof module?.findByQuery !== 'function') continue;
    for (const name of names) {
      let found = null;
      try {
        found = module.findByQuery(name);
      } catch {
        found = null;
      }
      if (found && namesAircraft(found, name))
        return { layerId, module, found };
    }
  }
  return null;
}

/**
 * A layer's first data after it was switched on: 'ready' once it reports an
 * update, 'failed' when its refresh fails, 'off' when it is switched off,
 * 'cancelled' when `signal` aborts or `isCurrent` turns false, and 'timeout'
 * after `timeoutMs`.
 * @returns {Promise<'ready'|'failed'|'off'|'cancelled'|'timeout'>}
 */
export function waitForLayerFirstData(
  dataManager,
  layerId,
  { signal = null, isCurrent = null, timeoutMs = FIRST_DATA_MS } = {},
) {
  const reported = () => {
    try {
      const stats = dataManager.layers?.get?.(layerId)?.module?.getStats?.();
      return stats?.lastUpdate != null;
    } catch {
      return false;
    }
  };
  const stale = () =>
    signal?.aborted || (typeof isCurrent === 'function' && !isCurrent());
  if (stale()) return Promise.resolve('cancelled');
  if (reported()) return Promise.resolve('ready');
  if (typeof dataManager.subscribeActivity !== 'function')
    return Promise.resolve('timeout');
  return new Promise((resolve) => {
    const offs = [];
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      for (const off of offs) off?.();
      resolve(value);
    };
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    offs.push(() => clearTimeout(timer));
    const onAbort = () => done('cancelled');
    signal?.addEventListener?.('abort', onAbort, { once: true });
    offs.push(() => signal?.removeEventListener?.('abort', onAbort));
    offs.push(
      dataManager.subscribeActivity((change) => {
        if (stale()) return done('cancelled');
        if (!dataManager.isEnabled?.(layerId)) return done('off');
        if (reported()) return done('ready');
        if (change?.type === 'data-updated' && change.layerId === layerId)
          done(reported() ? 'ready' : 'failed');
      }),
    );
    offs.push(
      dataManager.subscribe?.((change) => {
        if (change?.layerId !== layerId) return;
        if (change.type === 'refresh-failed') done('failed');
        else if (change.enabled === false) done('off');
      }),
    );
  });
}

/**
 * Find an aircraft by name for a person who asked for it: in the aircraft
 * layers that are on, else with Flights switched on as a click would and its
 * first data in. Flights switched on here is switched off again when the
 * aircraft is not found, the feed fails or the request is cancelled.
 * @param {object} options
 * @param {string} options.query What was typed, compact ("JAL58", "JL58").
 * @param {object} options.dataManager The layers.
 * @param {(id: string, enabled: boolean) => unknown} options.setLayer Switch a layer.
 * @param {AbortSignal} [options.signal] Aborts when the request is superseded.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ok: true, layerId: string, found: object} | {ok: false, reason: string, say?: string}>}
 */
export async function findAircraft({
  query,
  dataManager,
  setLayer,
  signal = null,
  timeoutMs = FIRST_DATA_MS,
}) {
  const names = aircraftNames(query);
  const shown = names.at(-1)?.toUpperCase() || '';
  const missing = {
    ok: false,
    reason: 'not-found',
    say: `No aircraft in the live feed is ${shown} right now.`,
  };
  if (signal?.aborted) return { ok: false, reason: 'cancelled' };
  const loaded = findLoadedAircraft(dataManager, names);
  if (loaded) return { ok: true, layerId: loaded.layerId, found: loaded.found };
  const flightsOff =
    dataManager?.layers?.has?.('flights') &&
    !dataManager.isEnabled?.('flights');
  if (!flightsOff) {
    // Flights is on: a feed that has not answered yet is waited for; one
    // that failed is not read as "no such aircraft".
    if (!dataManager?.layers?.has?.('flights')) return missing;
    const data = await waitForLayerFirstData(dataManager, 'flights', {
      signal,
      timeoutMs,
    });
    if (data === 'cancelled') return { ok: false, reason: 'cancelled' };
    if (data !== 'ready') return feedFailed();
    const found = findLoadedAircraft(dataManager, names);
    return found
      ? { ok: true, layerId: found.layerId, found: found.found }
      : missing;
  }
  // One deadline for the switch and the first data together: switching a
  // layer on can itself wait for its first update, so neither may outlast
  // the timeout or a superseded request.
  const deadline = deadlineOf(signal, timeoutMs);
  let switched = false;
  // Switched off unawaited: a switch-off never waits for the feed, and a
  // stalled switch-on is undone once it settles.
  const switchBackOff = () => {
    if (!switched) return;
    switched = false;
    if (dataManager.isEnabled?.('flights'))
      Promise.resolve(setLayer('flights', false)).catch(() => {});
  };
  let switching;
  try {
    switching = Promise.resolve(setLayer('flights', true));
  } catch (error) {
    switching = Promise.reject(error);
  }
  // Whatever this search asked for, it switched on.
  switched = true;
  const outcome = await Promise.race([
    switching.then(
      (result) => (result === false ? 'refused' : 'switched'),
      () => 'refused',
    ),
    deadline.promise,
  ]);
  if (outcome === 'cancelled' || outcome === 'timeout') {
    deadline.dispose();
    switchBackOff();
    // A switch that settles later is undone too.
    switching.then(
      () => {
        if (dataManager.isEnabled?.('flights'))
          Promise.resolve(setLayer('flights', false)).catch(() => {});
      },
      () => {},
    );
    return outcome === 'cancelled'
      ? { ok: false, reason: 'cancelled' }
      : feedFailed();
  }
  if (outcome === 'refused' || !dataManager.isEnabled?.('flights')) {
    deadline.dispose();
    switchBackOff();
    return {
      ok: false,
      reason: 'layer-off',
      say: 'Flights could not be switched on.',
    };
  }
  const data = await waitForLayerFirstData(dataManager, 'flights', {
    signal,
    timeoutMs: deadline.remaining(),
  });
  deadline.dispose();
  if (data === 'cancelled' || signal?.aborted) {
    switchBackOff();
    return { ok: false, reason: 'cancelled' };
  }
  if (data !== 'ready') {
    switchBackOff();
    return feedFailed();
  }
  const found = findLoadedAircraft(dataManager, names);
  if (found) return { ok: true, layerId: found.layerId, found: found.found };
  switchBackOff();
  return missing;
}

/**
 * A promise that resolves 'cancelled' when `signal` aborts or 'timeout'
 * after `timeoutMs`, with the time left and a way to stop listening.
 */
function deadlineOf(signal, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let timer = null;
  let onAbort = null;
  const promise = new Promise((resolve) => {
    if (signal?.aborted) return resolve('cancelled');
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
    onAbort = () => resolve('cancelled');
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
  return {
    promise,
    remaining: () => Math.max(0, end - Date.now()),
    dispose() {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener?.('abort', onAbort);
    },
  };
}

function feedFailed() {
  return {
    ok: false,
    reason: 'feed-failed',
    say: 'The flight feed did not answer, so this aircraft could not be looked for. Please try again.',
  };
}
