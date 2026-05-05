import type { Env } from "../types.js";
import { getScheduleVersion } from "../kv.js";
import { writeArrivalsBin, writeStationsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { applyLive } from "../live/merge.js";

export async function handleRefreshLive(env: Env): Promise<void> {
  const remoteVersion = (await getScheduleVersion(env)) ?? "";
  
  // Fetch binary baseline from KV
  const baselineBin = await env.SCHEDULE_KV.get("baseline:bin", { type: "arrayBuffer" });
  if (!baselineBin) {
    console.error("[refresh-live] baseline:bin not found in KV");
    return;
  }

  const allowedTripIds = new Set<string>(); // Worker no longer needs tripId list for fetch
  // Optimization: we could store allowedTripIds in KV as well to filter GTFS-RT fetch,
  // but for now let's just fetch all.

  let liveByTripId;
  try {
    liveByTripId = await fetchTripUpdates();
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    liveByTripId = new Map();
  }

  const bin = applyLive(new Uint8Array(baselineBin), liveByTripId);
  await writeArrivalsBin(env, bin);

  // Periodically sync stations.bin from KV to R2
  // For now, let's just do it every tick or based on a version change
  const stationsBin = await env.SCHEDULE_KV.get("stations:bin", { type: "arrayBuffer" });
  if (stationsBin) {
    await writeStationsBin(env, new Uint8Array(stationsBin));
  }

  console.log(`[refresh-live] done (v=${remoteVersion})`);
}
