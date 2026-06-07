import { streamZipFiles } from "./zip-stream.js";
import { CsvStreamParser } from "./csv.js";
import {
  activeServiceIds,
  mountainMidnightUTC,
  parseCalendarRow,
  type ServiceCalendar,
} from "./service-days.js";
import { inferDirections } from "./direction.js";
import { w8, w16, w32, wLpStr, Dictionary, type StationWire, buildStationsBin } from "./binary-write.js";

const GTFS_ZIP_URL = "https://www.rtd-denver.com/files/gtfs/google_transit.zip";
const RAIL_TYPES = new Set([0, 2]);
const WINDOW_DAYS = 1;

export interface BuiltSchedule {
  generatedAt: number;
  templateBin: Uint8Array;
  tripOffsets: Map<string, number[]>;
  stopOffsets: Map<string, Map<string, number[]>>;
  stopToSlug: Map<string, string>;
  stationsBin: Uint8Array;
  routeIdToShortName: Map<string, string>;
}

export async function buildSchedule(): Promise<BuiltSchedule> {
  const routes = new Map<string, { color: string; short_name: string }>();
  const railRouteIds = new Set<string>();
  const routeShortName = new Map<string, string>();
  const trips = new Map<string, { route_id: string; service_id: string; direction_id: number; headsign: string }>();
  const stops = new Map<string, { name: string; lat: number; lon: number }>();
  const calendar: ServiceCalendar = { regular: new Map(), exceptions: new Map() };
  const parentStations = new Map<string, { name: string }>();
  const stopParent = new Map<string, string>();

  await streamZipFiles(GTFS_ZIP_URL, {
    "routes.txt": makeHandler((row) => {
      const type = Number.parseInt(row.route_type ?? "99");
      if (!RAIL_TYPES.has(type)) return;
      const id = row.route_id;
      const sn = row.route_short_name || id;
      railRouteIds.add(id);
      routeShortName.set(id, sn);
      routes.set(sn, { color: row.route_color ? `#${row.route_color}` : "#888888", short_name: sn });
    }),
    "trips.txt": makeHandler((row) => {
      if (!railRouteIds.has(row.route_id)) return;
      trips.set(row.trip_id, {
        route_id: row.route_id,
        service_id: row.service_id,
        direction_id: Number.parseInt(row.direction_id ?? "0"),
        headsign: (row.trip_headsign ?? "").replace(/\bStation\b/gi, "").replace(/\s+/g, " ").trim(),
      });
    }),
    "stops.txt": makeHandler((row) => {
      stops.set(row.stop_id, {
        name: row.stop_name ?? row.stop_id,
        lat: Number.parseFloat(row.stop_lat ?? "0"),
        lon: Number.parseFloat(row.stop_lon ?? "0"),
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

  const tripStopTimes = new Map<string, Array<{ stop_id: string; stop_sequence: number; time_seconds: number }>>();
  await streamZipFiles(GTFS_ZIP_URL, {
    "stop_times.txt": makeHandler((row) => {
      if (!trips.has(row.trip_id)) return;
      const seq = Number.parseInt(row.stop_sequence ?? "0");
      const timeSec = parseGtfsTime(row.arrival_time || row.departure_time || "00:00:00");
      let arr = tripStopTimes.get(row.trip_id);
      if (!arr) { arr = []; tripStopTimes.set(row.trip_id, arr); }
      arr.push({ stop_id: row.stop_id, stop_sequence: seq, time_seconds: timeSec });
    }),
  });

  const dirMap = inferDirections(trips, stops, tripStopTimes);
  const now = Date.now();
  const windowEnd = now + WINDOW_DAYS * 86_400_000;

  const baseDate = new Date(now);
  const baseYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" })
    .format(baseDate).replace(/-/g, "");
  const baseMidnightUTC = mountainMidnightUTC(baseYmd);

  const activeSvcByDay: Array<{ yyyymmdd: string; midnightUTC: number; svcIds: Set<string> }> = [];
  for (let dayOffset = 0; dayOffset < WINDOW_DAYS + 1; dayOffset++) {
    const dayDate = new Date(now + dayOffset * 86_400_000);
    const yyyymmdd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" })
      .format(dayDate).replace(/-/g, "");
    activeSvcByDay.push({
      yyyymmdd,
      midnightUTC: mountainMidnightUTC(yyyymmdd),
      svcIds: activeServiceIds(dayDate, calendar),
    });
  }

  const stationArrivals = new Map<string, Array<{
    route: string; dir: string; monoMins: number; tripId: string; stopId: string;
    aliasStopIds: string[]; e: number;
  }>>();
  const stopToSlug = new Map<string, string>();

  for (const stopId of stops.keys()) {
    const parentId = stopParent.get(stopId) ?? stopId;
    const name = parentStations.get(parentId)?.name ?? stops.get(parentId)?.name ?? parentId;
    stopToSlug.set(stopId, slugify(name));
  }

  for (const [tripId, trip] of trips) {
    const dir = dirMap.get(`${trip.route_id}:${trip.direction_id}`);
    if (!dir) continue;
    const stopTimes = tripStopTimes.get(tripId);
    if (!stopTimes) continue;

    // Sort by stop_sequence so first occurrence per slug is deterministic.
    const sorted = [...stopTimes].sort((a, b) => a.stop_sequence - b.stop_sequence);

    for (const { midnightUTC, svcIds } of activeSvcByDay) {
      if (!svcIds.has(trip.service_id)) continue;

      // Per (trip, day): track the emitted entry for each slug so aliases can be registered.
      const slugEntry = new Map<string, { aliasStopIds: string[] }>();

      for (const st of sorted) {
        const slug = stopToSlug.get(st.stop_id);
        if (!slug) continue;

        const scheduledUnix = midnightUTC + st.time_seconds;
        if (scheduledUnix * 1000 < now - 2 * 60_000 || scheduledUnix * 1000 > windowEnd) continue;

        const existing = slugEntry.get(slug);
        if (existing) {
          // Earlier stop_sequence already emitted an entry for this slug.
          // Register this stop_id as an alias so RT updates to it patch the same byte.
          existing.aliasStopIds.push(st.stop_id);
          continue;
        }

        let list = stationArrivals.get(slug);
        if (!list) { list = []; stationArrivals.set(slug, list); }

        const entry = {
          route: routeShortName.get(trip.route_id)!,
          dir,
          monoMins: Math.floor((scheduledUnix - baseMidnightUTC) / 60),
          tripId,
          stopId: st.stop_id,
          aliasStopIds: [] as string[],
          e: scheduledUnix,
        };
        list.push(entry);
        slugEntry.set(slug, entry);
      }
    }
  }

  // Pre-compute the last-stop slug for each trip (used for terminus filtering below).
  const tripLastSlug = new Map<string, string>();
  for (const [tripId, stops_] of tripStopTimes) {
    const sorted_ = stops_.slice().sort((a, b) => a.stop_sequence - b.stop_sequence);
    const lastId = sorted_[sorted_.length - 1]?.stop_id;
    const slug = lastId ? stopToSlug.get(lastId) : undefined;
    if (slug) tripLastSlug.set(tripId, slug);
  }

  const slugs = [...stationArrivals.keys()].sort();
  const dict = new Dictionary();

  const tDataBlocks: Array<{
    bytes: number[]; entryTripIds: string[]; entryStopIds: string[]; entryAliasStopIds: string[][];
  }> = [];
  for (const slug of slugs) {
    const arrivals = stationArrivals.get(slug)!.sort((a, b) => a.e - b.e);
    const bytes: number[] = [];
    const entryTripIds: string[] = [];
    const entryStopIds: string[] = [];
    const entryAliasStopIds: string[][] = [];
    w16(bytes, arrivals.length);
    for (const a of arrivals) {
      w8(bytes, dict.get(a.route));
      w8(bytes, a.dir.charCodeAt(0));
      w16(bytes, a.monoMins);
      w8(bytes, 0);
      entryTripIds.push(a.tripId);
      entryStopIds.push(a.stopId);
      entryAliasStopIds.push(a.aliasStopIds);
    }
    tDataBlocks.push({ bytes, entryTripIds, entryStopIds, entryAliasStopIds });
  }

  const generatedAt = Math.floor(now / 1000);
  const tResult: number[] = [];
  w32(tResult, 0);
  w32(tResult, baseMidnightUTC);
  dict.write(tResult);
  w16(tResult, slugs.length);

  const tIndexEntries: number[][] = [];
  let tIndexSize = 0;
  for (const slug of slugs) {
    const e: number[] = [];
    wLpStr(e, slug, 64);
    tIndexSize += e.length + 4;
    tIndexEntries.push(e);
  }
  let tOffset = tResult.length + tIndexSize;
  for (let i = 0; i < slugs.length; i++) {
    tResult.push(...tIndexEntries[i]);
    w32(tResult, tOffset);
    tOffset += tDataBlocks[i].bytes.length;
  }

  // Build offset maps:
  // tripOffsets: tripId → flat number[] of status byte offsets
  // stopOffsets: tripId → Map<stopId, number[]> of status byte offsets
  const tripOffsets = new Map<string, number[]>();
  const stopOffsets = new Map<string, Map<string, number[]>>();
  let tBlockBase = tResult.length;
  for (let i = 0; i < slugs.length; i++) {
    const { bytes, entryTripIds, entryStopIds, entryAliasStopIds } = tDataBlocks[i];
    for (let j = 0; j < entryTripIds.length; j++) {
      const statusOff = tBlockBase + 2 + j * 5 + 4;
      const tripId = entryTripIds[j];

      let tarr = tripOffsets.get(tripId);
      if (!tarr) { tarr = []; tripOffsets.set(tripId, tarr); }
      tarr.push(statusOff);

      let outer = stopOffsets.get(tripId);
      if (!outer) { outer = new Map(); stopOffsets.set(tripId, outer); }
      for (const sid of [entryStopIds[j], ...entryAliasStopIds[j]]) {
        let sarr = outer.get(sid);
        if (!sarr) { sarr = []; outer.set(sid, sarr); }
        sarr.push(statusOff);
      }
    }
    tResult.push(...bytes);
    tBlockBase += bytes.length;
  }

  const templateBin = new Uint8Array(tResult);

  const stationEntries: StationWire[] = [];
  for (const slug of slugs) {
    const arrivals = stationArrivals.get(slug)!;
    const routesByDir = new Map<string, { r: string; c: string | null; d: string; h: string }>();
    // allTerminus: true means every trip seen for this route+dir terminates here.
    const allTerminus = new Map<string, boolean>();
    for (const a of arrivals) {
      const rkey = `${a.route}:${a.dir}`;
      const isTerminus = tripLastSlug.get(a.tripId) === slug;
      if (!routesByDir.has(rkey)) {
        const trip = trips.get(a.tripId)!;
        routesByDir.set(rkey, {
          r: a.route,
          c: routes.get(a.route)?.color ?? null,
          d: a.dir,
          h: stripRoutePrefix(trip.headsign, a.route),
        });
        allTerminus.set(rkey, isTerminus);
      } else if (!isTerminus) {
        allTerminus.set(rkey, false);
      }
    }
    stationEntries.push({
      k: slug,
      r: [...routesByDir.entries()]
        .filter(([rkey]) => !allTerminus.get(rkey))
        .map(([, v]) => v)
        .sort((a, b) => a.r.localeCompare(b.r) || a.d.localeCompare(b.d)),
    });
  }
  const stationsBin = buildStationsBin(stationEntries, generatedAt);

  return { generatedAt, templateBin, tripOffsets, stopOffsets, stopToSlug, stationsBin, routeIdToShortName: routeShortName };
}

function stripRoutePrefix(headsign: string, route: string): string {
  const re = new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[- ]Line\\s+`, "i");
  const stripped = headsign.replace(re, "").trim();
  return stripped.length > 0 ? stripped : headsign;
}

function slugify(name: string): string {
  return name.replace(/\bStation\b/gi, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseGtfsTime(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function makeHandler(onRow: (row: Record<string, string>) => void) {
  const parser = new CsvStreamParser();
  return (chunk: Uint8Array, final: boolean) => {
    const rows = parser.push(chunk, final);
    for (const row of rows) onRow(row);
  };
}
