import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../binary/r2.js";
import { putArrivalsBinInCache } from "../binary/cache.js";
import { getCachedOutput, setCachedOutput } from "../binary/module-cache.js";
import { fetchTripUpdates } from "../live/fetch.js";
import { patchLive } from "../live/patch.js";
import { fingerprint } from "../binary/fingerprint.js";

let lastFingerprint = -1;

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  const tStart = Date.now();
  const [result, previous] = await Promise.all([
    fetchTripUpdates(),
    getCachedOutput()
      ? Promise.resolve(getCachedOutput())
      : getArrivalsBin(env).catch((err: unknown) => {
          console.error("[refresh] R2 read failed:", err);
          return null;
        }),
  ]);
  const tFetched = Date.now();

  if (!result.fresh) {
    console.log("[refresh] 304 or stale, skipped");
    return;
  }

  const { tripStatus, stopOverrides } = result.data;
  const out = patchLive(tripStatus, stopOverrides, previous);
  setCachedOutput(out);
  const tPatched = Date.now();

  let stopsCount = 0;
  for (const m of stopOverrides.values()) stopsCount += m.size;

  const fp = fingerprint(out);
  const changed = fp !== lastFingerprint;
  lastFingerprint = fp;

  console.log(
    `[refresh] trips=${tripStatus.size} stops=${stopsCount} fetch=${tFetched - tStart}ms decode=${result.decodeMs}ms patch=${tPatched - tFetched}ms changed=${changed}`,
  );

  if (changed) {
    ctx.waitUntil(writeArrivalsBin(env, out));
    putArrivalsBinInCache(ctx, out);
  }
}
