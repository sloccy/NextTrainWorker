import { describe, it, expect } from "vitest";
import { buildBaseline, applyLive } from "../live/merge.js";
import type { ScheduleBlob } from "../types.js";
import type { TripPrediction } from "../live/tripupdate.js";
import { scanArrivalsBin } from "../binary.js";

const NOW = Math.floor(Date.now() / 1000);

function makeSchedule(): ScheduleBlob {
  return {
    generated_at: NOW,
    routes: { A: { color: "#57C1E9", short_name: "A", long_name: "A Line" } },
    stations: {
      union_station: { stop_ids: ["34667"] },
    },
    by_key: {
      "A:34667:E": {
        stop_name: "Union Station Track 1",
        entries: [
          { trip_id: "trip-1", service_id: "svc-1", scheduled_time: NOW + 600,  headsign: "Denver Airport" },
          { trip_id: "trip-2", service_id: "svc-1", scheduled_time: NOW + 1500, headsign: "Denver Airport" },
          { trip_id: "trip-3", service_id: "svc-1", scheduled_time: NOW + 2400, headsign: "Denver Airport" },
        ],
      },
    },
  };
}

interface DecodedArrival {
  r: number; g: number; b: number;
  route: string; headsign: string; time: string; label: string;
}

function decodeWatchBin(buf: Uint8Array): DecodedArrival[] {
  const count = buf[0];
  const out: DecodedArrival[] = [];
  let pos = 1;
  for (let i = 0; i < count; i++) {
    const r = buf[pos++];
    const g = buf[pos++];
    const b = buf[pos++];
    const readStr = () => {
      const len = buf[pos++];
      let s = "";
      for (let j = 0; j < len; j++) s += String.fromCharCode(buf[pos++]);
      return s;
    };
    out.push({
      r, g, b,
      route: readStr(),
      headsign: readStr(),
      time: readStr(),
      label: readStr(),
    });
  }
  return out;
}

describe("buildBaseline", () => {
  it("pre-formats all entries as scheduled with t strings", () => {
    const baseline = buildBaseline(makeSchedule(), NOW);
    const entry = baseline.data["A:34667:E"];
    expect(entry.arrivals.length).toBe(3);
    expect(entry.arrivals.every(a => a.l === undefined)).toBe(true);
    expect(entry.arrivals.every(a => typeof a.t === "string" && a.t.length > 0)).toBe(true);
  });

  it("excludes entries past the CUTOFF", () => {
    const schedule = makeSchedule();
    schedule.by_key["A:34667:E"].entries[0].scheduled_time = NOW - 10 * 60;
    const baseline = buildBaseline(schedule, NOW);
    const arrivals = baseline.data["A:34667:E"].arrivals;
    expect(arrivals.every(a => a.e >= NOW - 5 * 60)).toBe(true);
  });

  it("startIdx begins at 0", () => {
    const baseline = buildBaseline(makeSchedule(), NOW);
    expect(baseline.data["A:34667:E"].startIdx).toBe(0);
  });
});

describe("applyLive", () => {
  const station = "union_station";
  const routes = [{ route: "A", dir: "E" }];

  it("marks trips with live predictions as 'live'", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-1", {
        tripId: "trip-1", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: NOW + 660, stopRelationship: 0 }]]),
      }],
    ]);
    const bin = applyLive(buildBaseline(makeSchedule(), NOW), live, NOW);
    const res = scanArrivalsBin(bin, station, routes)!;
    const first = decodeWatchBin(res.buf)[0];
    expect(first.label).toBe("On time");
  });

  it("marks trips without predictions as 'scheduled'", () => {
    const bin = applyLive(buildBaseline(makeSchedule(), NOW), new Map(), NOW);
    const res = scanArrivalsBin(bin, station, routes)!;
    const decoded = decodeWatchBin(res.buf);
    expect(decoded.every(a => a.label === "")).toBe(true);
  });

  it("advances startIdx past stale entries across ticks", () => {
    const baseline = buildBaseline(makeSchedule(), NOW);
    const later = NOW + 16 * 60;
    applyLive(baseline, new Map(), later);
    expect(baseline.data["A:34667:E"].startIdx).toBe(1);
  });

  it("marks canceled trips as 'canceled'", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-2", {
        tripId: "trip-2", routeId: "A", tripRelationship: 3,
        stops: new Map(),
      }],
    ]);
    const bin = applyLive(buildBaseline(makeSchedule(), NOW), live, NOW);
    const res = scanArrivalsBin(bin, station, routes)!;
    const canceled = decodeWatchBin(res.buf).find(a => a.label === "Canceled");
    expect(canceled).toBeDefined();
  });

  it("marks skipped stops correctly", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-3", {
        tripId: "trip-3", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: null, stopRelationship: 1 }]]),
      }],
    ]);
    const bin = applyLive(buildBaseline(makeSchedule(), NOW), live, NOW);
    const res = scanArrivalsBin(bin, station, routes)!;
    const skipped = decodeWatchBin(res.buf).find(a => a.label === "Skipped");
    expect(skipped).toBeDefined();
  });

  it("produces correct delay labels", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-1", {
        tripId: "trip-1", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: NOW + 600 + 5 * 60, stopRelationship: 0 }]]),
      }],
    ]);
    const bin = applyLive(buildBaseline(makeSchedule(), NOW), live, NOW);
    const res = scanArrivalsBin(bin, station, routes)!;
    const first = decodeWatchBin(res.buf)[0];
    expect(first.label).toBe("Delayed 5 min");
  });
});
