import type { Env } from "../types.js";
import { getSchedule, getScheduleVersion } from "../kv.js";
import { writeArrivals } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { buildBaseline, applyLive, type Baseline } from "../live/merge.js";
import { buildSampleSchedule } from "../live/sample-schedule.js";

interface CachedBaseline {
  version: string;
  baseline: Baseline;
}

let s_cached: CachedBaseline | null = null;

async function getCached(env: Env): Promise<Baseline> {
  const remoteVersion = (await getScheduleVersion(env)) ?? "";

  if (s_cached && s_cached.version === remoteVersion) {
    return s_cached.baseline;
  }

  const schedule = (await getSchedule(env)) ?? buildSampleSchedule();
  const baseline = buildBaseline(schedule);
  s_cached = { version: remoteVersion, baseline };
  console.log(`[refresh-live] baseline rebuilt for version=${remoteVersion}`);
  return baseline;
}

export async function handleRefreshLive(env: Env): Promise<void> {
  const baseline = await getCached(env);

  let liveByTripId;
  try {
    liveByTripId = await fetchTripUpdates(baseline.allowedTripIds);
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    liveByTripId = new Map();
  }

  const json = applyLive(baseline, liveByTripId);
  await writeArrivals(env, json);

  console.log("[refresh-live] done");
}
