import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { patchLive } from "../live/merge.js";

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  const [tripData, previous] = await Promise.all([
    fetchTripUpdates(),
    getArrivalsBin(env).catch(err => {
      console.error("[refresh-live] R2 read failed:", err);
      return null;
    }),
  ]);
  const { tripStatus, stopOverrides } = tripData;
  console.log(`[refresh-live] trip=${tripStatus.size} stop=${stopOverrides.size} prev=${previous?.length ?? 0}`);
  ctx.waitUntil(writeArrivalsBin(env, patchLive(tripStatus, stopOverrides, previous)));
}
