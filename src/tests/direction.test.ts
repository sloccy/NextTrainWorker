import { describe, it, expect } from "vitest";
import { inferDirections } from "../build/direction.js";

describe("inferDirections", () => {
  const stops = new Map([
    ["DUS", { lat: 39.7526, lon: -104.9993 }],
    ["DEN", { lat: 39.8561, lon: -104.6737 }],
    ["WMN", { lat: 39.8640, lon: -105.0664 }],
    ["JEF", { lat: 39.7382, lon: -105.1032 }],
  ]);

  it("classifies A Line as E outbound (DUS→DEN)", () => {
    const trips = new Map([["trip-A-0", { route_id: "A", direction_id: 0, headsign: "Denver Airport" }]]);
    const tripStops = new Map([
      ["trip-A-0", [
        { stop_id: "DUS", stop_sequence: 1 },
        { stop_id: "DEN", stop_sequence: 2 },
      ]],
    ]);
    const dirs = inferDirections(trips, stops, tripStops);
    expect(dirs.get("A:0")).toBe("E");
  });

  it("classifies B Line as N outbound (DUS→Westminster)", () => {
    const trips = new Map([["trip-B-0", { route_id: "113B", direction_id: 0, headsign: "Westminster Station" }]]);
    const tripStops = new Map([
      ["trip-B-0", [
        { stop_id: "DUS", stop_sequence: 1 },
        { stop_id: "WMN", stop_sequence: 2 },
      ]],
    ]);
    const dirs = inferDirections(trips, stops, tripStops);
    expect(dirs.get("113B:0")).toBe("N");
  });

  it("classifies W Line as W outbound (DUS→Jefferson)", () => {
    const trips = new Map([["trip-W-0", { route_id: "W", direction_id: 0, headsign: "Lakewood/Wadsworth" }]]);
    const tripStops = new Map([
      ["trip-W-0", [
        { stop_id: "DUS", stop_sequence: 1 },
        { stop_id: "JEF", stop_sequence: 2 },
      ]],
    ]);
    const dirs = inferDirections(trips, stops, tripStops);
    expect(dirs.get("W:0")).toBe("W");
  });

  it("returns opposite direction for direction_id 1", () => {
    const trips = new Map([
      ["trip-A-0", { route_id: "A", direction_id: 0, headsign: "Denver Airport" }],
      ["trip-A-1", { route_id: "A", direction_id: 1, headsign: "Union Station" }],
    ]);
    const tripStops = new Map([
      ["trip-A-0", [{ stop_id: "DUS", stop_sequence: 1 }, { stop_id: "DEN", stop_sequence: 2 }]],
      ["trip-A-1", [{ stop_id: "DEN", stop_sequence: 1 }, { stop_id: "DUS", stop_sequence: 2 }]],
    ]);
    const dirs = inferDirections(trips, stops, tripStops);
    expect(dirs.get("A:0")).toBe("E");
    expect(dirs.get("A:1")).toBe("W");
  });
});
