import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../r2.js";
import { fetchTripUpdates } from "../live/tripupdate.js";
import { patchLive } from "../live/merge.js";
import { TRIP_OFFSETS, STOP_OFFSETS } from "../template.generated.js";

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  const [tripData, previous] = await Promise.all([
    fetchTripUpdates(),
    getArrivalsBin(env).catch(err => {
      console.error("[refresh-live] R2 read failed:", err);
      return null;
    }),
  ]);
  const { tripStatus, stopOverrides } = tripData;
  let tripHits = 0;
  for (const k of tripStatus.keys()) if (TRIP_OFFSETS.has(k)) tripHits++;
  let stopHits = 0;
  for (const k of stopOverrides.keys()) if (STOP_OFFSETS.has(k)) stopHits++;
  console.log(`[refresh-live] trip=${tripStatus.size}(${tripHits} hit) stop=${stopOverrides.size}(${stopHits} hit) prev=${previous?.length ?? 0}`);
  ctx.waitUntil(writeArrivalsBin(env, patchLive(tripStatus, stopOverrides, previous)));
}
