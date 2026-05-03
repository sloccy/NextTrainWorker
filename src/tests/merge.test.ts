import { describe, it, expect } from "vitest";
import { mergeScheduleWithLive } from "../live/merge.js";
import type { ScheduleBlob } from "../types.js";
import type { TripPrediction } from "../live/tripupdate.js";

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

describe("mergeScheduleWithLive", () => {
  it("marks trips with live predictions as 'live'", () => {
    const liveUpdates = new Map<string, TripPrediction>([
      ["trip-1", {
        tripId: "trip-1", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: NOW + 660, stopRelationship: 0 }]]),
      }],
    ]);

    const blob = mergeScheduleWithLive(makeSchedule(), liveUpdates, NOW);
    const entry = blob.data["A:34667:E"];
    expect(entry).toBeDefined();

    const first = entry.arrivals[0];
    expect(first.s).toBe("live");
    expect(first.eff).toBe(NOW + 660);
    expect(first.l).toBe("On time"); // 60s delay ≤ 60s threshold
  });

  it("marks trips without predictions as 'scheduled'", () => {
    const blob = mergeScheduleWithLive(makeSchedule(), new Map(), NOW);
    const arrivals = blob.data["A:34667:E"].arrivals;
    expect(arrivals.every(a => a.s === "scheduled")).toBe(true);
  });

  it("marks canceled trips as 'canceled'", () => {
    const liveUpdates = new Map<string, TripPrediction>([
      ["trip-2", {
        tripId: "trip-2", routeId: "A", tripRelationship: 3, // CANCELED
        stops: new Map(),
      }],
    ]);

    const blob = mergeScheduleWithLive(makeSchedule(), liveUpdates, NOW);
    const arr = blob.data["A:34667:E"].arrivals;
    const canceled = arr.find(a => a.eff === NOW + 1500);
    expect(canceled?.s).toBe("canceled");
    expect(canceled?.l).toBe("Canceled");
  });

  it("marks skipped stops correctly", () => {
    const liveUpdates = new Map<string, TripPrediction>([
      ["trip-3", {
        tripId: "trip-3", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: null, stopRelationship: 1 }]]), // SKIPPED
      }],
    ]);

    const blob = mergeScheduleWithLive(makeSchedule(), liveUpdates, NOW);
    const arr = blob.data["A:34667:E"].arrivals;
    const skipped = arr.find(a => a.eff === NOW + 2400);
    expect(skipped?.s).toBe("skipped");
  });

  it("produces correct delay labels", () => {
    const liveUpdates = new Map<string, TripPrediction>([
      ["trip-1", {
        tripId: "trip-1", routeId: "A", tripRelationship: 0,
        stops: new Map([["34667", { time: NOW + 600 + 5 * 60, stopRelationship: 0 }]]), // +5 min delay
      }],
    ]);
    const blob = mergeScheduleWithLive(makeSchedule(), liveUpdates, NOW);
    const first = blob.data["A:34667:E"].arrivals[0];
    expect(first.l).toBe("Delayed 5 min");
  });
});
