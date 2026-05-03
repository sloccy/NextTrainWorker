import type { ScheduleBlob } from "../types.js";

// Stub schedule used in Phase 2 before the real static-GTFS cron is built (Phase 4).
// Uses fake trip_ids so no live predictions will match — everything shows as "scheduled".
// Scheduled times are dynamically computed so they stay current when the cron runs.
export function buildSampleSchedule(): ScheduleBlob {
  const now = Math.floor(Date.now() / 1000);
  const interval = 15 * 60; // 15-minute headways, roughly matching A-line peak schedule
  const base = Math.ceil(now / interval) * interval;
  const times = Array.from({ length: 8 }, (_, i) => base + i * interval);

  return {
    generated_at: now,
    routes: {
      A: { color: "#A2C617", short_name: "A", long_name: "University of Colorado A Line" },
    },
    stations: {
      union_station: {
        name: "Union Station",
        stop_ids: ["34667"],
      },
    },
    by_key: {
      // Union Station Track 1, eastbound to DEN
      // stop_id 34667 is RTD's GTFS ID for Union Station Track 1 on the A Line
      "A:34667:E": {
        stop_name: "Union Station Track 1",
        entries: times.map((t, i) => ({
          trip_id: `STUB-A-E-${i}`,
          service_id: "STUB",
          scheduled_time: t,
          headsign: "Denver Airport",
        })),
      },
    },
  };
}
