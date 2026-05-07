import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { patchLive } from "../live/merge.js";

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  let tripStatus: Map<number, number>;
  let stopOverrides: Map<number, number>;
  let previous: Uint8Array | null;
  try {
    [{ tripStatus, stopOverrides }, previous] = await Promise.all([
      fetchTripUpdates(),
      getArrivalsBin(env),
    ]);
  } catch (err) {
    console.error("[refresh-live] fetch failed:", err);
    tripStatus = new Map();
    stopOverrides = new Map();
    previous = null;
  }
  ctx.waitUntil(writeArrivalsBin(env, patchLive(tripStatus, stopOverrides, previous)));
}
