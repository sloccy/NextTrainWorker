import type { Env } from "../types.js";
import { writeArrivalsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { patchLive } from "../live/merge.js";

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  let live;
  try {
    live = await fetchTripUpdates();
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    live = new Map<number, number>();
  }
  ctx.waitUntil(writeArrivalsBin(env, patchLive(live)));
}
