import type { ScheduleBlob, StationInfo, StoredArrivalEntry } from "../types.js";
import type { TripPrediction } from "./tripupdate.js";
import {
  type BinArrival,
  type StationWire,
  hexToRgb,
  buildArrivalsBin,
  buildStationsBin,
} from "../binary.js";

const DENVER_TZ = "America/Denver";
const CUTOFF_SECONDS = 5 * 60;
const HORIZON_SECONDS = 3 * 60 * 60; // 3 hours

export const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Internal baseline shape — never serialized directly. */
export interface BaselineKeyEntry {
  route_id: string;
  route_short: string;
  route_color: string | null;
  dir: string;
  headsign: string;
  /** Sorted by e ascending — full set */
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
  allowedTripIds: Set<string>;
  stopIdByKey: Map<string, string>;
  slugByStopId: Map<string, string>;
  stationsBin: Uint8Array;
}

export function buildBaseline(schedule: ScheduleBlob, nowOverride?: number): Baseline {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const cutoff = now - CUTOFF_SECONDS;
  const data: Record<string, BaselineKeyEntry> = {};
  const byTrip = new Map<string, BaselineSlot[]>();

  for (const [key, keyEntry] of Object.entries(schedule.by_key)) {
    const [routeId, , dir] = key.split(":");
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
      route_id: routeId,
      route_short: routeInfo?.short_name ?? routeId,
      route_color: routeInfo?.color ?? null,
      dir,
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

  const stopIdByKey = new Map<string, string>();
  const slugByStopId = new Map<string, string>();
  for (const key in data) {
    const stopId = key.split(":")[1];
    stopIdByKey.set(key, stopId);
  }

  const stationEntries: StationWire[] = [];
  for (const [slug, info] of Object.entries(schedule.stations ?? {})) {
    const routesByDir = new Map<string, { r: string, c: string | null, d: string, h: string }>();
    for (const stopId of info.stop_ids) {
      slugByStopId.set(stopId, slug);
      // Find all keys for this stop to build routes list
      for (const key in data) {
        if (key.split(":")[1] === stopId) {
          const entry = data[key];
          const rkey = `${entry.route_short}:${entry.dir}`;
          if (!routesByDir.has(rkey)) {
            routesByDir.set(rkey, {
              r: entry.route_short,
              c: entry.route_color,
              d: entry.dir,
              h: entry.headsign
            });
          }
        }
      }
    }
    stationEntries.push({
      k: slug,
      r: [...routesByDir.values()].sort((a, b) => a.r.localeCompare(b.r) || a.d.localeCompare(b.d))
    });
  }

  const stationsBin = buildStationsBin(stationEntries, schedule.generated_at);

  return {
    generated_at: schedule.generated_at,
    stations: schedule.stations ?? {},
    data,
    byTrip,
    allowedTripIds: new Set(byTrip.keys()),
    stopIdByKey,
    slugByStopId,
    stationsBin,
  };
}

/**
 * Build arrivals/current.bin from baseline + live overrides.
 */
export function applyLive(
  baseline: Baseline,
  liveByTripId: Map<string, TripPrediction>,
  nowOverride?: number,
): Uint8Array {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const cutoff = now - CUTOFF_SECONDS;
  const horizon = now + HORIZON_SECONDS;

  const groupedPatched = new Map<string, Array<BinArrival & { e: number }>>();

  for (const key in baseline.data) {
    const baseEntry = baseline.data[key];
    const stopId = baseline.stopIdByKey.get(key)!;
    const slug = baseline.slugByStopId.get(stopId);
    if (!slug) continue;

    while (
      baseEntry.startIdx < baseEntry.arrivals.length &&
      baseEntry.arrivals[baseEntry.startIdx].e < cutoff
    ) {
      baseEntry.startIdx++;
    }

    const { r, g, b } = hexToRgb(baseEntry.route_color);
    let list = groupedPatched.get(slug);
    if (!list) { list = []; groupedPatched.set(slug, list); }

    const end = baseEntry.arrivals.length;
    for (let i = baseEntry.startIdx; i < end; i++) {
      const live = liveByTripId.get(baseEntry.tripIds[i]);
      const patched = patchEntry(baseEntry.arrivals[i], stopId, live);
      
      if (patched.e < cutoff || patched.e > horizon) continue;

      list.push({
        r, g, b,
        route: baseEntry.route_short,
        dir: baseEntry.dir,
        headsign: baseEntry.headsign,
        time: patched.t,
        label: patched.l ?? "",
        e: patched.e,
      });
    }
  }

  const finalMap = new Map<string, BinArrival[]>();
  for (const [slug, arrivals] of groupedPatched) {
    arrivals.sort((a, b) => a.e - b.e);
    finalMap.set(slug, arrivals.map(({ e, ...rest }) => rest));
  }

  return buildArrivalsBin(finalMap, now);
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
