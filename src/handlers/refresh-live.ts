import type { Env } from "../types.js";
import { getSchedule, getScheduleVersion } from "../kv.js";
import { writeArrivalsBin, writeStationsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { buildBaseline, applyLive, type Baseline } from "../live/merge.js";
import { buildSampleSchedule } from "../live/sample-schedule.js";

interface CachedBaseline {
  version: string;
  baseline: Baseline;
}

let s_cached: CachedBaseline | null = null;

export async function handleRefreshLive(env: Env): Promise<void> {
  const remoteVersion = (await getScheduleVersion(env)) ?? "";
  let baselineJustRebuilt = false;
  let baseline: Baseline;

  if (s_cached && s_cached.version === remoteVersion) {
    baseline = s_cached.baseline;
  } else {
    const schedule = (await getSchedule(env)) ?? buildSampleSchedule();
    baseline = buildBaseline(schedule);
    s_cached = { version: remoteVersion, baseline };
    baselineJustRebuilt = true;
    console.log(`[refresh-live] baseline rebuilt for version=${remoteVersion}`);
  }

  let liveByTripId;
  try {
    liveByTripId = await fetchTripUpdates(baseline.allowedTripIds);
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    liveByTripId = new Map();
  }

  const bin = applyLive(baseline, liveByTripId);
  await writeArrivalsBin(env, bin);

  if (baselineJustRebuilt) {
    await writeStationsBin(env, baseline.stationsBin);
  }

  console.log("[refresh-live] done");
}
