import type { ScheduleBlob, RouteWire, StationInfo, StoredArrivalEntry } from "../types.js";
import type { TripPrediction } from "./tripupdate.js";

const DENVER_TZ = "America/Denver";
const MAX_PER_KEY = 6;
const CUTOFF_SECONDS = 5 * 60;

export const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Internal baseline shape — never serialized directly. */
export interface BaselineKeyEntry {
  route_color: string | null;
  headsign: string;
  /** Sorted by e ascending — full set, NOT pre-sliced to MAX_PER_KEY */
  arrivals: StoredArrivalEntry[];
  /** Parallel to arrivals, holds trip_id per entry (off-wire) */
  tripIds: string[];
  /** Mutable: index of first not-yet-past entry. Advanced by applyLive each tick. */
  startIdx: number;
}

export interface BaselineSlot {
  key: string;
  /** Absolute index in BaselineKeyEntry.arrivals (not relative to startIdx) */
  idx: number;
}

export interface Baseline {
  generated_at: number;
  stations: Record<string, StationInfo>;
  data: Record<string, BaselineKeyEntry>;
  byTrip: Map<string, BaselineSlot[]>;
  serializedStations: string;
  serializedRoutes: string;
  serializedKeyNames: Map<string, string>;
  serializedValues: Map<string, { str: string; atIdx: number }>;
  allowedTripIds: Set<string>;
  stopIdByKey: Map<string, string>;
}

export function buildBaseline(schedule: ScheduleBlob, nowOverride?: number): Baseline {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const cutoff = now - CUTOFF_SECONDS;
  const data: Record<string, BaselineKeyEntry> = {};
  const byTrip = new Map<string, BaselineSlot[]>();

  for (const [key, keyEntry] of Object.entries(schedule.by_key)) {
    const [routeId] = key.split(":");
    const routeInfo = schedule.routes[routeId];
    const arrivals: StoredArrivalEntry[] = [];
    const tripIds: string[] = [];

    for (const entry of keyEntry.entries) {
      if (entry.scheduled_time < cutoff) continue;
      arrivals.push({
        e: entry.scheduled_time,
        t: fmt.format(new Date(entry.scheduled_time * 1000)),
      });
      tripIds.push(entry.trip_id);
    }

    if (arrivals.length === 0) continue;

    const order = arrivals.map((_, i) => i).sort((a, b) => arrivals[a].e - arrivals[b].e);
    const sortedArr = order.map(i => arrivals[i]);
    const sortedTrips = order.map(i => tripIds[i]);

    data[key] = {
      route_color: routeInfo?.color ?? null,
      headsign: keyEntry.entries[0]?.headsign ?? "",
      arrivals: sortedArr,
      tripIds: sortedTrips,
      startIdx: 0,
    };

    for (let idx = 0; idx < sortedTrips.length; idx++) {
      const tripId = sortedTrips[idx];
      let list = byTrip.get(tripId);
      if (!list) { list = []; byTrip.set(tripId, list); }
      list.push({ key, idx });
    }
  }

  // Build top-level routes wire object: color + headsign per direction
  const routeWires: Record<string, RouteWire> = {};
  for (const key in data) {
    const [routeId, , dir] = key.split(":");
    if (!routeWires[routeId]) routeWires[routeId] = { c: data[key].route_color, h: {} };
    if (!routeWires[routeId].h[dir]) routeWires[routeId].h[dir] = data[key].headsign;
  }

  const serializedStations = JSON.stringify(schedule.stations ?? {});
  const serializedRoutes = JSON.stringify(routeWires);
  const serializedKeyNames = new Map<string, string>();
  const stopIdByKey = new Map<string, string>();
  for (const key in data) {
    serializedKeyNames.set(key, JSON.stringify(key));
    stopIdByKey.set(key, key.split(":")[1]);
  }

  return {
    generated_at: schedule.generated_at,
    stations: schedule.stations ?? {},
    data,
    byTrip,
    serializedStations,
    serializedRoutes,
    serializedKeyNames,
    serializedValues: new Map(),
    allowedTripIds: new Set(byTrip.keys()),
    stopIdByKey,
  };
}

/**
 * Build a JSON string from baseline + live overrides.
 * Mutates baseline.data[key].startIdx to slide past stale entries.
 * Uses pre-serialized strings for clean keys — only dirty keys are re-serialized.
 */
export function applyLive(
  baseline: Baseline,
  liveByTripId: Map<string, TripPrediction>,
  nowOverride?: number,
): string {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const cutoff = now - CUTOFF_SECONDS;

  const dirtyKeys = new Set<string>();
  for (const tripId of liveByTripId.keys()) {
    const slots = baseline.byTrip.get(tripId);
    if (!slots) continue;
    for (const { key } of slots) dirtyKeys.add(key);
  }

  const dataParts: string[] = [];

  for (const key in baseline.data) {
    const baseEntry = baseline.data[key];

    while (
      baseEntry.startIdx < baseEntry.arrivals.length &&
      baseEntry.arrivals[baseEntry.startIdx].e < cutoff
    ) {
      baseEntry.startIdx++;
    }
    if (baseEntry.startIdx >= baseEntry.arrivals.length) continue;

    const end = Math.min(baseEntry.startIdx + MAX_PER_KEY, baseEntry.arrivals.length);
    const qkey = baseline.serializedKeyNames.get(key)!;

    if (!dirtyKeys.has(key)) {
      let cached = baseline.serializedValues.get(key);
      if (!cached || cached.atIdx !== baseEntry.startIdx) {
        const str = JSON.stringify({ a: baseEntry.arrivals.slice(baseEntry.startIdx, end) });
        cached = { str, atIdx: baseEntry.startIdx };
        baseline.serializedValues.set(key, cached);
      }
      dataParts.push(`${qkey}:${cached.str}`);
      continue;
    }

    const stopId = baseline.stopIdByKey.get(key)!;
    const patched: StoredArrivalEntry[] = [];
    for (let i = baseEntry.startIdx; i < end; i++) {
      const live = liveByTripId.get(baseEntry.tripIds[i]);
      patched.push(patchEntry(baseEntry.arrivals[i], stopId, live));
    }

    const filtered = patched
      .filter(a => a.e >= cutoff)
      .sort((a, b) => a.e - b.e);

    if (filtered.length > 0) {
      dataParts.push(`${qkey}:${JSON.stringify({ a: filtered })}`);
    }
  }

  return `{"generated_at":${now},"stations":${baseline.serializedStations},"routes":${baseline.serializedRoutes},"data":{${dataParts.join(",")}}}`;
}

function patchEntry(
  base: StoredArrivalEntry,
  stopId: string,
  live: TripPrediction | undefined,
): StoredArrivalEntry {
  if (!live) return base;
  if (live.tripRelationship === 3) return { ...base, l: "Canceled" };

  const stopPred = live.stops.get(stopId);
  if (stopPred?.stopRelationship === 1) return { ...base, l: "Skipped" };

  if (stopPred?.time != null) {
    const predicted = typeof stopPred.time === "number" ? stopPred.time : Number(stopPred.time);
    const delaySeconds = predicted - base.e;
    return {
      ...base,
      e: predicted,
      t: fmt.format(new Date(predicted * 1000)),
      l: live.tripRelationship === 1 ? "Added" : buildLiveLabel(delaySeconds),
    };
  }

  return base;
}

function buildLiveLabel(delaySeconds: number): string {
  if (Math.abs(delaySeconds) <= 60) return "On time";
  const mins = Math.round(Math.abs(delaySeconds) / 60);
  return delaySeconds > 0 ? `Delayed ${mins} min` : `Early ${mins} min`;
}
