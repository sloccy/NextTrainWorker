import { streamZipFiles } from "./zip-stream.js";
import { CsvStreamParser } from "./csv.js";
import {
  activeServiceIds,
  mountainMidnightUTC,
  parseCalendarRow,
  type ServiceCalendar,
} from "./service-days.js";
import { inferDirections } from "./direction.js";
import {
  w8, w16, w32, wLpStr, hashTripId, hashTripIdStopId, Dictionary,
  type StationWire, buildStationsBin
} from "../binary.js";

const GTFS_ZIP_URL = "https://www.rtd-denver.com/files/gtfs/google_transit.zip";
const RAIL_TYPES = new Set([0, 2]); // 0=light rail, 2=commuter rail
const WINDOW_DAYS = 1; // 24-hour window

export interface BuiltSchedules {
  generatedAt: number;
  templateBin: Uint8Array;
  hashOffsets: Uint32Array;
  stopHashOffsets: Uint32Array;
  stationsBin: Uint8Array;
}

export async function buildSchedule(): Promise<BuiltSchedules> {
  const routes       = new Map<string, { color: string, short_name: string }>();
  const railRouteIds = new Set<string>();
  const routeShortName = new Map<string, string>();
  const trips   = new Map<string, { route_id: string; service_id: string; direction_id: number; headsign: string }>();
  const stops   = new Map<string, { name: string; lat: number; lon: number }>();
  const calendar: ServiceCalendar = { regular: new Map(), exceptions: new Map() };
  const parentStations = new Map<string, { name: string }>();
  const stopParent     = new Map<string, string>();

  await streamZipFiles(GTFS_ZIP_URL, {
    "routes.txt": makeHandler((row) => {
      const type = parseInt(row.route_type ?? "99");
      if (!RAIL_TYPES.has(type)) return;
      const id = row.route_id;
      const sn = row.route_short_name || id;
      railRouteIds.add(id);
      routeShortName.set(id, sn);
      routes.set(sn, {
        color: row.route_color ? `#${row.route_color}` : "#888888",
        short_name: sn,
      });
    }),
    "trips.txt": makeHandler((row) => {
      if (!railRouteIds.has(row.route_id)) return;
      trips.set(row.trip_id, {
        route_id:     row.route_id,
        service_id:   row.service_id,
        direction_id: parseInt(row.direction_id ?? "0"),
        headsign:     (row.trip_headsign ?? "").replace(/\bStation\b/gi, "").replace(/\s+/g, " ").trim(),
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

  const tripStopTimes = new Map<string, Array<{ stop_id: string; stop_sequence: number; time_seconds: number }>>();
  await streamZipFiles(GTFS_ZIP_URL, {
    "stop_times.txt": makeHandler((row) => {
      if (!trips.has(row.trip_id)) return;
      const seq = parseInt(row.stop_sequence ?? "0");
      const timeSec = parseGtfsTime(row.arrival_time || row.departure_time || "00:00:00");
      let arr = tripStopTimes.get(row.trip_id);
      if (!arr) { arr = []; tripStopTimes.set(row.trip_id, arr); }
      arr.push({ stop_id: row.stop_id, stop_sequence: seq, time_seconds: timeSec });
    }),
  });

  const dirMap = inferDirections(trips, stops, tripStopTimes);
  const now = Date.now();
  const windowEnd = now + WINDOW_DAYS * 86_400_000;

  // Find the base midnight for the entire schedule build (start of "today" in Denver)
  const baseDate = new Date(now);
  const baseYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(baseDate).replace(/-/g, "");
  const baseMidnightUTC = mountainMidnightUTC(baseYmd);

  const activeSvcByDay: Array<{ yyyymmdd: string; midnightUTC: number; svcIds: Set<string> }> = [];
  for (let dayOffset = 0; dayOffset < WINDOW_DAYS + 1; dayOffset++) {
    const dayDate = new Date(now + dayOffset * 86_400_000);
    const yyyymmdd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(dayDate).replace(/-/g, "");
    activeSvcByDay.push({
      yyyymmdd,
      midnightUTC: mountainMidnightUTC(yyyymmdd),
      svcIds: activeServiceIds(dayDate, calendar),
    });
  }

  // Pre-filter trip_ids and group by station
  const stationArrivals = new Map<string, Array<{ route: string, dir: string, monoMins: number, tripId: string, stopId: string, e: number }>>();
  const stopToSlug = new Map<string, string>();
  
  // Build stop -> station slug map
  for (const stopId of stops.keys()) {
    let parentId = stopParent.get(stopId) ?? stopId;
    let name = parentStations.get(parentId)?.name ?? stops.get(parentId)?.name ?? parentId;
    stopToSlug.set(stopId, slugify(name));
  }

  for (const [tripId, trip] of trips) {
    const dir = dirMap.get(`${trip.route_id}:${trip.direction_id}`);
    if (!dir) continue;
    const stopTimes = tripStopTimes.get(tripId);
    if (!stopTimes) continue;

    for (const { midnightUTC, svcIds } of activeSvcByDay) {
      if (!svcIds.has(trip.service_id)) continue;
      for (const st of stopTimes) {
        const scheduledUnix = midnightUTC + st.time_seconds;
        if (scheduledUnix * 1000 < now - 5 * 60_000 || scheduledUnix * 1000 > windowEnd) continue;
        
        const slug = stopToSlug.get(st.stop_id);
        if (!slug) continue;

        let list = stationArrivals.get(slug);
        if (!list) { list = []; stationArrivals.set(slug, list); }
        
        list.push({
          route: routeShortName.get(trip.route_id)!,
          dir,
          monoMins: Math.floor((scheduledUnix - baseMidnightUTC) / 60),
          tripId,
          stopId: st.stop_id,
          e: scheduledUnix
        });
      }
    }
  }

  // Build template binary (current.bin wire format, all delay_status=0) + hash→offset index
  const slugs = [...stationArrivals.keys()].sort();
  const dict = new Dictionary();

  // Pass 1: build per-station data blocks (populates dict, tracks status byte offsets)
  const tDataBlocks: Array<{ bytes: number[]; entryHashes: number[]; entryStopHashes: number[] }> = [];
  for (const slug of slugs) {
    const arrivals = stationArrivals.get(slug)!.sort((a, b) => a.e - b.e);
    const bytes: number[] = [];
    const entryHashes: number[] = [];
    const entryStopHashes: number[] = [];
    w16(bytes, arrivals.length);
    for (const a of arrivals) {
      w8(bytes, dict.get(a.route));
      w8(bytes, a.dir.charCodeAt(0));
      w16(bytes, a.monoMins);
      w8(bytes, 0); // delay_status placeholder; worker patches per-tick
      entryHashes.push(hashTripId(a.tripId));
      entryStopHashes.push(hashTripIdStopId(a.tripId, a.stopId));
    }
    tDataBlocks.push({ bytes, entryHashes, entryStopHashes });
  }

  // Build header (dict now fully populated)
  const generatedAt = Math.floor(now / 1000);
  const tResult: number[] = [];
  w32(tResult, 0);               // generated_at placeholder — worker overwrites per tick
  w32(tResult, baseMidnightUTC); // /a uses this to compute the cutoff
  dict.write(tResult);
  w16(tResult, slugs.length);

  // Build index
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

  // Write data + record (hash, statusByteOffset) pairs
  const hashOffsetPairs: number[] = [];
  const stopHashOffsetPairs: number[] = [];
  let tBlockBase = tResult.length;
  for (let i = 0; i < slugs.length; i++) {
    const { bytes, entryHashes, entryStopHashes } = tDataBlocks[i];
    for (let j = 0; j < entryHashes.length; j++) {
      // entry layout: [routeIdx u8][dir u8][monoLo u8][monoHi u8][status u8]
      const statusOff = tBlockBase + 2 + j * 5 + 4;
      hashOffsetPairs.push(entryHashes[j], statusOff);
      stopHashOffsetPairs.push(entryStopHashes[j], statusOff);
    }
    tResult.push(...bytes);
    tBlockBase += bytes.length;
  }

  const templateBin = new Uint8Array(tResult);
  const hashOffsets = new Uint32Array(hashOffsetPairs);
  const stopHashOffsets = new Uint32Array(stopHashOffsetPairs);

  // Encode stations.bin (wire format for phone)
  const stationEntries: StationWire[] = [];
  for (const slug of slugs) {
    const arrivals = stationArrivals.get(slug)!;
    const routesByDir = new Map<string, { r: string, c: string | null, d: string, h: string }>();
    for (const a of arrivals) {
      const rkey = `${a.route}:${a.dir}`;
      if (!routesByDir.has(rkey)) {
        const trip = trips.get(a.tripId)!;
        routesByDir.set(rkey, {
          r: a.route,
          c: routes.get(a.route)?.color ?? null,
          d: a.dir,
          h: trip.headsign
        });
      }
    }
    stationEntries.push({
      k: slug,
      r: [...routesByDir.values()].sort((a, b) => a.r.localeCompare(b.r) || a.d.localeCompare(b.d))
    });
  }
  const stationsBin = buildStationsBin(stationEntries, generatedAt);

  return {
    generatedAt,
    templateBin,
    hashOffsets,
    stopHashOffsets,
    stationsBin,
  };
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
