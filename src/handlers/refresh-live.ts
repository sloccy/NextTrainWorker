import type { Env } from "../types.js";
import { writeArrivalsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { patchLive } from "../live/merge.js";

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  let tripStatus: Map<number, number>;
  let stopOverrides: Map<number, number>;
  let fresh: boolean;
  try {
    ({ tripStatus, stopOverrides, fresh } = await fetchTripUpdates());
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    tripStatus = new Map();
    stopOverrides = new Map();
    fresh = true;
  }
  if (fresh) ctx.waitUntil(writeArrivalsBin(env, patchLive(tripStatus, stopOverrides)));
}
