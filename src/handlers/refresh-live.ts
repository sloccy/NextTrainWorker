import type { Env, ScheduleBlob } from "../types.js";
import { getSchedule, writeArrivalsIfChanged } from "../kv.js";
import { fetchTripUpdates, type TripPrediction } from "../live/tripupdate.js";
import { mergeScheduleWithLive } from "../live/merge.js";
import { buildSampleSchedule } from "../live/sample-schedule.js";

let s_schedCache: { schedule: ScheduleBlob; loadedAt: number } | null = null;
const SCHED_TTL_MS = 60 * 60 * 1000;

async function getSchedCached(env: Env): Promise<ScheduleBlob> {
  const now = Date.now();
  if (s_schedCache && now - s_schedCache.loadedAt < SCHED_TTL_MS) {
    return s_schedCache.schedule;
  }
  const schedule = await getSchedule(env) ?? buildSampleSchedule();
  s_schedCache = { schedule, loadedAt: now };
  return schedule;
}

export async function handleRefreshLive(env: Env): Promise<void> {
  const schedule = await getSchedCached(env);

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
