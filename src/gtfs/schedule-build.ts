import { streamZipFiles } from "./zip-stream.js";
import { CsvStreamParser } from "./csv.js";
import {
  activeServiceIds,
  mountainMidnightUTC,
  parseCalendarRow,
  type ServiceCalendar,
} from "./service-days.js";
import { inferDirections } from "./direction.js";
import type { ScheduleBlob, RouteInfo, ScheduleKeyEntry, StationInfo } from "../types.js";

const GTFS_ZIP_URL = "https://www.rtd-denver.com/files/gtfs/google_transit.zip";
const RAIL_TYPES = new Set([0, 2]); // 0=light rail, 2=commuter rail
const WINDOW_DAYS = 7;

export async function buildSchedule(): Promise<ScheduleBlob> {
  // ─── Pass 1: everything except stop_times.txt ────────────────────────────
  const routes       = new Map<string, RouteInfo>(); // short_name → info (for the schedule blob)
  const railRouteIds = new Set<string>();            // route_id set for trip filtering
  const routeShortName = new Map<string, string>();  // route_id → short_name
  const trips   = new Map<string, { route_id: string; service_id: string; direction_id: number; headsign: string }>();
  const stops   = new Map<string, { name: string; lat: number; lon: number }>();
  const calendar: ServiceCalendar = { regular: new Map(), exceptions: new Map() };
  const parentStations = new Map<string, { name: string }>();   // stop_id → station info (location_type=1)
  const stopParent     = new Map<string, string>();              // child stop_id → parent stop_id

  console.log("[schedule] Pass 1 start");

  await streamZipFiles(GTFS_ZIP_URL, {
    "routes.txt": makeHandler((row) => {
      const type = parseInt(row.route_type ?? "99");
      if (!RAIL_TYPES.has(type)) return;
      const id = row.route_id;
      const sn = row.route_short_name || id; // "B", "D", etc.
      railRouteIds.add(id);
      routeShortName.set(id, sn);
      routes.set(sn, {
        color: row.route_color ? `#${row.route_color}` : "#888888",
        short_name: sn,
        long_name: row.route_long_name ?? "",
      });
    }),

    "trips.txt": makeHandler((row) => {
      if (!railRouteIds.has(row.route_id)) return;
      trips.set(row.trip_id, {
        route_id:     row.route_id,
        service_id:   row.service_id,
        direction_id: parseInt(row.direction_id ?? "0"),
        headsign:     row.trip_headsign ?? "",
      });
    }),

    "stops.txt": makeHandler((row) => {
      stops.set(row.stop_id, {
        name: row.stop_name ?? row.stop_id,
        lat:  parseFloat(row.stop_lat ?? "0"),
        lon:  parseFloat(row.stop_lon ?? "0"),
      });
      if (row.location_type === "1") {
        parentStations.set(row.stop_id, { name: row.stop_name ?? row.stop_id });
      }
      if (row.parent_station) {
        stopParent.set(row.stop_id, row.parent_station);
      }
    }),

    "calendar.txt": makeHandler((row) => {
      const [id, info] = parseCalendarRow(row);
      calendar.regular.set(id, info);
    }),

    "calendar_dates.txt": makeHandler((row) => {
      const id = row.service_id;
      if (!calendar.exceptions.has(id)) {
        calendar.exceptions.set(id, { added: new Set(), removed: new Set() });
      }
      const exc = calendar.exceptions.get(id)!;
      if (row.exception_type === "1") exc.added.add(row.date);
      else if (row.exception_type === "2") exc.removed.add(row.date);
    }),
  });

  console.log(
    `[schedule] Pass 1 done — ${railRouteIds.size} rail routes, ${trips.size} rail trips, ${stops.size} stops`,
  );

  // ─── Pass 2: stop_times.txt (rail trips only) ────────────────────────────
  // trip_id → sorted [{stop_id, stop_sequence, time_seconds}]
  const tripStopTimes = new Map<string, Array<{ stop_id: string; stop_sequence: number; time_seconds: number }>>();

  console.log("[schedule] Pass 2 start");

  await streamZipFiles(GTFS_ZIP_URL, {
    "stop_times.txt": makeHandler((row) => {
      if (!trips.has(row.trip_id)) return; // not a rail trip — discard immediately

      const seq    = parseInt(row.stop_sequence ?? "0");
      const timeSec = parseGtfsTime(row.arrival_time || row.departure_time || "00:00:00");

      let arr = tripStopTimes.get(row.trip_id);
      if (!arr) { arr = []; tripStopTimes.set(row.trip_id, arr); }
      arr.push({ stop_id: row.stop_id, stop_sequence: seq, time_seconds: timeSec });
    }),
  });

  console.log(`[schedule] Pass 2 done — ${tripStopTimes.size} rail trips with stop times`);

  // ─── Direction inference ─────────────────────────────────────────────────
  const dirMap = inferDirections(trips, stops, tripStopTimes);

  // ─── Build by_key index ──────────────────────────────────────────────────
  const now       = Date.now();
  const windowEnd = now + WINDOW_DAYS * 86_400_000;
  const byKey     = new Map<string, ScheduleKeyEntry>();

  // Determine active service_ids for each day in the window
  const activeSvcByDay: Array<{ yyyymmdd: string; midnightUTC: number; svcIds: Set<string> }> = [];
  for (let dayOffset = 0; dayOffset < WINDOW_DAYS + 1; dayOffset++) {
    const dayDate = new Date(now + dayOffset * 86_400_000);
    const yyyymmdd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" })
      .format(dayDate)
      .replace(/-/g, "");
    const midnightUTC = mountainMidnightUTC(yyyymmdd);
    activeSvcByDay.push({
      yyyymmdd,
      midnightUTC,
      svcIds: activeServiceIds(dayDate, calendar),
    });
  }

  for (const [tripId, trip] of trips) {
    const dirKey  = `${trip.route_id}:${trip.direction_id}`;
    const dir     = dirMap.get(dirKey);
    if (!dir) continue;

    const stopTimes = tripStopTimes.get(tripId);
    if (!stopTimes) continue;

    for (const { midnightUTC, svcIds } of activeSvcByDay) {
      if (!svcIds.has(trip.service_id)) continue;

      for (const st of stopTimes) {
        const scheduledUnix = midnightUTC + st.time_seconds;
        const scheduledMs   = scheduledUnix * 1000;
        if (scheduledMs < now - 5 * 60_000 || scheduledMs > windowEnd) continue;

        const sn  = routeShortName.get(trip.route_id) ?? trip.route_id;
        const key = `${sn}:${st.stop_id}:${dir}`;
        let entry = byKey.get(key);
        if (!entry) {
          const stopInfo = stops.get(st.stop_id);
          entry = { stop_name: stopInfo?.name ?? st.stop_id, entries: [] };
          byKey.set(key, entry);
        }

        entry.entries.push({
          trip_id:        tripId,
          service_id:     trip.service_id,
          scheduled_time: scheduledUnix,
          headsign:       trip.headsign,
        });
      }
    }
  }

  // Sort entries within each key by scheduled_time
  for (const entry of byKey.values()) {
    entry.entries.sort((a, b) => a.scheduled_time - b.scheduled_time);
  }

  console.log(`[schedule] built ${byKey.size} (route,stop,dir) keys`);

  // ─── Build station index ──────────────────────────────────────────────────
  // Collect all stop_ids that appear in at least one byKey entry
  const activeStopIds = new Set<string>();
  for (const key of byKey.keys()) {
    const parts = key.split(":");
    activeStopIds.add(parts[1]);
  }

  // Group active stop_ids by parent station (or self if no parent)
  const parentToStopIds = new Map<string, string[]>();
  for (const stopId of activeStopIds) {
    const parentId = stopParent.get(stopId) ?? stopId;
    let arr = parentToStopIds.get(parentId);
    if (!arr) { arr = []; parentToStopIds.set(parentId, arr); }
    arr.push(stopId);
  }

  // Build slug → StationInfo map
  const stations = new Map<string, StationInfo>();
  for (const [parentId, stopIds] of parentToStopIds) {
    const parentInfo = parentStations.get(parentId);
    const name = parentInfo?.name ?? stops.get(parentId)?.name ?? parentId;
    const slug = slugify(name);
    const existing = stations.get(slug);
    if (existing) {
      // merge stop_ids in case two different parent ids slug to the same key
      existing.stop_ids.push(...stopIds.filter(id => !existing.stop_ids.includes(id)));
    } else {
      stations.set(slug, { name, stop_ids: stopIds });
    }
  }

  console.log(`[schedule] built ${stations.size} station slugs`);

  return {
    generated_at: Math.floor(now / 1000),
    routes: Object.fromEntries(routes),
    stations: Object.fromEntries(stations),
    by_key:  Object.fromEntries(byKey),
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Parses a GTFS "HH:MM:SS" time string (may exceed 24:00) into seconds
function parseGtfsTime(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

// Builds a ChunkHandler by wrapping a CsvStreamParser
function makeHandler(onRow: (row: Record<string, string>) => void) {
  const parser = new CsvStreamParser();
  return (chunk: Uint8Array, final: boolean) => {
    const rows = parser.push(chunk, final);
    for (const row of rows) onRow(row);
  };
}
