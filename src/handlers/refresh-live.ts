import type { Env } from "../types.js";
import { getSchedule, writeArrivalsIfChanged } from "../kv.js";
import { fetchTripUpdates, type TripPrediction } from "../live/tripupdate.js";
import { mergeScheduleWithLive } from "../live/merge.js";
import { buildSampleSchedule } from "../live/sample-schedule.js";

export async function handleRefreshLive(env: Env): Promise<void> {
  const schedule = await getSchedule(env) ?? buildSampleSchedule();

  let liveByTripId: Map<string, TripPrediction>;
  try {
    liveByTripId = await fetchTripUpdates();
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    liveByTripId = new Map();
  }

  const blob = mergeScheduleWithLive(schedule, liveByTripId);
  const wrote = await writeArrivalsIfChanged(env, blob);

  console.log(`[refresh-live] done — ${Object.keys(blob.data).length} keys, wrote=${wrote}`);
}
