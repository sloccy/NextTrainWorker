import type { Env } from "../types.js";
import { writeArrivalsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { applyLive } from "../live/merge.js";
import { BASELINE_BYTES } from "../baseline.generated.js";

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  let live;
  try {
    live = await fetchTripUpdates();
  } catch (err) {
    console.error("[refresh-live] GTFS-RT fetch failed:", err);
    live = new Map<number, number>();
  }

  const bin = applyLive(BASELINE_BYTES, live);
  ctx.waitUntil(writeArrivalsBin(env, bin));
}
