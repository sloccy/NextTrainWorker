import type { ScheduleBlob, ArrivalsBlob, ArrivalsKeyEntry, StoredArrivalEntry, ArrivalStatus } from "../types.js";
import type { TripPrediction } from "./tripupdate.js";

const DENVER_TZ = "America/Denver";
const MAX_PER_KEY = 6;
const CUTOFF_SECONDS = 5 * 60;
const HORIZON_SECONDS = 3 * 3600;

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function mergeScheduleWithLive(
  schedule: ScheduleBlob,
  liveByTripId: Map<string, TripPrediction>,
  nowOverride?: number,
): ArrivalsBlob {
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const data: Record<string, ArrivalsKeyEntry> = {};

  for (const [key, keyEntry] of Object.entries(schedule.by_key)) {
    const [routeId, stopId] = key.split(":");
    const routeInfo = schedule.routes[routeId];
    const arrivals: StoredArrivalEntry[] = [];

    for (const entry of keyEntry.entries) {
      if (entry.scheduled_time < now - CUTOFF_SECONDS) continue;
      if (entry.scheduled_time > now + HORIZON_SECONDS) break;
      const live = liveByTripId.get(entry.trip_id);
      const tripCanceled = live?.tripRelationship === 3; // CANCELED

      if (tripCanceled) {
        arrivals.push(buildEntry(routeId, key, entry, null, "canceled"));
        continue;
      }

      const stopPrediction = live?.stops.get(stopId);

      if (stopPrediction?.stopRelationship === 1) {
        arrivals.push(buildEntry(routeId, key, entry, null, "skipped"));
        continue;
      }

      const isAdded = live?.tripRelationship === 1; // ADDED

      if (stopPrediction?.time != null) {
        const predicted = stopPrediction.time;
        const status: ArrivalStatus = isAdded ? "added" : "live";
        arrivals.push(buildEntry(routeId, key, entry, predicted, status));
      } else {
        arrivals.push(buildEntry(routeId, key, entry, null, "scheduled"));
      }
    }

    const filtered = arrivals
      .filter((a) => a.eff >= now - CUTOFF_SECONDS)
      .sort((a, b) => a.eff - b.eff)
      .slice(0, MAX_PER_KEY);

    if (filtered.length > 0) {
      data[key] = {
        route_color: routeInfo?.color ?? null,
        headsign: keyEntry.entries[0]?.headsign ?? "",
        arrivals: filtered,
      };
    }
  }

  return { generated_at: now, stations: schedule.stations ?? {}, data };
}

function buildEntry(
  routeId: string,
  key: string,
  entry: ScheduleBlob["by_key"][string]["entries"][number],
  predicted: number | null,
  status: ArrivalStatus,
): StoredArrivalEntry {
  const eff = predicted ?? entry.scheduled_time;
  const delaySeconds = predicted != null ? predicted - entry.scheduled_time : null;

  return {
    r: routeId,
    eff,
    t: fmt.format(new Date(eff * 1000)),
    s: status,
    l: buildStatusLabel(status, delaySeconds),
  };
}

function buildStatusLabel(status: ArrivalStatus, delaySeconds: number | null): string {
  switch (status) {
    case "live": {
      if (delaySeconds == null || Math.abs(delaySeconds) <= 60) return "On time";
      const mins = Math.round(Math.abs(delaySeconds) / 60);
      return delaySeconds > 0 ? `Delayed ${mins} min` : `Early ${mins} min`;
    }
    case "scheduled": return "Scheduled";
    case "canceled":  return "Canceled";
    case "skipped":   return "Skipped";
    case "added":     return "Added";
  }
}
