import { describe, it, expect } from "vitest";
import { buildBaseline, applyLive } from "../live/merge.js";
import type { ScheduleBlob, ArrivalsBlob } from "../types.js";
import type { TripPrediction } from "../live/tripupdate.js";

function parse(json: string): ArrivalsBlob { return JSON.parse(json) as ArrivalsBlob; }

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
  it("marks trips with live predictions as 'live'", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-1", {
        tripId: "trip-1", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: NOW + 660, stopRelationship: 0 }]]),
      }],
    ]);
    const blob = parse(applyLive(buildBaseline(makeSchedule(), NOW), live, NOW));
    const first = blob.data["A:34667:E"].a[0];
    expect(first.e).toBe(NOW + 660);
    expect(first.l).toBe("On time");
  });

  it("marks trips without predictions as 'scheduled'", () => {
    const blob = parse(applyLive(buildBaseline(makeSchedule(), NOW), new Map(), NOW));
    expect(blob.data["A:34667:E"].a.every(a => a.l === undefined)).toBe(true);
  });

  it("advances startIdx past stale entries across ticks", () => {
    const baseline = buildBaseline(makeSchedule(), NOW);
    // CUTOFF is 5 min. trip-1 eff = NOW+600 (+10 min). Past cutoff when now > eff+CUTOFF = NOW+900.
    // Simulate a tick 16 minutes later (NOW+960 > NOW+900).
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
    const blob = parse(applyLive(buildBaseline(makeSchedule(), NOW), live, NOW));
    const canceled = blob.data["A:34667:E"].a.find(a => a.e === NOW + 1500);
    expect(canceled?.l).toBe("Canceled");
  });

  it("marks skipped stops correctly", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-3", {
        tripId: "trip-3", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: null, stopRelationship: 1 }]]),
      }],
    ]);
    const blob = parse(applyLive(buildBaseline(makeSchedule(), NOW), live, NOW));
    const skipped = blob.data["A:34667:E"].a.find(a => a.e === NOW + 2400);
    expect(skipped?.l).toBe("Skipped");
  });

  it("produces correct delay labels", () => {
    const live = new Map<string, TripPrediction>([
      ["trip-1", {
        tripId: "trip-1", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: NOW + 600 + 5 * 60, stopRelationship: 0 }]]),
      }],
    ]);
    const blob = parse(applyLive(buildBaseline(makeSchedule(), NOW), live, NOW));
    const first = blob.data["A:34667:E"].a[0];
    expect(first.l).toBe("Delayed 5 min");
  });
});
